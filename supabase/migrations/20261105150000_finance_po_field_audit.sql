-- Master PO At Glance — field audit trail.
-- Append-only history of who changed which PO field, and when.
-- Department save functions are not modified. Logging is an after-the-fact trigger
-- that cannot block a save: a logging error is recorded as a warning and the PO change still commits.

CREATE TABLE IF NOT EXISTS public.finance_po_field_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department text NOT NULL CHECK (department IN ('iev', 'maintenance', 'projects', 'rm')),
  po_id uuid NOT NULL,
  field_key text NOT NULL,
  field_label text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_po_field_history_po
  ON public.finance_po_field_history (department, po_id, changed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.finance_po_audit_baseline (
  department text NOT NULL CHECK (department IN ('iev', 'maintenance', 'projects', 'rm')),
  po_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY (department, po_id)
);

COMMENT ON TABLE public.finance_po_field_history IS
  'Who changed which PO At Glance field, from what, to what, and when. Read from Master PO At Glance.';
COMMENT ON TABLE public.finance_po_audit_baseline IS
  'Last compared snapshot so unchanged re-saves are not written as history.';

CREATE OR REPLACE FUNCTION public.finance_po_num_text(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    ELSE NULLIF(
      regexp_replace(
        regexp_replace(trim(to_char(p, 'FM999999999999990.000')), '\.$', ''),
        '(\.\d*?)0+$',
        '\1'
      ),
      ''
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_json_display(p_key text, p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_value) = 'boolean' THEN
    RETURN CASE WHEN p_value = 'true'::jsonb THEN 'Yes' ELSE 'No' END;
  END IF;
  IF jsonb_typeof(p_value) = 'number' THEN
    RETURN public.finance_po_num_text((p_value #>> '{}')::numeric);
  END IF;
  v := nullif(btrim(p_value #>> '{}'), '');
  IF v IS NOT NULL AND p_key IN ('oc_date', 'po_date', 'delivery_date', 'remarks_date') AND v ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN to_char(v::date, 'DD Mon YYYY');
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_field_label(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_key
    WHEN 'oc_no' THEN 'OC Number'
    WHEN 'oc_date' THEN 'OC date'
    WHEN 'cost_center_tally' THEN 'Cost center (Tally)'
    WHEN 'client_name' THEN 'Client'
    WHEN 'client_address' THEN 'Client address'
    WHEN 'is_sez' THEN 'SEZ'
    WHEN 'po_wo_no' THEN 'PO/WO No.'
    WHEN 'po_date' THEN 'PO date'
    WHEN 'project_description' THEN 'Project description'
    WHEN 'duration_of_job' THEN 'Duration of job'
    WHEN 'no_of_fire_tenders' THEN 'No. of fire tenders'
    WHEN 'delivery_date' THEN 'Delivery date'
    WHEN 'contract_value' THEN 'PO amount'
    WHEN 'currency' THEN 'Currency'
    WHEN 'gst_pct' THEN 'GST %'
    WHEN 'payment_terms' THEN 'Payment terms'
    WHEN 'rto_insurance' THEN 'RTO / insurance'
    WHEN 'other_information' THEN 'Other information'
    WHEN 'remarks' THEN 'Remarks'
    WHEN 'remarks_date' THEN 'Remarks date'
    WHEN 'security.SD' THEN 'Security deposit'
    WHEN 'security.ABG' THEN 'Advance bank guarantee'
    WHEN 'security.PBG' THEN 'Performance bank guarantee'
    WHEN 'condition.EMD' THEN 'EMD'
    WHEN 'condition.DLP' THEN 'Defect liability period'
    WHEN 'condition.WARRANTY' THEN 'Warranty'
    WHEN 'penalty' THEN 'LD / Penalty'
    WHEN 'milestones' THEN 'Payment milestones'
    WHEN 'contacts' THEN 'Customer contacts'
    WHEN 'sign.SALES' THEN 'Sales & Commercial signature'
    WHEN 'sign.PLANNING' THEN 'Planning Department signature'
    WHEN 'sign.IEV_HEAD' THEN 'Group Head or IEV Head signature'
    WHEN 'sign.MM_USER' THEN 'User (M&M Dept.) signature'
    WHEN 'sign.RM_USER' THEN 'User (R&M Dept.) signature'
    WHEN 'sign.PROJECT_USER' THEN 'User (Project Dept.) signature'
    WHEN 'sign.VERTICAL_HEAD' THEN 'Vertical Head signature'
    WHEN 'sign.FINANCE' THEN 'Finance Department signature'
    WHEN '__created__' THEN 'Record'
    ELSE replace(initcap(replace(coalesce(p_key, ''), '_', ' ')), ' Id', ' ID')
  END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_actor_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'System';
  END IF;
  SELECT nullif(btrim(m.full_name), '')
    INTO v_name
    FROM public.admin_ifsp_employee_master m
   WHERE m.user_id = v_uid
   ORDER BY CASE WHEN lower(coalesce(m.status, '')) = 'active' THEN 0 ELSE 1 END, m.id
   LIMIT 1;
  IF v_name IS NOT NULL THEN
    RETURN v_name;
  END IF;
  SELECT coalesce(nullif(btrim(p.username), ''), nullif(btrim(p.email), ''))
    INTO v_name
    FROM public.profiles p
   WHERE p.id = v_uid;
  RETURN coalesce(v_name, 'Unknown user');
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_snapshot(p_department text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_prefix text;
  v_row jsonb;
  v_snap jsonb := '{}'::jsonb;
  v_key text;
  v_header text[] := ARRAY[
    'oc_no', 'oc_date', 'cost_center_tally', 'client_name', 'client_address', 'is_sez',
    'po_wo_no', 'po_date', 'project_description', 'duration_of_job', 'no_of_fire_tenders',
    'delivery_date', 'contract_value', 'currency', 'gst_pct', 'payment_terms',
    'rto_insurance', 'other_information', 'remarks', 'remarks_date'
  ];
  v_extra jsonb;
BEGIN
  v_prefix := CASE p_department
    WHEN 'iev' THEN 'oc'
    WHEN 'maintenance' THEN 'mm_oc'
    WHEN 'projects' THEN 'pj_oc'
    WHEN 'rm' THEN 'rm_oc'
    ELSE NULL
  END;
  IF v_prefix IS NULL OR p_id IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', v_prefix || '_master')
    INTO v_row USING p_id;
  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY v_header LOOP
    IF p_department <> 'iev' AND v_key = 'no_of_fire_tenders' THEN
      CONTINUE;
    END IF;
    v_snap := v_snap || jsonb_build_object(v_key, to_jsonb(public.finance_po_json_display(v_key, v_row -> v_key)));
  END LOOP;

  EXECUTE format($q$
    SELECT coalesce(jsonb_object_agg('security.' || type, to_jsonb(descr)), '{}'::jsonb)
    FROM (
      SELECT type,
        nullif(concat_ws('; ',
          CASE WHEN applicable IS TRUE THEN 'Applicable: Yes' WHEN applicable IS FALSE THEN 'Applicable: No' END,
          CASE WHEN pct IS NOT NULL THEN 'Percent: ' || public.finance_po_num_text(pct) END,
          CASE WHEN due_days IS NOT NULL THEN 'Due in ' || due_days::text || ' days' END,
          CASE WHEN nullif(btrim(validity_text), '') IS NOT NULL THEN 'Validity: ' || btrim(validity_text) END
        ), '') AS descr
      FROM public.%I
      WHERE oc_id = $1
    ) s
  $q$, v_prefix || '_security_items')
    INTO v_extra USING p_id;
  v_snap := v_snap || coalesce(v_extra, '{}'::jsonb);

  EXECUTE format($q$
    SELECT coalesce(jsonb_object_agg('condition.' || key, to_jsonb(descr)), '{}'::jsonb)
    FROM (
      SELECT key,
        nullif(concat_ws('; ',
          CASE WHEN enabled IS TRUE THEN 'Yes' WHEN enabled IS FALSE THEN 'No' END,
          CASE WHEN nullif(btrim(detail_text), '') IS NOT NULL THEN btrim(detail_text) END,
          CASE
            WHEN release_or_adjust = 'RELEASE' THEN 'Release'
              || CASE WHEN release_date IS NOT NULL THEN ' on ' || to_char(release_date, 'DD Mon YYYY') ELSE '' END
            WHEN release_or_adjust = 'ADJUST_SD' THEN 'Adjust against security deposit'
          END
        ), '') AS descr
      FROM public.%I
      WHERE oc_id = $1
    ) s
  $q$, v_prefix || '_fixed_conditions')
    INTO v_extra USING p_id;
  v_snap := v_snap || coalesce(v_extra, '{}'::jsonb);

  EXECUTE format($q$
    SELECT to_jsonb(nullif(concat_ws('; ',
      CASE WHEN enabled IS TRUE THEN 'Yes' WHEN enabled IS FALSE THEN 'No' END,
      CASE WHEN rate IS NOT NULL THEN 'Rate: ' || public.finance_po_num_text(rate) END,
      CASE period_unit
        WHEN 'DAY' THEN 'Per day'
        WHEN 'WEEK' THEN 'Per week'
        WHEN 'MONTH' THEN 'Per month'
      END,
      CASE WHEN cap_percent IS NOT NULL THEN 'Cap: ' || public.finance_po_num_text(cap_percent) || '%%' END,
      CASE WHEN nullif(btrim(applicable_from_text), '') IS NOT NULL THEN 'From: ' || btrim(applicable_from_text) END
    ), ''))
    FROM public.%I
    WHERE oc_id = $1
  $q$, v_prefix || '_penalty')
    INTO v_extra USING p_id;
  v_snap := v_snap || jsonb_build_object('penalty', coalesce(v_extra, 'null'::jsonb));

  EXECUTE format($q$
    SELECT to_jsonb(nullif(string_agg(
      concat_ws(' — ',
        public.finance_po_num_text(percent) || '%%',
        nullif(btrim(coalesce(trigger, '')), ''),
        CASE WHEN due_days IS NOT NULL THEN 'due in ' || due_days::text || ' days' END,
        nullif(btrim(coalesce(notes, '')), '')
      ),
      E'\n' ORDER BY seq, id
    ), ''))
    FROM public.%I
    WHERE oc_id = $1
  $q$, v_prefix || '_payment_milestones')
    INTO v_extra USING p_id;
  v_snap := v_snap || jsonb_build_object('milestones', coalesce(v_extra, 'null'::jsonb));

  EXECUTE format($q$
    SELECT to_jsonb(nullif(string_agg(
      concat_ws(' · ',
        nullif(btrim(coalesce(department, '')), ''),
        nullif(btrim(coalesce(names, '')), ''),
        nullif(array_to_string(mobiles, ', '), ''),
        nullif(array_to_string(emails, ', '), '')
      ),
      E'\n' ORDER BY seq, id
    ), ''))
    FROM public.%I
    WHERE oc_id = $1
  $q$, v_prefix || '_contacts')
    INTO v_extra USING p_id;
  v_snap := v_snap || jsonb_build_object('contacts', coalesce(v_extra, 'null'::jsonb));

  EXECUTE format($q$
    SELECT coalesce(jsonb_object_agg('sign.' || slot, to_jsonb(nullif(btrim(signed_by), ''))), '{}'::jsonb)
    FROM public.%I
    WHERE oc_id = $1
  $q$, v_prefix || '_signoff')
    INTO v_extra USING p_id;
  v_snap := v_snap || coalesce(v_extra, '{}'::jsonb);

  RETURN v_snap;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_capture_audit(p_department text, p_id uuid, p_created boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_new jsonb;
  v_old jsonb;
  v_key text;
  v_old_val text;
  v_new_val text;
  v_actor uuid := auth.uid();
  v_actor_name text := public.finance_po_actor_name();
  v_at timestamptz := now();
BEGIN
  IF p_department IS NULL OR p_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('finance_po_audit'), hashtext(p_department || ':' || p_id::text));

  v_new := public.finance_po_snapshot(p_department, p_id);
  IF v_new IS NULL THEN
    DELETE FROM public.finance_po_audit_baseline WHERE department = p_department AND po_id = p_id;
    RETURN;
  END IF;

  SELECT snapshot INTO v_old
    FROM public.finance_po_audit_baseline
   WHERE department = p_department AND po_id = p_id
   FOR UPDATE;

  IF v_old IS NULL THEN
    IF p_created THEN
      INSERT INTO public.finance_po_field_history (
        department, po_id, field_key, field_label, old_value, new_value, changed_by, changed_by_name, changed_at
      ) VALUES (
        p_department, p_id, '__created__', 'Record', NULL, 'Created', v_actor, v_actor_name, v_at
      );
    END IF;
    INSERT INTO public.finance_po_audit_baseline (department, po_id, snapshot)
    VALUES (p_department, p_id, v_new);
    RETURN;
  END IF;

  IF v_old = v_new THEN
    RETURN;
  END IF;

  FOR v_key IN
    SELECT DISTINCT k
    FROM (
      SELECT jsonb_object_keys(v_old) AS k
      UNION
      SELECT jsonb_object_keys(v_new) AS k
    ) keys
  LOOP
    v_old_val := nullif(btrim(coalesce(v_old ->> v_key, '')), '');
    v_new_val := nullif(btrim(coalesce(v_new ->> v_key, '')), '');
    IF v_old_val IS NOT DISTINCT FROM v_new_val THEN
      CONTINUE;
    END IF;
    INSERT INTO public.finance_po_field_history (
      department, po_id, field_key, field_label, old_value, new_value, changed_by, changed_by_name, changed_at
    ) VALUES (
      p_department, p_id, v_key, public.finance_po_field_label(v_key), v_old_val, v_new_val, v_actor, v_actor_name, v_at
    );
  END LOOP;

  UPDATE public.finance_po_audit_baseline
     SET snapshot = v_new
   WHERE department = p_department AND po_id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_audit_defer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_dept text;
  v_id uuid;
  v_created boolean := false;
BEGIN
  v_dept := CASE TG_TABLE_NAME
    WHEN 'oc_master' THEN 'iev'
    WHEN 'oc_signoff' THEN 'iev'
    WHEN 'mm_oc_master' THEN 'maintenance'
    WHEN 'mm_oc_signoff' THEN 'maintenance'
    WHEN 'pj_oc_master' THEN 'projects'
    WHEN 'pj_oc_signoff' THEN 'projects'
    WHEN 'rm_oc_master' THEN 'rm'
    WHEN 'rm_oc_signoff' THEN 'rm'
    ELSE NULL
  END;
  IF v_dept IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME LIKE '%master' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    v_id := NEW.id;
    v_created := TG_OP = 'INSERT';
  ELSE
    v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.oc_id ELSE NEW.oc_id END;
  END IF;

  BEGIN
    PERFORM public.finance_po_capture_audit(v_dept, v_id, v_created);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'PO audit trail skipped for % %: %', v_dept, v_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- Current POs are the baseline. History starts with the next change, plus OC Number edits already logged.
INSERT INTO public.finance_po_audit_baseline (department, po_id, snapshot)
SELECT 'iev', id, public.finance_po_snapshot('iev', id) FROM public.oc_master
ON CONFLICT (department, po_id) DO UPDATE SET snapshot = EXCLUDED.snapshot;

INSERT INTO public.finance_po_audit_baseline (department, po_id, snapshot)
SELECT 'maintenance', id, public.finance_po_snapshot('maintenance', id) FROM public.mm_oc_master
ON CONFLICT (department, po_id) DO UPDATE SET snapshot = EXCLUDED.snapshot;

INSERT INTO public.finance_po_audit_baseline (department, po_id, snapshot)
SELECT 'projects', id, public.finance_po_snapshot('projects', id) FROM public.pj_oc_master
ON CONFLICT (department, po_id) DO UPDATE SET snapshot = EXCLUDED.snapshot;

INSERT INTO public.finance_po_audit_baseline (department, po_id, snapshot)
SELECT 'rm', id, public.finance_po_snapshot('rm', id) FROM public.rm_oc_master
ON CONFLICT (department, po_id) DO UPDATE SET snapshot = EXCLUDED.snapshot;

INSERT INTO public.finance_po_field_history (
  department, po_id, field_key, field_label, old_value, new_value, changed_by, changed_by_name, changed_at
)
SELECT a.department, a.po_id, 'oc_no', 'OC Number',
       nullif(btrim(a.old_oc_no), ''), nullif(btrim(a.new_oc_no), ''),
       a.changed_by, a.changed_by_name, a.changed_at
  FROM public.finance_oc_no_audit a
 WHERE nullif(btrim(a.old_oc_no), '') IS DISTINCT FROM nullif(btrim(a.new_oc_no), '')
   AND NOT EXISTS (
     SELECT 1 FROM public.finance_po_field_history h
      WHERE h.department = a.department AND h.po_id = a.po_id AND h.field_key = 'oc_no'
        AND h.changed_at = a.changed_at
        AND h.old_value IS NOT DISTINCT FROM nullif(btrim(a.old_oc_no), '')
        AND h.new_value IS NOT DISTINCT FROM nullif(btrim(a.new_oc_no), '')
   );

INSERT INTO public.finance_po_field_history (
  department, po_id, field_key, field_label, old_value, new_value, changed_by, changed_by_name, changed_at
)
SELECT a.department, a.po_id, 'oc_date', 'OC date',
       to_char(a.old_oc_date, 'DD Mon YYYY'), to_char(a.new_oc_date, 'DD Mon YYYY'),
       a.changed_by, a.changed_by_name, a.changed_at
  FROM public.finance_oc_no_audit a
 WHERE a.old_oc_date IS DISTINCT FROM a.new_oc_date
   AND NOT EXISTS (
     SELECT 1 FROM public.finance_po_field_history h
      WHERE h.department = a.department AND h.po_id = a.po_id AND h.field_key = 'oc_date'
        AND h.changed_at = a.changed_at
   );

DO $do$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'oc_master', 'mm_oc_master', 'pj_oc_master', 'rm_oc_master'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_finance_po_audit ON public.%I', v_table);
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER trg_finance_po_audit AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finance_po_audit_defer()',
      v_table
    );
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'oc_signoff', 'mm_oc_signoff', 'pj_oc_signoff', 'rm_oc_signoff'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_finance_po_audit_sign ON public.%I', v_table);
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER trg_finance_po_audit_sign AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finance_po_audit_defer()',
      v_table
    );
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION public.finance_po_field_history(p_department text, p_id uuid)
RETURNS TABLE (
  id bigint,
  department text,
  po_id uuid,
  field_key text,
  field_label text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.finance_po_current_user_has_master_access() THEN
    RAISE EXCEPTION 'You do not have access to Master PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_department NOT IN ('iev', 'maintenance', 'projects', 'rm') OR p_id IS NULL THEN
    RAISE EXCEPTION 'Choose a PO to see its history.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT h.id, h.department, h.po_id, h.field_key, h.field_label, h.old_value, h.new_value,
         h.changed_by, h.changed_by_name, h.changed_at
    FROM public.finance_po_field_history h
   WHERE h.department = p_department AND h.po_id = p_id
   ORDER BY h.changed_at DESC, h.id DESC;
END;
$$;

ALTER TABLE public.finance_po_field_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_po_audit_baseline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_po_field_history_select ON public.finance_po_field_history;
CREATE POLICY finance_po_field_history_select ON public.finance_po_field_history
  FOR SELECT TO authenticated
  USING (public.finance_po_current_user_has_master_access());

REVOKE ALL ON TABLE public.finance_po_field_history FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.finance_po_audit_baseline FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.finance_po_field_history TO authenticated;
GRANT ALL ON TABLE public.finance_po_field_history TO service_role;
GRANT ALL ON TABLE public.finance_po_audit_baseline TO service_role;

REVOKE ALL ON FUNCTION public.finance_po_field_history(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_po_field_history(text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

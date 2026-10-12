-- IEV PO At Glance: only the Finance Department fills the OC No.
-- Run after 20261012120000, 20261012150000, 20261012170000 and 20261012180000.
--
-- * OC No. may be left empty when the entry is created; Finance fills it later.
-- * Filling or changing the OC No. is allowed only for a Finance Department person (Super Admins too):
--   profile team "Finance" / "Finance/Accounts", or an active Employee Master record in a Finance
--   department (matched by employee code or login). Checked in the header trigger, so it applies to
--   every save path.
-- * OC numbers must still be unique.
-- Rollback: supabase/rollbacks/20261012190000_iev_oc_finance_oc_no_down.sql

CREATE OR REPLACE FUNCTION public.oc_current_user_is_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        regexp_replace(lower(btrim(COALESCE(p.role, ''))), '[\s-]+', '_', 'g') IN ('super_admin', 'super_admin_pro')
        OR lower(btrim(COALESCE(p.team, ''))) LIKE 'finance%'
        OR EXISTS (
          SELECT 1 FROM public.admin_ifsp_employee_master e
          WHERE e.status = 'Active'
            AND lower(btrim(COALESCE(e.department, ''))) LIKE 'finance%'
            AND (
              (NULLIF(btrim(p.employee_code), '') IS NOT NULL AND btrim(e.employee_code) = btrim(p.employee_code))
              OR e.user_id = p.id
            )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.oc_current_user_is_finance() IS
  'PO At Glance: true for Finance Department people (profile team or Employee Master department) and Super Admins.';

ALTER TABLE public.oc_master ALTER COLUMN oc_no DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.oc_master_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.oc_no := NULLIF(btrim(NEW.oc_no), '');
  IF auth.uid() IS NOT NULL
     AND ((TG_OP = 'INSERT' AND NEW.oc_no IS NOT NULL)
          OR (TG_OP = 'UPDATE' AND NEW.oc_no IS DISTINCT FROM OLD.oc_no))
     AND NOT public.oc_current_user_is_finance() THEN
    RAISE EXCEPTION 'Only the Finance Department can fill or change the OC No.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.oc_save(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(p ->> 'id', '')::uuid;
  v_oc_no text := public.oc_j_text(p, 'oc_no');
  v_po_date date := NULLIF(p ->> 'po_date', '')::date;
  v_delivery date := NULLIF(p ->> 'delivery_date', '')::date;
  v_value numeric := NULLIF(p ->> 'contract_value', '')::numeric;
  v_pen jsonb := COALESCE(p -> 'penalty', '{}'::jsonb);
  v_cond jsonb;
  v_total numeric;
  v_count integer;
  v_found uuid;
BEGIN
  IF NOT public.oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to IEV OC Creation.' USING ERRCODE = '42501';
  END IF;

  IF v_oc_no IS NOT NULL AND EXISTS (SELECT 1 FROM public.oc_master WHERE upper(oc_no) = upper(v_oc_no) AND id IS DISTINCT FROM v_id) THEN
    RAISE EXCEPTION 'OC No. % is already used. Enter a different number.', v_oc_no;
  END IF;
  IF public.oc_j_text(p, 'po_wo_no') IS NULL THEN RAISE EXCEPTION 'PO/WO No. is required.'; END IF;
  IF v_po_date IS NULL THEN RAISE EXCEPTION 'PO/WO date is required.'; END IF;
  IF public.oc_j_text(p, 'client_name') IS NULL THEN RAISE EXCEPTION 'Client name is required.'; END IF;
  IF public.oc_j_text(p, 'project_description') IS NULL THEN RAISE EXCEPTION 'Project description is required.'; END IF;
  IF v_value IS NULL THEN RAISE EXCEPTION 'Contract value is required.'; END IF;
  IF v_delivery IS NULL THEN RAISE EXCEPTION 'Delivery date is required.'; END IF;
  IF v_delivery <= v_po_date THEN RAISE EXCEPTION 'Delivery date must be after the PO/WO date.'; END IF;

  IF (v_pen ->> 'enabled')::boolean IS TRUE
     AND (NULLIF(v_pen ->> 'rate', '') IS NULL OR public.oc_j_text(v_pen, 'period_unit') IS NULL) THEN
    RAISE EXCEPTION 'LD / Penalty details (rate and period) are required when LD / Penalty is Yes.';
  END IF;

  FOR v_cond IN SELECT value FROM jsonb_array_elements(COALESCE(p -> 'fixed_conditions', '[]'::jsonb)) LOOP
    IF (v_cond ->> 'enabled')::boolean IS TRUE THEN
      IF v_cond ->> 'key' = 'EMD' THEN
        IF public.oc_j_text(v_cond, 'release_or_adjust') IS NULL THEN
          RAISE EXCEPTION 'EMD: choose a release date or adjust against SD.';
        END IF;
        IF v_cond ->> 'release_or_adjust' = 'RELEASE' AND NULLIF(v_cond ->> 'release_date', '') IS NULL THEN
          RAISE EXCEPTION 'EMD: release date is required.';
        END IF;
      ELSIF public.oc_j_text(v_cond, 'detail_text') IS NULL THEN
        RAISE EXCEPTION '% details are required when it is Yes.',
          CASE v_cond ->> 'key' WHEN 'DLP' THEN 'Defect Liability Period' ELSE 'Warranty' END;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*), COALESCE(sum(NULLIF(m ->> 'percent', '')::numeric), 0)
    INTO v_count, v_total
    FROM jsonb_array_elements(COALESCE(p -> 'payment_milestones', '[]'::jsonb)) m;
  IF v_count > 0 AND v_total <> 100 THEN
    RAISE EXCEPTION 'Payment milestones must total 100%% (currently %).', v_total;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.oc_master (
      oc_no, oc_date, cost_center_tally, client_name, client_address, is_sez, po_wo_no, po_date,
      project_description, duration_of_job, delivery_date, contract_value, currency, gst_pct,
      payment_terms, rto_insurance, other_information, remarks, remarks_date
    ) VALUES (
      v_oc_no, NULLIF(p ->> 'oc_date', '')::date, public.oc_j_text(p, 'cost_center_tally'),
      public.oc_j_text(p, 'client_name'), public.oc_j_text(p, 'client_address'), (p ->> 'is_sez')::boolean,
      public.oc_j_text(p, 'po_wo_no'), v_po_date, public.oc_j_text(p, 'project_description'),
      public.oc_j_text(p, 'duration_of_job'), v_delivery, v_value,
      COALESCE(public.oc_j_text(p, 'currency'), 'INR'), NULLIF(p ->> 'gst_pct', '')::numeric,
      public.oc_j_text(p, 'payment_terms'), public.oc_j_text(p, 'rto_insurance'),
      public.oc_j_text(p, 'other_information'), public.oc_j_text(p, 'remarks'), NULLIF(p ->> 'remarks_date', '')::date
    )
    RETURNING id, oc_no INTO v_id, v_oc_no;
  ELSE
    UPDATE public.oc_master SET
      oc_no = v_oc_no,
      oc_date = NULLIF(p ->> 'oc_date', '')::date,
      cost_center_tally = public.oc_j_text(p, 'cost_center_tally'),
      client_name = public.oc_j_text(p, 'client_name'),
      client_address = public.oc_j_text(p, 'client_address'),
      is_sez = (p ->> 'is_sez')::boolean,
      po_wo_no = public.oc_j_text(p, 'po_wo_no'),
      po_date = v_po_date,
      project_description = public.oc_j_text(p, 'project_description'),
      duration_of_job = public.oc_j_text(p, 'duration_of_job'),
      delivery_date = v_delivery,
      contract_value = v_value,
      currency = COALESCE(public.oc_j_text(p, 'currency'), 'INR'),
      gst_pct = NULLIF(p ->> 'gst_pct', '')::numeric,
      payment_terms = public.oc_j_text(p, 'payment_terms'),
      rto_insurance = public.oc_j_text(p, 'rto_insurance'),
      other_information = public.oc_j_text(p, 'other_information'),
      remarks = public.oc_j_text(p, 'remarks'),
      remarks_date = NULLIF(p ->> 'remarks_date', '')::date
    WHERE id = v_id
    RETURNING id, oc_no INTO v_found, v_oc_no;
    IF v_found IS NULL THEN RAISE EXCEPTION 'This PO At Glance no longer exists.'; END IF;
  END IF;

  DELETE FROM public.oc_security_items WHERE oc_id = v_id;
  INSERT INTO public.oc_security_items (oc_id, type, applicable, pct, due_days, validity_text, seq)
  SELECT v_id, x ->> 'type',
         CASE WHEN x ->> 'type' = 'SD' THEN (x ->> 'applicable')::boolean END,
         NULLIF(x ->> 'pct', '')::numeric, NULLIF(x ->> 'due_days', '')::integer,
         public.oc_j_text(x, 'validity_text'), t.ord::integer
  FROM jsonb_array_elements(COALESCE(p -> 'security_items', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.oc_fixed_conditions WHERE oc_id = v_id;
  INSERT INTO public.oc_fixed_conditions (oc_id, key, enabled, detail_text, release_or_adjust, release_date)
  SELECT v_id, x ->> 'key', (x ->> 'enabled')::boolean, public.oc_j_text(x, 'detail_text'),
         public.oc_j_text(x, 'release_or_adjust'), NULLIF(x ->> 'release_date', '')::date
  FROM jsonb_array_elements(COALESCE(p -> 'fixed_conditions', '[]'::jsonb)) x;

  DELETE FROM public.oc_penalty WHERE oc_id = v_id;
  INSERT INTO public.oc_penalty (oc_id, enabled, rate, period_unit, cap_percent, applicable_from_text)
  VALUES (v_id, (v_pen ->> 'enabled')::boolean, NULLIF(v_pen ->> 'rate', '')::numeric,
          public.oc_j_text(v_pen, 'period_unit'), NULLIF(v_pen ->> 'cap_percent', '')::numeric,
          public.oc_j_text(v_pen, 'applicable_from_text'));

  DELETE FROM public.oc_payment_milestones WHERE oc_id = v_id;
  INSERT INTO public.oc_payment_milestones (oc_id, seq, percent, trigger, due_days, notes)
  SELECT v_id, t.ord::integer, NULLIF(x ->> 'percent', '')::numeric, public.oc_j_text(x, 'trigger'),
         NULLIF(x ->> 'due_days', '')::integer, public.oc_j_text(x, 'notes')
  FROM jsonb_array_elements(COALESCE(p -> 'payment_milestones', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.oc_contacts WHERE oc_id = v_id;
  INSERT INTO public.oc_contacts (oc_id, seq, department, names, mobiles, emails)
  SELECT v_id, t.ord::integer, public.oc_j_text(x, 'department'), public.oc_j_text(x, 'names'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'mobiles', '[]'::jsonb))), '{}'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'emails', '[]'::jsonb))), '{}')
  FROM jsonb_array_elements(COALESCE(p -> 'contacts', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.oc_signoff o
  WHERE o.oc_id = v_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
      WHERE x ->> 'slot' = o.slot AND public.oc_j_text(x, 'signed_by') IS NOT NULL
    );
  UPDATE public.oc_signoff o SET signed_by = public.oc_j_text(x, 'signed_by')
  FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
  WHERE o.oc_id = v_id AND o.slot = x ->> 'slot'
    AND public.oc_j_text(x, 'signed_by') IS NOT NULL
    AND o.signed_by IS DISTINCT FROM public.oc_j_text(x, 'signed_by');
  INSERT INTO public.oc_signoff (oc_id, slot, signed_by)
  SELECT v_id, x ->> 'slot', public.oc_j_text(x, 'signed_by')
  FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
  WHERE public.oc_j_text(x, 'signed_by') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.oc_signoff o WHERE o.oc_id = v_id AND o.slot = x ->> 'slot');

  RETURN jsonb_build_object('id', v_id, 'oc_no', v_oc_no);
END;
$$;

REVOKE ALL ON FUNCTION public.oc_current_user_is_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_current_user_is_finance() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_master_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oc_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_save(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Commercial (Manpower / Training) — PO At Glance (additive only; nothing existing is altered).
--
-- An independent copy of the IEV PO At Glance workflow (oc_* tables, 20261012120000 …) with its own
-- records and sign-off assignment, laid out to the Commercial OC format (IFSPL/C&B/06, R-0):
--
--   * cm_oc_master            — header, manpower deployment, SD / EMD, terms (Commercial OC fields)
--   * cm_oc_contacts          — customer's contact details
--   * cm_oc_signoff           — digital sign-off per box
--   * cm_oc_signoff_assignees — who may sign each box (Commercial sign-off assignment)
--
-- Sign-off boxes: VP – Commercial Operations, then "WO/PO disseminated to concerned departments":
-- Billing, IR, Salary, Operations, Admin, P & C, Account, Arun Sir, Atin Sir. Signing works as in IEV:
-- only the assigned employee can sign a box; date and time are stamped on the server.
--
-- Access = Commercial: Super Admin, Commercial team, Commercial (commercialMt) or Sales module, or the
-- Commercial PO At Glance sub-item. OC No. is filled by Finance only (same rule as IEV).
-- The IEV helpers oc_j_text, oc_current_employee_code and oc_current_user_is_finance are reused as is
-- (read only). No IEV, Maintenance, Projects, R&M or Finance table or function is changed.
-- Rollback: supabase/rollbacks/20261116120000_commercial_po_at_glance_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cm_oc_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_no text CHECK (btrim(oc_no) <> '' AND char_length(oc_no) <= 80),
  oc_date date,
  cost_center_tally text,
  client_name text NOT NULL CHECK (btrim(client_name) <> ''),
  client_address text,
  is_sez boolean,
  po_wo_no text NOT NULL CHECK (btrim(po_wo_no) <> ''),
  po_date date NOT NULL,
  project_description text NOT NULL CHECK (btrim(project_description) <> ''),
  duration_text text,
  duration_from date,
  duration_to date,
  mobilization_date date,
  payment_terms text,
  gst_pct numeric(5, 2) CHECK (gst_pct BETWEEN 0 AND 100),
  gst_applicable boolean,
  contract_value numeric(16, 2) CHECK (contract_value >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  fs_count integer CHECK (fs_count >= 0),
  dcpo_count integer CHECK (dcpo_count >= 0),
  fcro_count integer CHECK (fcro_count >= 0),
  fireman_count integer CHECK (fireman_count >= 0),
  safety_supervisor_count integer CHECK (safety_supervisor_count >= 0),
  safety_steward_count integer CHECK (safety_steward_count >= 0),
  vehicle_count integer CHECK (vehicle_count >= 0),
  insurance text,
  minimum_wage_rate text,
  relievers_scope text,
  duty_pattern text,
  accommodation_transport text,
  sd_ra_applicable boolean,
  sd_ra_pct numeric(5, 2) CHECK (sd_ra_pct BETWEEN 0 AND 100),
  sd_release_period text,
  sd_pbg text,
  emd_details text,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_oc_master_duration_order CHECK (duration_to IS NULL OR duration_from IS NULL OR duration_to >= duration_from)
);
CREATE INDEX IF NOT EXISTS idx_cm_oc_master_created_at ON public.cm_oc_master (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_oc_master_oc_no ON public.cm_oc_master (upper(btrim(oc_no)));

CREATE TABLE IF NOT EXISTS public.cm_oc_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.cm_oc_master(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  department text,
  names text,
  mobiles text[] NOT NULL DEFAULT '{}',
  emails text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_cm_oc_contacts_oc ON public.cm_oc_contacts (oc_id, seq);

CREATE TABLE IF NOT EXISTS public.cm_oc_signoff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.cm_oc_master(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN (
    'VP_COMMERCIAL', 'BILLING', 'IR', 'SALARY', 'OPERATIONS', 'ADMIN', 'PNC', 'ACCOUNTS', 'ARUN', 'ATIN'
  )),
  signed_by text NOT NULL CHECK (btrim(signed_by) <> ''),
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_user_id uuid DEFAULT auth.uid(),
  UNIQUE (oc_id, slot)
);

CREATE TABLE IF NOT EXISTS public.cm_oc_signoff_assignees (
  slot text PRIMARY KEY CHECK (slot IN (
    'VP_COMMERCIAL', 'BILLING', 'IR', 'SALARY', 'OPERATIONS', 'ADMIN', 'PNC', 'ACCOUNTS', 'ARUN', 'ATIN'
  )),
  employee_code text NOT NULL CHECK (btrim(employee_code) <> ''),
  employee_name text NOT NULL,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_oc_current_user_has_access()
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
        OR regexp_replace(lower(btrim(COALESCE(p.team, ''))), '\s+', ' ', 'g') IN ('commercial', 'commercialmt')
        OR (
          jsonb_typeof(p.allowed_modules) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(p.allowed_modules) m(v)
            WHERE lower(btrim(m.v)) IN ('commercialmt', 'sales')
          )
        )
        OR (
          jsonb_typeof(p.allowed_sub_modules) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(p.allowed_sub_modules) s(v)
            WHERE lower(btrim(s.v)) IN ('commercialmt.po-at-glance')
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.cm_oc_current_user_has_access() IS
  'Commercial PO At Glance access: Commercial team, Commercial / Sales module, Commercial PO At Glance sub-item, or Super Admin.';

-- Commercial managers / admins and Super Admins maintain the sign-off assignment.
CREATE OR REPLACE FUNCTION public.cm_oc_current_user_can_configure()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.cm_oc_current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND regexp_replace(lower(btrim(COALESCE(p.role, ''))), '[\s-]+', '_', 'g')
            IN ('super_admin', 'super_admin_pro', 'admin', 'manager')
    );
$$;

CREATE OR REPLACE FUNCTION public.cm_oc_employee_options()
RETURNS TABLE (employee_code text, full_name text, department text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT btrim(e.employee_code), e.full_name, e.department
    FROM public.admin_ifsp_employee_master e
    WHERE e.status = 'Active' AND NULLIF(btrim(e.employee_code), '') IS NOT NULL
    ORDER BY e.full_name, e.employee_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- Header guard (Finance-only OC No., audit fields) and digital sign-off
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_oc_master_guard()
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

CREATE OR REPLACE FUNCTION public.cm_oc_assert_can_sign(p_slot text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.cm_oc_signoff_assignees%ROWTYPE;
  v_box text := CASE p_slot
    WHEN 'VP_COMMERCIAL' THEN 'VP – Commercial Operations'
    WHEN 'BILLING' THEN 'Billing Department'
    WHEN 'IR' THEN 'IR Department'
    WHEN 'SALARY' THEN 'Salary Department'
    WHEN 'OPERATIONS' THEN 'Operations Department'
    WHEN 'ADMIN' THEN 'Admin Department'
    WHEN 'PNC' THEN 'P & C Department'
    WHEN 'ACCOUNTS' THEN 'Account Department'
    WHEN 'ARUN' THEN 'Arun Sir'
    WHEN 'ATIN' THEN 'Atin Sir'
    ELSE p_slot END;
BEGIN
  SELECT * INTO v_a FROM public.cm_oc_signoff_assignees WHERE slot = p_slot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No one is assigned to sign the % box yet. Set it in Commercial → PO At Glance Sign-off Assignment.', v_box
      USING ERRCODE = '42501';
  END IF;
  IF lower(btrim(v_a.employee_code)) IS DISTINCT FROM lower(public.oc_current_employee_code()) THEN
    RAISE EXCEPTION 'Only % (%) can sign the % box.', v_a.employee_name, v_a.employee_code, v_box
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cm_oc_signoff_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.cm_oc_master m WHERE m.id = OLD.oc_id) THEN
      PERFORM public.cm_oc_assert_can_sign(OLD.slot);
    END IF;
    RETURN OLD;
  END IF;
  NEW.signed_by := btrim(NEW.signed_by);
  IF TG_OP = 'UPDATE' AND NEW.signed_by = OLD.signed_by AND NEW.slot = OLD.slot THEN
    NEW.signed_at := OLD.signed_at;
    NEW.signed_user_id := OLD.signed_user_id;
  ELSE
    PERFORM public.cm_oc_assert_can_sign(NEW.slot);
    NEW.signed_at := now();
    NEW.signed_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cm_oc_signoff_stamp ON public.cm_oc_signoff;
CREATE TRIGGER cm_oc_signoff_stamp
  BEFORE INSERT OR UPDATE OR DELETE ON public.cm_oc_signoff
  FOR EACH ROW EXECUTE FUNCTION public.cm_oc_signoff_stamp();

DROP TRIGGER IF EXISTS cm_oc_master_guard ON public.cm_oc_master;
CREATE TRIGGER cm_oc_master_guard
  BEFORE INSERT OR UPDATE ON public.cm_oc_master
  FOR EACH ROW EXECUTE FUNCTION public.cm_oc_master_guard();

-- ---------------------------------------------------------------------------
-- Save (header + contacts + sign-off in one transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_oc_save(p jsonb)
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
  v_from date := NULLIF(p ->> 'duration_from', '')::date;
  v_to date := NULLIF(p ->> 'duration_to', '')::date;
  v_found uuid;
BEGIN
  IF NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;

  IF v_oc_no IS NOT NULL AND EXISTS (SELECT 1 FROM public.cm_oc_master WHERE upper(oc_no) = upper(v_oc_no) AND id IS DISTINCT FROM v_id) THEN
    RAISE EXCEPTION 'OC No. % is already used. Enter a different number.', v_oc_no;
  END IF;
  IF public.oc_j_text(p, 'client_name') IS NULL THEN RAISE EXCEPTION 'Customer is required.'; END IF;
  IF public.oc_j_text(p, 'po_wo_no') IS NULL THEN RAISE EXCEPTION 'WO No. is required.'; END IF;
  IF v_po_date IS NULL THEN RAISE EXCEPTION 'WO date is required.'; END IF;
  IF public.oc_j_text(p, 'project_description') IS NULL THEN RAISE EXCEPTION 'Description of work is required.'; END IF;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from THEN
    RAISE EXCEPTION 'Duration "To" date must be on or after the "From" date.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.cm_oc_master (
      oc_no, oc_date, cost_center_tally, client_name, client_address, is_sez, po_wo_no, po_date,
      project_description, duration_text, duration_from, duration_to, mobilization_date, payment_terms,
      gst_pct, gst_applicable, contract_value, currency,
      fs_count, dcpo_count, fcro_count, fireman_count, safety_supervisor_count, safety_steward_count, vehicle_count,
      insurance, minimum_wage_rate, relievers_scope, duty_pattern, accommodation_transport,
      sd_ra_applicable, sd_ra_pct, sd_release_period, sd_pbg, emd_details, remarks
    ) VALUES (
      v_oc_no, NULLIF(p ->> 'oc_date', '')::date, public.oc_j_text(p, 'cost_center_tally'),
      public.oc_j_text(p, 'client_name'), public.oc_j_text(p, 'client_address'), (p ->> 'is_sez')::boolean,
      public.oc_j_text(p, 'po_wo_no'), v_po_date, public.oc_j_text(p, 'project_description'),
      public.oc_j_text(p, 'duration_text'), v_from, v_to, NULLIF(p ->> 'mobilization_date', '')::date,
      public.oc_j_text(p, 'payment_terms'),
      NULLIF(p ->> 'gst_pct', '')::numeric, (p ->> 'gst_applicable')::boolean,
      NULLIF(p ->> 'contract_value', '')::numeric, COALESCE(public.oc_j_text(p, 'currency'), 'INR'),
      NULLIF(p ->> 'fs_count', '')::integer, NULLIF(p ->> 'dcpo_count', '')::integer,
      NULLIF(p ->> 'fcro_count', '')::integer, NULLIF(p ->> 'fireman_count', '')::integer,
      NULLIF(p ->> 'safety_supervisor_count', '')::integer, NULLIF(p ->> 'safety_steward_count', '')::integer,
      NULLIF(p ->> 'vehicle_count', '')::integer,
      public.oc_j_text(p, 'insurance'), public.oc_j_text(p, 'minimum_wage_rate'),
      public.oc_j_text(p, 'relievers_scope'), public.oc_j_text(p, 'duty_pattern'),
      public.oc_j_text(p, 'accommodation_transport'),
      (p ->> 'sd_ra_applicable')::boolean, NULLIF(p ->> 'sd_ra_pct', '')::numeric,
      public.oc_j_text(p, 'sd_release_period'), public.oc_j_text(p, 'sd_pbg'),
      public.oc_j_text(p, 'emd_details'), public.oc_j_text(p, 'remarks')
    )
    RETURNING id, oc_no INTO v_id, v_oc_no;
  ELSE
    UPDATE public.cm_oc_master SET
      oc_no = v_oc_no,
      oc_date = NULLIF(p ->> 'oc_date', '')::date,
      cost_center_tally = public.oc_j_text(p, 'cost_center_tally'),
      client_name = public.oc_j_text(p, 'client_name'),
      client_address = public.oc_j_text(p, 'client_address'),
      is_sez = (p ->> 'is_sez')::boolean,
      po_wo_no = public.oc_j_text(p, 'po_wo_no'),
      po_date = v_po_date,
      project_description = public.oc_j_text(p, 'project_description'),
      duration_text = public.oc_j_text(p, 'duration_text'),
      duration_from = v_from,
      duration_to = v_to,
      mobilization_date = NULLIF(p ->> 'mobilization_date', '')::date,
      payment_terms = public.oc_j_text(p, 'payment_terms'),
      gst_pct = NULLIF(p ->> 'gst_pct', '')::numeric,
      gst_applicable = (p ->> 'gst_applicable')::boolean,
      contract_value = NULLIF(p ->> 'contract_value', '')::numeric,
      currency = COALESCE(public.oc_j_text(p, 'currency'), 'INR'),
      fs_count = NULLIF(p ->> 'fs_count', '')::integer,
      dcpo_count = NULLIF(p ->> 'dcpo_count', '')::integer,
      fcro_count = NULLIF(p ->> 'fcro_count', '')::integer,
      fireman_count = NULLIF(p ->> 'fireman_count', '')::integer,
      safety_supervisor_count = NULLIF(p ->> 'safety_supervisor_count', '')::integer,
      safety_steward_count = NULLIF(p ->> 'safety_steward_count', '')::integer,
      vehicle_count = NULLIF(p ->> 'vehicle_count', '')::integer,
      insurance = public.oc_j_text(p, 'insurance'),
      minimum_wage_rate = public.oc_j_text(p, 'minimum_wage_rate'),
      relievers_scope = public.oc_j_text(p, 'relievers_scope'),
      duty_pattern = public.oc_j_text(p, 'duty_pattern'),
      accommodation_transport = public.oc_j_text(p, 'accommodation_transport'),
      sd_ra_applicable = (p ->> 'sd_ra_applicable')::boolean,
      sd_ra_pct = NULLIF(p ->> 'sd_ra_pct', '')::numeric,
      sd_release_period = public.oc_j_text(p, 'sd_release_period'),
      sd_pbg = public.oc_j_text(p, 'sd_pbg'),
      emd_details = public.oc_j_text(p, 'emd_details'),
      remarks = public.oc_j_text(p, 'remarks')
    WHERE id = v_id
    RETURNING id, oc_no INTO v_found, v_oc_no;
    IF v_found IS NULL THEN RAISE EXCEPTION 'This PO At Glance no longer exists.'; END IF;
  END IF;

  DELETE FROM public.cm_oc_contacts WHERE oc_id = v_id;
  INSERT INTO public.cm_oc_contacts (oc_id, seq, department, names, mobiles, emails)
  SELECT v_id, t.ord::integer, public.oc_j_text(x, 'department'), public.oc_j_text(x, 'names'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'mobiles', '[]'::jsonb))), '{}'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'emails', '[]'::jsonb))), '{}')
  FROM jsonb_array_elements(COALESCE(p -> 'contacts', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.cm_oc_signoff o
  WHERE o.oc_id = v_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
      WHERE x ->> 'slot' = o.slot AND public.oc_j_text(x, 'signed_by') IS NOT NULL
    );
  UPDATE public.cm_oc_signoff o SET signed_by = public.oc_j_text(x, 'signed_by')
  FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
  WHERE o.oc_id = v_id AND o.slot = x ->> 'slot'
    AND public.oc_j_text(x, 'signed_by') IS NOT NULL
    AND o.signed_by IS DISTINCT FROM public.oc_j_text(x, 'signed_by');
  INSERT INTO public.cm_oc_signoff (oc_id, slot, signed_by)
  SELECT v_id, x ->> 'slot', public.oc_j_text(x, 'signed_by')
  FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
  WHERE public.oc_j_text(x, 'signed_by') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.cm_oc_signoff o WHERE o.oc_id = v_id AND o.slot = x ->> 'slot');

  RETURN jsonb_build_object('id', v_id, 'oc_no', v_oc_no);
END;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security (Commercial access)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cm_oc_master', 'cm_oc_contacts', 'cm_oc_signoff'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.cm_oc_current_user_has_access())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.cm_oc_current_user_has_access())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.cm_oc_current_user_has_access()) WITH CHECK (public.cm_oc_current_user_has_access())', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.cm_oc_current_user_has_access())', t || '_delete', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

ALTER TABLE public.cm_oc_signoff_assignees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cm_oc_signoff_assignees_select ON public.cm_oc_signoff_assignees;
CREATE POLICY cm_oc_signoff_assignees_select ON public.cm_oc_signoff_assignees FOR SELECT TO authenticated
  USING (public.cm_oc_current_user_has_access());
DROP POLICY IF EXISTS cm_oc_signoff_assignees_insert ON public.cm_oc_signoff_assignees;
CREATE POLICY cm_oc_signoff_assignees_insert ON public.cm_oc_signoff_assignees FOR INSERT TO authenticated
  WITH CHECK (public.cm_oc_current_user_can_configure());
DROP POLICY IF EXISTS cm_oc_signoff_assignees_update ON public.cm_oc_signoff_assignees;
CREATE POLICY cm_oc_signoff_assignees_update ON public.cm_oc_signoff_assignees FOR UPDATE TO authenticated
  USING (public.cm_oc_current_user_can_configure()) WITH CHECK (public.cm_oc_current_user_can_configure());
DROP POLICY IF EXISTS cm_oc_signoff_assignees_delete ON public.cm_oc_signoff_assignees;
CREATE POLICY cm_oc_signoff_assignees_delete ON public.cm_oc_signoff_assignees FOR DELETE TO authenticated
  USING (public.cm_oc_current_user_can_configure());
REVOKE ALL ON public.cm_oc_signoff_assignees FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cm_oc_signoff_assignees TO authenticated;
GRANT ALL ON public.cm_oc_signoff_assignees TO service_role;

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cm_oc_current_user_has_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cm_oc_current_user_can_configure() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cm_oc_employee_options() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cm_oc_assert_can_sign(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cm_oc_master_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cm_oc_signoff_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cm_oc_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cm_oc_current_user_has_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_current_user_can_configure() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_employee_options() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_save(jsonb) TO authenticated, service_role;

-- =============================================================================
-- Maintenance (M&M) — PO At Glance (additive only; nothing existing is altered).
--
-- A department copy of IEV PO At Glance (20261012120000 … 20261012190000) with its own records and
-- sign-off assignment, so Maintenance and IEV never share data or settings:
--
--   * mm_oc_master, mm_oc_security_items, mm_oc_fixed_conditions, mm_oc_penalty,
--     mm_oc_payment_milestones, mm_oc_contacts, mm_oc_signoff   — same columns and rules as oc_*
--   * mm_oc_signoff_assignees                                   — Maintenance sign-off assignment
--
-- Sign-off boxes follow the M&M format (IFSPL/M&M-OC/F&A/004): User (M&M Dept.), Vertical Head,
-- Finance Department. Signing works exactly as in IEV: an assigned box can only be signed, changed or
-- cleared by that employee's login; unassigned boxes cannot be signed; the server stamps date/time.
--
-- Access = Maintenance: Super Admin, Maintenance team, Maintenance module, or a Maintenance
-- PO At Glance / Dashboard sub-item. The IEV helpers oc_j_text, oc_current_employee_code and
-- oc_current_user_is_finance are reused as they are (they hold no IEV-specific rule).
-- Rollback: supabase/rollbacks/20261031120000_mm_oc_po_at_glance_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mm_oc_master (
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
  duration_of_job text,
  delivery_date date NOT NULL,
  contract_value numeric(16, 2) NOT NULL CHECK (contract_value >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  gst_pct numeric(5, 2) CHECK (gst_pct BETWEEN 0 AND 100),
  payment_terms text,
  rto_insurance text,
  other_information text,
  remarks text,
  remarks_date date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mm_oc_master_delivery_after_po CHECK (delivery_date > po_date)
);
CREATE INDEX IF NOT EXISTS idx_mm_oc_master_created_at ON public.mm_oc_master (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mm_oc_master_oc_no ON public.mm_oc_master (upper(btrim(oc_no)));

CREATE TABLE IF NOT EXISTS public.mm_oc_security_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.mm_oc_master(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('SD', 'ABG', 'PBG')),
  applicable boolean,
  pct numeric(5, 2) CHECK (pct BETWEEN 0 AND 100),
  due_days integer CHECK (due_days >= 0),
  validity_text text,
  seq integer NOT NULL DEFAULT 0,
  CONSTRAINT mm_oc_security_items_applicable_sd_only CHECK (type = 'SD' OR applicable IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_mm_oc_security_items_oc ON public.mm_oc_security_items (oc_id, seq);

CREATE TABLE IF NOT EXISTS public.mm_oc_fixed_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.mm_oc_master(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key IN ('EMD', 'DLP', 'WARRANTY')),
  enabled boolean,
  detail_text text,
  release_or_adjust text CHECK (release_or_adjust IN ('RELEASE', 'ADJUST_SD')),
  release_date date,
  UNIQUE (oc_id, key)
);

CREATE TABLE IF NOT EXISTS public.mm_oc_penalty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL UNIQUE REFERENCES public.mm_oc_master(id) ON DELETE CASCADE,
  enabled boolean,
  rate numeric(6, 3) CHECK (rate BETWEEN 0 AND 100),
  period_unit text CHECK (period_unit IN ('DAY', 'WEEK', 'MONTH')),
  cap_percent numeric(5, 2) CHECK (cap_percent BETWEEN 0 AND 100),
  applicable_from_text text
);

CREATE TABLE IF NOT EXISTS public.mm_oc_payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.mm_oc_master(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  percent numeric(5, 2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  trigger text,
  due_days integer CHECK (due_days >= 0),
  notes text
);
CREATE INDEX IF NOT EXISTS idx_mm_oc_payment_milestones_oc ON public.mm_oc_payment_milestones (oc_id, seq);

CREATE TABLE IF NOT EXISTS public.mm_oc_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.mm_oc_master(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  department text,
  names text,
  mobiles text[] NOT NULL DEFAULT '{}',
  emails text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_mm_oc_contacts_oc ON public.mm_oc_contacts (oc_id, seq);

CREATE TABLE IF NOT EXISTS public.mm_oc_signoff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_id uuid NOT NULL REFERENCES public.mm_oc_master(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN ('MM_USER', 'VERTICAL_HEAD', 'FINANCE')),
  signed_by text NOT NULL CHECK (btrim(signed_by) <> ''),
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_user_id uuid DEFAULT auth.uid(),
  UNIQUE (oc_id, slot)
);

CREATE TABLE IF NOT EXISTS public.mm_oc_signoff_assignees (
  slot text PRIMARY KEY CHECK (slot IN ('MM_USER', 'VERTICAL_HEAD', 'FINANCE')),
  employee_code text NOT NULL CHECK (btrim(employee_code) <> ''),
  employee_name text NOT NULL,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_oc_current_user_has_access()
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
        OR regexp_replace(lower(btrim(COALESCE(p.team, ''))), '\s+', ' ', 'g') IN ('maintenance', 'maintenance-ftc', 'maintenance ftc')
        OR (
          jsonb_typeof(p.allowed_modules) = 'array'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.allowed_modules) m(v) WHERE lower(btrim(m.v)) = 'maintenance')
        )
        OR (
          jsonb_typeof(p.allowed_sub_modules) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(p.allowed_sub_modules) s(v)
            WHERE lower(btrim(s.v)) IN ('maintenance.po-at-glance', 'maintenance.dashboard')
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.mm_oc_current_user_has_access() IS
  'Maintenance PO At Glance access: Maintenance team, Maintenance module, PO At Glance / Dashboard sub-item, or Super Admin.';

-- Maintenance managers / admins and Super Admins maintain the sign-off assignment.
CREATE OR REPLACE FUNCTION public.mm_oc_current_user_can_configure()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.mm_oc_current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND regexp_replace(lower(btrim(COALESCE(p.role, ''))), '[\s-]+', '_', 'g')
            IN ('super_admin', 'super_admin_pro', 'admin', 'manager')
    );
$$;

CREATE OR REPLACE FUNCTION public.mm_oc_employee_options()
RETURNS TABLE (employee_code text, full_name text, department text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.mm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Maintenance PO At Glance.' USING ERRCODE = '42501';
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
CREATE OR REPLACE FUNCTION public.mm_oc_master_guard()
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

CREATE OR REPLACE FUNCTION public.mm_oc_assert_can_sign(p_slot text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.mm_oc_signoff_assignees%ROWTYPE;
  v_box text := CASE p_slot WHEN 'MM_USER' THEN 'User (M&M Dept.)' WHEN 'VERTICAL_HEAD' THEN 'Vertical Head'
                            ELSE 'Finance Department' END;
BEGIN
  SELECT * INTO v_a FROM public.mm_oc_signoff_assignees WHERE slot = p_slot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No one is assigned to sign the % box yet. Set it in Maintenance → PO At Glance Sign-off Assignment.', v_box
      USING ERRCODE = '42501';
  END IF;
  IF lower(btrim(v_a.employee_code)) IS DISTINCT FROM lower(public.oc_current_employee_code()) THEN
    RAISE EXCEPTION 'Only % (%) can sign the % box.', v_a.employee_name, v_a.employee_code, v_box
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mm_oc_signoff_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.mm_oc_master m WHERE m.id = OLD.oc_id) THEN
      PERFORM public.mm_oc_assert_can_sign(OLD.slot);
    END IF;
    RETURN OLD;
  END IF;
  NEW.signed_by := btrim(NEW.signed_by);
  IF TG_OP = 'UPDATE' AND NEW.signed_by = OLD.signed_by AND NEW.slot = OLD.slot THEN
    NEW.signed_at := OLD.signed_at;
    NEW.signed_user_id := OLD.signed_user_id;
  ELSE
    PERFORM public.mm_oc_assert_can_sign(NEW.slot);
    NEW.signed_at := now();
    NEW.signed_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_oc_signoff_stamp ON public.mm_oc_signoff;
CREATE TRIGGER mm_oc_signoff_stamp
  BEFORE INSERT OR UPDATE OR DELETE ON public.mm_oc_signoff
  FOR EACH ROW EXECUTE FUNCTION public.mm_oc_signoff_stamp();

DROP TRIGGER IF EXISTS mm_oc_master_guard ON public.mm_oc_master;
CREATE TRIGGER mm_oc_master_guard
  BEFORE INSERT OR UPDATE ON public.mm_oc_master
  FOR EACH ROW EXECUTE FUNCTION public.mm_oc_master_guard();

-- ---------------------------------------------------------------------------
-- Save (header + all child rows in one transaction, same rules as public.oc_save)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mm_oc_save(p jsonb)
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
  IF NOT public.mm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Maintenance PO At Glance.' USING ERRCODE = '42501';
  END IF;

  IF v_oc_no IS NOT NULL AND EXISTS (SELECT 1 FROM public.mm_oc_master WHERE upper(oc_no) = upper(v_oc_no) AND id IS DISTINCT FROM v_id) THEN
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
    INSERT INTO public.mm_oc_master (
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
    UPDATE public.mm_oc_master SET
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

  DELETE FROM public.mm_oc_security_items WHERE oc_id = v_id;
  INSERT INTO public.mm_oc_security_items (oc_id, type, applicable, pct, due_days, validity_text, seq)
  SELECT v_id, x ->> 'type',
         CASE WHEN x ->> 'type' = 'SD' THEN (x ->> 'applicable')::boolean END,
         NULLIF(x ->> 'pct', '')::numeric, NULLIF(x ->> 'due_days', '')::integer,
         public.oc_j_text(x, 'validity_text'), t.ord::integer
  FROM jsonb_array_elements(COALESCE(p -> 'security_items', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.mm_oc_fixed_conditions WHERE oc_id = v_id;
  INSERT INTO public.mm_oc_fixed_conditions (oc_id, key, enabled, detail_text, release_or_adjust, release_date)
  SELECT v_id, x ->> 'key', (x ->> 'enabled')::boolean, public.oc_j_text(x, 'detail_text'),
         public.oc_j_text(x, 'release_or_adjust'), NULLIF(x ->> 'release_date', '')::date
  FROM jsonb_array_elements(COALESCE(p -> 'fixed_conditions', '[]'::jsonb)) x;

  DELETE FROM public.mm_oc_penalty WHERE oc_id = v_id;
  INSERT INTO public.mm_oc_penalty (oc_id, enabled, rate, period_unit, cap_percent, applicable_from_text)
  VALUES (v_id, (v_pen ->> 'enabled')::boolean, NULLIF(v_pen ->> 'rate', '')::numeric,
          public.oc_j_text(v_pen, 'period_unit'), NULLIF(v_pen ->> 'cap_percent', '')::numeric,
          public.oc_j_text(v_pen, 'applicable_from_text'));

  DELETE FROM public.mm_oc_payment_milestones WHERE oc_id = v_id;
  INSERT INTO public.mm_oc_payment_milestones (oc_id, seq, percent, trigger, due_days, notes)
  SELECT v_id, t.ord::integer, NULLIF(x ->> 'percent', '')::numeric, public.oc_j_text(x, 'trigger'),
         NULLIF(x ->> 'due_days', '')::integer, public.oc_j_text(x, 'notes')
  FROM jsonb_array_elements(COALESCE(p -> 'payment_milestones', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.mm_oc_contacts WHERE oc_id = v_id;
  INSERT INTO public.mm_oc_contacts (oc_id, seq, department, names, mobiles, emails)
  SELECT v_id, t.ord::integer, public.oc_j_text(x, 'department'), public.oc_j_text(x, 'names'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'mobiles', '[]'::jsonb))), '{}'),
         COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(x -> 'emails', '[]'::jsonb))), '{}')
  FROM jsonb_array_elements(COALESCE(p -> 'contacts', '[]'::jsonb)) WITH ORDINALITY AS t(x, ord);

  DELETE FROM public.mm_oc_signoff o
  WHERE o.oc_id = v_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
      WHERE x ->> 'slot' = o.slot AND public.oc_j_text(x, 'signed_by') IS NOT NULL
    );
  UPDATE public.mm_oc_signoff o SET signed_by = public.oc_j_text(x, 'signed_by')
  FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
  WHERE o.oc_id = v_id AND o.slot = x ->> 'slot'
    AND public.oc_j_text(x, 'signed_by') IS NOT NULL
    AND o.signed_by IS DISTINCT FROM public.oc_j_text(x, 'signed_by');
  INSERT INTO public.mm_oc_signoff (oc_id, slot, signed_by)
  SELECT v_id, x ->> 'slot', public.oc_j_text(x, 'signed_by')
  FROM jsonb_array_elements(COALESCE(p -> 'signoff', '[]'::jsonb)) x
  WHERE public.oc_j_text(x, 'signed_by') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.mm_oc_signoff o WHERE o.oc_id = v_id AND o.slot = x ->> 'slot');

  RETURN jsonb_build_object('id', v_id, 'oc_no', v_oc_no);
END;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security (Maintenance access)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mm_oc_master', 'mm_oc_security_items', 'mm_oc_fixed_conditions', 'mm_oc_penalty',
    'mm_oc_payment_milestones', 'mm_oc_contacts', 'mm_oc_signoff'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.mm_oc_current_user_has_access())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.mm_oc_current_user_has_access())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.mm_oc_current_user_has_access()) WITH CHECK (public.mm_oc_current_user_has_access())', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.mm_oc_current_user_has_access())', t || '_delete', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

ALTER TABLE public.mm_oc_signoff_assignees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mm_oc_signoff_assignees_select ON public.mm_oc_signoff_assignees;
CREATE POLICY mm_oc_signoff_assignees_select ON public.mm_oc_signoff_assignees FOR SELECT TO authenticated
  USING (public.mm_oc_current_user_has_access());
DROP POLICY IF EXISTS mm_oc_signoff_assignees_insert ON public.mm_oc_signoff_assignees;
CREATE POLICY mm_oc_signoff_assignees_insert ON public.mm_oc_signoff_assignees FOR INSERT TO authenticated
  WITH CHECK (public.mm_oc_current_user_can_configure());
DROP POLICY IF EXISTS mm_oc_signoff_assignees_update ON public.mm_oc_signoff_assignees;
CREATE POLICY mm_oc_signoff_assignees_update ON public.mm_oc_signoff_assignees FOR UPDATE TO authenticated
  USING (public.mm_oc_current_user_can_configure()) WITH CHECK (public.mm_oc_current_user_can_configure());
DROP POLICY IF EXISTS mm_oc_signoff_assignees_delete ON public.mm_oc_signoff_assignees;
CREATE POLICY mm_oc_signoff_assignees_delete ON public.mm_oc_signoff_assignees FOR DELETE TO authenticated
  USING (public.mm_oc_current_user_can_configure());
REVOKE ALL ON public.mm_oc_signoff_assignees FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_oc_signoff_assignees TO authenticated;
GRANT ALL ON public.mm_oc_signoff_assignees TO service_role;

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mm_oc_current_user_has_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mm_oc_current_user_can_configure() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mm_oc_employee_options() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mm_oc_assert_can_sign(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_oc_master_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_oc_signoff_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_oc_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mm_oc_current_user_has_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mm_oc_current_user_can_configure() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mm_oc_employee_options() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mm_oc_save(jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- IEV OC Creation — access follow-up (run after 20261012120000_iev_oc_creation.sql).
--
--   * Users given IEV through User Management sub-items (IEV Costing / IEV Dashboard) — not only the
--     whole IEV module or IEV team — can open, save and sign OCs. Uses public.oc_current_user_has_access()
--     in every OC rule; the shared IEV helper used by other IEV screens is not changed.
--   * The signed-in user's employee code also comes from the Employee Master login link when the
--     profile has no employee code, so assigned people can sign their box.
--
-- Rollback: supabase/rollbacks/20261012150000_iev_oc_access_fix_down.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.oc_current_user_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_has_fire_tender_shared_catalog_access()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.allowed_sub_modules, '[]'::jsonb) ?| ARRAY['fireTender.costing', 'fireTender.dashboard']
    );
$$;

COMMENT ON FUNCTION public.oc_current_user_has_access() IS
  'IEV OC Creation access: IEV module / team / super admin, or the IEV Costing or IEV Dashboard sub-item.';

CREATE OR REPLACE FUNCTION public.oc_current_employee_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(p.employee_code), '') FROM public.profiles p WHERE p.id = auth.uid()),
    (SELECT NULLIF(btrim(e.employee_code), '')
       FROM public.admin_ifsp_employee_master e
      WHERE e.user_id = auth.uid() AND e.status = 'Active' AND NULLIF(btrim(e.employee_code), '') IS NOT NULL
      ORDER BY e.id DESC
      LIMIT 1)
  );
$$;

-- IEV users who may open the "OC Sign-off Assignment" configuration page maintain it
-- (User Management → IEV: Configuration pages: all items, or selected items including it).
CREATE OR REPLACE FUNCTION public.oc_current_user_can_configure()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.oc_current_user_has_access()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('super_admin', 'super_admin_pro')
          OR NOT (COALESCE(p.allowed_sub_modules, '[]'::jsonb) ? 'iev-config.selected')
          OR COALESCE(p.allowed_sub_modules, '[]'::jsonb) ? 'iev-config.oc-sign-off'
        )
    );
$$;

-- Active employees for the assignment picker (code, name, department only).
CREATE OR REPLACE FUNCTION public.oc_employee_options()
RETURNS TABLE (employee_code text, full_name text, department text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to IEV OC Creation.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT btrim(e.employee_code), e.full_name, e.department
    FROM public.admin_ifsp_employee_master e
    WHERE e.status = 'Active' AND NULLIF(btrim(e.employee_code), '') IS NOT NULL
    ORDER BY e.full_name, e.employee_code;
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
BEGIN
  IF NOT public.oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to IEV OC Creation.' USING ERRCODE = '42501';
  END IF;

  IF v_oc_no IS NULL THEN RAISE EXCEPTION 'OC No. is required.'; END IF;
  IF EXISTS (SELECT 1 FROM public.oc_master WHERE upper(oc_no) = upper(v_oc_no) AND id IS DISTINCT FROM v_id) THEN
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
    RETURNING oc_no INTO v_oc_no;
    IF v_oc_no IS NULL THEN RAISE EXCEPTION 'This OC no longer exists.'; END IF;
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

-- Row-level security: same rules as before, with the OC access check.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'oc_master', 'oc_security_items', 'oc_fixed_conditions', 'oc_penalty',
    'oc_payment_milestones', 'oc_contacts', 'oc_signoff'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.oc_current_user_has_access())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.oc_current_user_has_access())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.oc_current_user_has_access()) WITH CHECK (public.oc_current_user_has_access())', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.oc_current_user_has_access())', t || '_delete', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS oc_signoff_assignees_select ON public.oc_signoff_assignees;
CREATE POLICY oc_signoff_assignees_select ON public.oc_signoff_assignees FOR SELECT TO authenticated
  USING (public.oc_current_user_has_access());

REVOKE ALL ON FUNCTION public.oc_current_user_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_current_user_has_access() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

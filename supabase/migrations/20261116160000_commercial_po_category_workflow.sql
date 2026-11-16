-- =============================================================================
-- Commercial PO At Glance — category-wise sequential approval with digital signatures.
-- Additive to 20261116120000_commercial_po_at_glance.sql; only cm_oc_* objects are touched.
-- Existing Commercial records and sign-offs are kept as they are.
--
--   * cm_oc_master.po_category: FIRE | SAFETY | FT_RENTAL | FT_CREW_RENTAL (required on save).
--   * Stages per category (cm_oc_category_stages):
--       FIRE, FT_CREW_RENTAL : CREATOR → COMMERCIAL_MANAGER → FINANCE → BILLING_IR_SALARY → HR_OPERATIONS
--       SAFETY               : CREATOR → COMMERCIAL_MANAGER → FINANCE → BILLING_IR_SALARY → SAFETY_HEAD
--       FT_RENTAL            : CREATOR → COMMERCIAL_MANAGER → FINANCE → BILLING_IR_SALARY
--   * Stage 1 (CREATOR) is signed by the login that created the PO; every later stage by the employee
--     assigned to it in Commercial → PO At Glance Sign-off Assignment. A stage opens only after the
--     previous stage is signed. Signing goes through cm_oc_sign_stage only; the signer's own Indus One
--     signature is required, and its user id is stamped on the sign-off.
--   * cm_oc_signature_file returns the signature file of the login that signed a stage, for Commercial
--     users only (the shared employee_signature_file_for_user is not changed).
--   * Legacy boxes (VP_COMMERCIAL, BILLING, …) stay valid for rows already saved.
-- Rollback: supabase/rollbacks/20261116160000_commercial_po_category_workflow_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columns and slot lists
-- ---------------------------------------------------------------------------
ALTER TABLE public.cm_oc_master ADD COLUMN IF NOT EXISTS po_category text;
ALTER TABLE public.cm_oc_master DROP CONSTRAINT IF EXISTS cm_oc_master_po_category_check;
ALTER TABLE public.cm_oc_master ADD CONSTRAINT cm_oc_master_po_category_check
  CHECK (po_category IS NULL OR po_category IN ('FIRE', 'SAFETY', 'FT_RENTAL', 'FT_CREW_RENTAL'));

ALTER TABLE public.cm_oc_signoff DROP CONSTRAINT IF EXISTS cm_oc_signoff_slot_check;
ALTER TABLE public.cm_oc_signoff ADD CONSTRAINT cm_oc_signoff_slot_check CHECK (slot IN (
  'CREATOR', 'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS', 'SAFETY_HEAD',
  'VP_COMMERCIAL', 'BILLING', 'IR', 'SALARY', 'OPERATIONS', 'ADMIN', 'PNC', 'ACCOUNTS', 'ARUN', 'ATIN'
));

ALTER TABLE public.cm_oc_signoff_assignees DROP CONSTRAINT IF EXISTS cm_oc_signoff_assignees_slot_check;
ALTER TABLE public.cm_oc_signoff_assignees ADD CONSTRAINT cm_oc_signoff_assignees_slot_check CHECK (slot IN (
  'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS', 'SAFETY_HEAD',
  'VP_COMMERCIAL', 'BILLING', 'IR', 'SALARY', 'OPERATIONS', 'ADMIN', 'PNC', 'ACCOUNTS', 'ARUN', 'ATIN'
));

CREATE OR REPLACE FUNCTION public.cm_oc_category_stages(p_category text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_category
    WHEN 'FIRE' THEN ARRAY['CREATOR', 'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS']
    WHEN 'FT_CREW_RENTAL' THEN ARRAY['CREATOR', 'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS']
    WHEN 'SAFETY' THEN ARRAY['CREATOR', 'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'SAFETY_HEAD']
    WHEN 'FT_RENTAL' THEN ARRAY['CREATOR', 'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY']
  END;
$$;

CREATE OR REPLACE FUNCTION public.cm_oc_stage_label(p_slot text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_slot
    WHEN 'CREATOR' THEN 'OC Creator'
    WHEN 'COMMERCIAL_MANAGER' THEN 'Commercial Manager'
    WHEN 'FINANCE' THEN 'Finance / Accounts'
    WHEN 'BILLING_IR_SALARY' THEN 'Billing / IR / Salary'
    WHEN 'HR_OPERATIONS' THEN 'HR / Operations'
    WHEN 'SAFETY_HEAD' THEN 'Safety Head'
    ELSE p_slot END;
$$;

-- ---------------------------------------------------------------------------
-- Sign-off rows: written only by cm_oc_sign_stage; never edited or removed while the PO exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_oc_signoff_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.cm_oc_master m WHERE m.id = OLD.oc_id) THEN
      RAISE EXCEPTION 'A signed approval stage cannot be removed.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'A signed approval stage cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF current_setting('cm_oc.signing', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use Sign on the approval stage to sign this PO.' USING ERRCODE = '42501';
  END IF;
  NEW.signed_by := btrim(NEW.signed_by);
  NEW.signed_at := now();
  NEW.signed_user_id := auth.uid();
  RETURN NEW;
END;
$$;

-- Clients read sign-offs; writes go through cm_oc_sign_stage.
DROP POLICY IF EXISTS cm_oc_signoff_insert ON public.cm_oc_signoff;
DROP POLICY IF EXISTS cm_oc_signoff_update ON public.cm_oc_signoff;
DROP POLICY IF EXISTS cm_oc_signoff_delete ON public.cm_oc_signoff;
REVOKE INSERT, UPDATE, DELETE ON public.cm_oc_signoff FROM authenticated;

-- ---------------------------------------------------------------------------
-- Signature file lookup for one login (Indus One signature, else Employee Master signature document).
-- Internal: same lookup as employee_signature_file_for_user, without its Projects/Finance gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_oc_user_signature(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_code text;
  v_key text;
  v_name text;
  v_type text;
  v_emp_id bigint;
  v_file jsonb;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;

  SELECT nullif(btrim(p.employee_code), '') INTO v_code FROM public.profiles p WHERE p.id = p_user;
  IF v_code IS NULL THEN
    SELECT nullif(btrim(e.employee_code), '') INTO v_code
      FROM public.admin_ifsp_employee_master e
     WHERE e.user_id = p_user AND nullif(btrim(e.employee_code), '') IS NOT NULL
     ORDER BY CASE WHEN lower(coalesce(e.status, '')) = 'active' THEN 0 ELSE 1 END, e.id DESC
     LIMIT 1;
  END IF;

  IF v_code IS NOT NULL THEN
    SELECT s.object_key, s.file_name, s.content_type INTO v_key, v_name, v_type
      FROM indus_one.employee_signatures s
     WHERE btrim(s.employee_code) = v_code
       AND left(s.object_key, char_length('signature/' || v_code || '/')) = 'signature/' || v_code || '/'
       AND position('..' in s.object_key) = 0
       AND nullif(btrim(s.object_key), '') IS NOT NULL
     ORDER BY CASE WHEN s.user_id = p_user THEN 0 ELSE 1 END, s.updated_at DESC NULLS LAST
     LIMIT 1;
    IF v_key IS NOT NULL THEN
      RETURN jsonb_build_object(
        'employeeCode', v_code,
        'objectKey', v_key,
        'fileName', coalesce(nullif(btrim(v_name), ''), 'signature.png'),
        'contentType', coalesce(nullif(btrim(v_type), ''), 'image/png')
      );
    END IF;
  END IF;

  SELECT m.id INTO v_emp_id
    FROM public.admin_ifsp_employee_master m
   WHERE m.user_id = p_user OR (v_code IS NOT NULL AND btrim(coalesce(m.employee_code, '')) = v_code)
   ORDER BY CASE WHEN m.user_id = p_user THEN 0 ELSE 1 END,
            CASE WHEN lower(coalesce(m.status, '')) = 'active' THEN 0 ELSE 1 END, m.id
   LIMIT 1;
  IF v_emp_id IS NULL THEN RETURN NULL; END IF;

  SELECT d.file INTO v_file
    FROM public.admin_employee_master_documents d
   WHERE d.employee_master_id = v_emp_id
     AND d.file IS NOT NULL
     AND nullif(btrim(d.file ->> 'objectKey'), '') IS NOT NULL
     AND (d.document_key ~* 'sign' OR d.label ~* 'sign')
   ORDER BY CASE d.status WHEN 'verified' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END, d.updated_at DESC NULLS LAST
   LIMIT 1;
  IF v_file IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'employeeCode', v_code,
    'employeeMasterId', v_emp_id,
    'objectKey', v_file ->> 'objectKey',
    'fileName', v_file ->> 'fileName'
  );
END;
$$;

-- Signature of the login that signed a stage on a Commercial PO (Commercial access required).
CREATE OR REPLACE FUNCTION public.cm_oc_signature_file(p_oc_id uuid, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;
  SELECT s.signed_user_id INTO v_user FROM public.cm_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot = p_slot;
  RETURN public.cm_oc_user_signature(v_user);
END;
$$;

-- ---------------------------------------------------------------------------
-- Sign one stage (sequential, category-driven, signer's own signature)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_oc_sign_stage(p_oc_id uuid, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_master public.cm_oc_master%ROWTYPE;
  v_stages text[];
  v_idx integer;
  v_a public.cm_oc_signoff_assignees%ROWTYPE;
  v_code text;
  v_sig jsonb;
  v_name text;
  v_row public.cm_oc_signoff%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_master FROM public.cm_oc_master m WHERE m.id = p_oc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_master.po_category IS NULL THEN
    RAISE EXCEPTION 'Choose the PO category and save before signing.' USING ERRCODE = 'P0001';
  END IF;
  v_stages := public.cm_oc_category_stages(v_master.po_category);
  v_idx := array_position(v_stages, p_slot);
  IF v_idx IS NULL THEN
    RAISE EXCEPTION '% is not an approval stage for this PO category.', public.cm_oc_stage_label(p_slot) USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cm_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot = p_slot) THEN
    RAISE EXCEPTION 'This stage is already signed.' USING ERRCODE = 'P0001';
  END IF;
  IF v_idx > 1 AND NOT EXISTS (
    SELECT 1 FROM public.cm_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot = v_stages[v_idx - 1]
  ) THEN
    RAISE EXCEPTION '% can sign only after the previous stage (%) is approved.',
      public.cm_oc_stage_label(p_slot), public.cm_oc_stage_label(v_stages[v_idx - 1]) USING ERRCODE = 'P0001';
  END IF;

  v_code := nullif(btrim(COALESCE(public.oc_current_employee_code(), '')), '');
  IF p_slot = 'CREATOR' THEN
    IF v_master.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Only the person who created this OC can sign the OC Creator stage.' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_a FROM public.cm_oc_signoff_assignees WHERE slot = p_slot;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No one is assigned to sign the % stage yet. Set it in Commercial → PO At Glance Sign-off Assignment.',
        public.cm_oc_stage_label(p_slot) USING ERRCODE = '42501';
    END IF;
    IF v_code IS NULL OR lower(btrim(v_a.employee_code)) <> lower(v_code) THEN
      RAISE EXCEPTION 'Only % (%) can sign the % stage.', v_a.employee_name, v_a.employee_code,
        public.cm_oc_stage_label(p_slot) USING ERRCODE = '42501';
    END IF;
  END IF;

  v_sig := public.cm_oc_user_signature(v_uid);
  IF v_sig IS NULL OR nullif(btrim(v_sig ->> 'objectKey'), '') IS NULL THEN
    RAISE EXCEPTION 'No digital signature was found for your employee code. Upload your signature in Indus One, then sign again.'
      USING ERRCODE = 'P0001';
  END IF;

  IF nullif(v_sig ->> 'employeeMasterId', '') IS NOT NULL THEN
    SELECT nullif(btrim(e.full_name), '') INTO v_name
      FROM public.admin_ifsp_employee_master e WHERE e.id = (v_sig ->> 'employeeMasterId')::bigint;
  END IF;
  IF v_name IS NULL AND COALESCE(v_code, v_sig ->> 'employeeCode') IS NOT NULL THEN
    SELECT nullif(btrim(e.full_name), '') INTO v_name
      FROM public.admin_ifsp_employee_master e
     WHERE lower(btrim(e.employee_code)) = lower(COALESCE(v_code, v_sig ->> 'employeeCode'))
     ORDER BY CASE WHEN lower(coalesce(e.status, '')) = 'active' THEN 0 ELSE 1 END, e.id DESC
     LIMIT 1;
  END IF;
  IF v_name IS NULL THEN
    SELECT nullif(btrim(p.full_name), '') INTO v_name FROM public.profiles p WHERE p.id = v_uid;
  END IF;
  v_name := COALESCE(v_name, v_a.employee_name, 'Signed');

  PERFORM set_config('cm_oc.signing', 'on', true);
  INSERT INTO public.cm_oc_signoff (oc_id, slot, signed_by) VALUES (p_oc_id, p_slot, v_name) RETURNING * INTO v_row;
  PERFORM set_config('cm_oc.signing', 'off', true);

  RETURN jsonb_build_object(
    'slot', v_row.slot, 'signed_by', v_row.signed_by, 'signed_at', v_row.signed_at, 'signed_user_id', v_row.signed_user_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Save: same as before plus po_category; sign-offs are no longer written here.
-- The category cannot change once any stage of the new workflow is signed.
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
  v_category text := public.oc_j_text(p, 'po_category');
  v_old_category text;
  v_found uuid;
BEGIN
  IF NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;

  IF v_oc_no IS NOT NULL AND EXISTS (SELECT 1 FROM public.cm_oc_master WHERE upper(oc_no) = upper(v_oc_no) AND id IS DISTINCT FROM v_id) THEN
    RAISE EXCEPTION 'OC No. % is already used. Enter a different number.', v_oc_no;
  END IF;
  IF v_category IS NULL OR v_category NOT IN ('FIRE', 'SAFETY', 'FT_RENTAL', 'FT_CREW_RENTAL') THEN
    RAISE EXCEPTION 'PO category is required.';
  END IF;
  IF public.oc_j_text(p, 'client_name') IS NULL THEN RAISE EXCEPTION 'Customer is required.'; END IF;
  IF public.oc_j_text(p, 'po_wo_no') IS NULL THEN RAISE EXCEPTION 'WO No. is required.'; END IF;
  IF v_po_date IS NULL THEN RAISE EXCEPTION 'WO date is required.'; END IF;
  IF public.oc_j_text(p, 'project_description') IS NULL THEN RAISE EXCEPTION 'Description of work is required.'; END IF;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from THEN
    RAISE EXCEPTION 'Duration "To" date must be on or after the "From" date.';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT po_category INTO v_old_category FROM public.cm_oc_master WHERE id = v_id;
    IF v_old_category IS DISTINCT FROM v_category AND EXISTS (
      SELECT 1 FROM public.cm_oc_signoff s
       WHERE s.oc_id = v_id AND s.slot IN ('CREATOR', 'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS', 'SAFETY_HEAD')
    ) THEN
      RAISE EXCEPTION 'The PO category cannot be changed after approvals have started.';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.cm_oc_master (
      oc_no, oc_date, cost_center_tally, client_name, client_address, is_sez, po_wo_no, po_date, po_category,
      project_description, duration_text, duration_from, duration_to, mobilization_date, payment_terms,
      gst_pct, gst_applicable, contract_value, currency,
      fs_count, dcpo_count, fcro_count, fireman_count, safety_supervisor_count, safety_steward_count, vehicle_count,
      insurance, minimum_wage_rate, relievers_scope, duty_pattern, accommodation_transport,
      sd_ra_applicable, sd_ra_pct, sd_release_period, sd_pbg, emd_details, remarks
    ) VALUES (
      v_oc_no, NULLIF(p ->> 'oc_date', '')::date, public.oc_j_text(p, 'cost_center_tally'),
      public.oc_j_text(p, 'client_name'), public.oc_j_text(p, 'client_address'), (p ->> 'is_sez')::boolean,
      public.oc_j_text(p, 'po_wo_no'), v_po_date, v_category, public.oc_j_text(p, 'project_description'),
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
      po_category = v_category,
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

  RETURN jsonb_build_object('id', v_id, 'oc_no', v_oc_no);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cm_oc_user_signature(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cm_oc_signature_file(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cm_oc_sign_stage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cm_oc_category_stages(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_stage_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_signature_file(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_sign_stage(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_user_signature(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

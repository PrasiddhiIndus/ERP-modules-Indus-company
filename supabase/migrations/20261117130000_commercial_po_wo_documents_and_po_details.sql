-- Commercial PO At Glance: multiple WO document attachments + customer PO details.
-- Additive only. Does not change approval workflow, sign-off, or existing rows beyond new nullable columns.
-- Rollback: supabase/rollbacks/20261117130000_commercial_po_wo_documents_and_po_details_down.sql

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.cm_oc_master
  ADD COLUMN IF NOT EXISTS customer_po_no text,
  ADD COLUMN IF NOT EXISTS customer_po_date date,
  ADD COLUMN IF NOT EXISTS customer_po_notes text,
  ADD COLUMN IF NOT EXISTS wo_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.cm_oc_master
  DROP CONSTRAINT IF EXISTS cm_oc_master_wo_documents_is_array;

ALTER TABLE public.cm_oc_master
  ADD CONSTRAINT cm_oc_master_wo_documents_is_array
  CHECK (jsonb_typeof(wo_documents) = 'array');

COMMENT ON COLUMN public.cm_oc_master.customer_po_no IS
  'Customer purchase order number (optional; separate from WO No.).';
COMMENT ON COLUMN public.cm_oc_master.customer_po_date IS
  'Customer purchase order date (optional).';
COMMENT ON COLUMN public.cm_oc_master.customer_po_notes IS
  'Optional notes about the customer PO.';
COMMENT ON COLUMN public.cm_oc_master.wo_documents IS
  'Work order attachments: [{name, path, uploaded_at}, ...]';

-- ---------------------------------------------------------------------------
-- Persist PO details on save (documents stay on separate RPCs)
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
  v_customer_po_date date := NULLIF(p ->> 'customer_po_date', '')::date;
  v_from date := NULLIF(p ->> 'duration_from', '')::date;
  v_to date := NULLIF(p ->> 'duration_to', '')::date;
  v_category text := public.oc_j_text(p, 'po_category');
  v_old_category text;
  v_found uuid;
  v_extra jsonb;
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

  v_extra := COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'label', NULLIF(btrim(COALESCE(e ->> 'label', '')), ''),
          'count', CASE
            WHEN NULLIF(btrim(COALESCE(e ->> 'count', '')), '') IS NULL THEN NULL
            ELSE NULLIF(btrim(e ->> 'count'), '')::integer
          END
        )
        ORDER BY ord
      )
      FROM jsonb_array_elements(COALESCE(p -> 'extra_deployment', '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
      WHERE NULLIF(btrim(COALESCE(e ->> 'label', '')), '') IS NOT NULL
         OR NULLIF(btrim(COALESCE(e ->> 'count', '')), '') IS NOT NULL
    ),
    '[]'::jsonb
  );

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
      customer_po_no, customer_po_date, customer_po_notes,
      project_description, duration_text, duration_from, duration_to, mobilization_date, payment_terms,
      gst_pct, gst_applicable, contract_value, currency,
      fs_count, dcpo_count, fcro_count, fireman_count, safety_supervisor_count, safety_steward_count, vehicle_count,
      extra_deployment,
      insurance, minimum_wage_rate, relievers_scope, duty_pattern, accommodation_transport,
      sd_ra_applicable, sd_ra_pct, sd_release_period, sd_pbg, emd_details, remarks
    ) VALUES (
      v_oc_no, NULLIF(p ->> 'oc_date', '')::date, public.oc_j_text(p, 'cost_center_tally'),
      public.oc_j_text(p, 'client_name'), public.oc_j_text(p, 'client_address'), (p ->> 'is_sez')::boolean,
      public.oc_j_text(p, 'po_wo_no'), v_po_date, v_category,
      public.oc_j_text(p, 'customer_po_no'), v_customer_po_date, public.oc_j_text(p, 'customer_po_notes'),
      public.oc_j_text(p, 'project_description'),
      public.oc_j_text(p, 'duration_text'), v_from, v_to, NULLIF(p ->> 'mobilization_date', '')::date,
      public.oc_j_text(p, 'payment_terms'),
      NULLIF(p ->> 'gst_pct', '')::numeric, (p ->> 'gst_applicable')::boolean,
      NULLIF(p ->> 'contract_value', '')::numeric, COALESCE(public.oc_j_text(p, 'currency'), 'INR'),
      NULLIF(p ->> 'fs_count', '')::integer, NULLIF(p ->> 'dcpo_count', '')::integer,
      NULLIF(p ->> 'fcro_count', '')::integer, NULLIF(p ->> 'fireman_count', '')::integer,
      NULLIF(p ->> 'safety_supervisor_count', '')::integer, NULLIF(p ->> 'safety_steward_count', '')::integer,
      NULLIF(p ->> 'vehicle_count', '')::integer,
      v_extra,
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
      customer_po_no = public.oc_j_text(p, 'customer_po_no'),
      customer_po_date = v_customer_po_date,
      customer_po_notes = public.oc_j_text(p, 'customer_po_notes'),
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
      extra_deployment = v_extra,
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
-- WO document RPCs (append / remove one / clear all)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_oc_set_wo_document(p_id uuid, p_name text, p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_docs jsonb;
  v_entry jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR NULLIF(btrim(COALESCE(p_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Choose a work order file to upload.' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(m.wo_documents, '[]'::jsonb)
    INTO v_docs
  FROM public.cm_oc_master m
  WHERE m.id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_docs) <> 'array' THEN
    v_docs := '[]'::jsonb;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_docs) d
    WHERE lower(btrim(COALESCE(d->>'path', ''))) = lower(btrim(p_path))
  ) THEN
    RETURN v_docs;
  END IF;

  v_entry := jsonb_build_object(
    'name', COALESCE(NULLIF(btrim(COALESCE(p_name, '')), ''), 'Work order'),
    'path', btrim(p_path),
    'uploaded_at', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  v_docs := v_docs || jsonb_build_array(v_entry);

  UPDATE public.cm_oc_master
     SET wo_documents = v_docs,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_id;

  RETURN v_docs;
END;
$body$;

CREATE OR REPLACE FUNCTION public.cm_oc_remove_wo_document(p_id uuid, p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_docs jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR NULLIF(btrim(COALESCE(p_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Choose which work order file to remove.' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(m.wo_documents, '[]'::jsonb)
    INTO v_docs
  FROM public.cm_oc_master m
  WHERE m.id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_docs) <> 'array' THEN
    v_docs := '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(d), '[]'::jsonb)
    INTO v_docs
  FROM jsonb_array_elements(v_docs) d
  WHERE lower(btrim(COALESCE(d->>'path', ''))) IS DISTINCT FROM lower(btrim(p_path));

  UPDATE public.cm_oc_master
     SET wo_documents = v_docs,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_id;

  RETURN v_docs;
END;
$body$;

CREATE OR REPLACE FUNCTION public.cm_oc_clear_wo_document(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF auth.uid() IS NULL OR NOT public.cm_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Commercial PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Choose which PO At Glance to clear.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.cm_oc_master
     SET wo_documents = '[]'::jsonb,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
END;
$body$;

REVOKE ALL ON FUNCTION public.cm_oc_set_wo_document(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cm_oc_remove_wo_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cm_oc_clear_wo_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cm_oc_set_wo_document(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_remove_wo_document(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cm_oc_clear_wo_document(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Private storage bucket for WO files
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('commercial-wo-documents', 'commercial-wo-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "commercial_wo_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "commercial_wo_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "commercial_wo_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "commercial_wo_docs_delete" ON storage.objects;

CREATE POLICY "commercial_wo_docs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'commercial-wo-documents'
    AND public.cm_oc_current_user_has_access()
  );

CREATE POLICY "commercial_wo_docs_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'commercial-wo-documents'
    AND (
      public.cm_oc_current_user_has_access()
      OR public.finance_po_current_user_has_master_access()
    )
  );

CREATE POLICY "commercial_wo_docs_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'commercial-wo-documents'
    AND public.cm_oc_current_user_has_access()
  );

CREATE POLICY "commercial_wo_docs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'commercial-wo-documents'
    AND public.cm_oc_current_user_has_access()
  );

NOTIFY pgrst, 'reload schema';

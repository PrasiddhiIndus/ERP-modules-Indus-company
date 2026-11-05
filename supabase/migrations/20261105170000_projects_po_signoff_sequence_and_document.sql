-- Projects PO At Glance only.
-- OC Creation is signed by the person who creates the OC (no fixed assignee).
-- Execution, Department Head, and Finance open only after the previous stage is approved.
-- The original purchase order file can be stored on the Projects record and opened from the preview.

ALTER TABLE public.pj_oc_master
  ADD COLUMN IF NOT EXISTS po_document_name text,
  ADD COLUMN IF NOT EXISTS po_document_path text;

CREATE OR REPLACE FUNCTION public.pj_oc_assert_can_sign(p_slot text, p_oc_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.pj_oc_signoff_assignees%ROWTYPE;
  v_box text := CASE p_slot
    WHEN 'PROJECT_USER' THEN 'OC Creation'
    WHEN 'PLANNING' THEN 'Execution Department'
    WHEN 'VERTICAL_HEAD' THEN 'Department Head'
    ELSE 'Finance Department' END;
  v_prev text := CASE p_slot
    WHEN 'PLANNING' THEN 'PROJECT_USER'
    WHEN 'VERTICAL_HEAD' THEN 'PLANNING'
    WHEN 'FINANCE' THEN 'VERTICAL_HEAD'
    ELSE NULL END;
BEGIN
  IF p_slot = 'PROJECT_USER' THEN
    IF p_oc_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pj_oc_master m
      WHERE m.id = p_oc_id
        AND m.created_by IS NOT NULL
        AND m.created_by IS DISTINCT FROM auth.uid()
    ) THEN
      RAISE EXCEPTION 'Only the person who created this OC can sign OC Creation.' USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;

  IF v_prev IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pj_oc_signoff s
    WHERE s.oc_id = p_oc_id
      AND s.slot = v_prev
      AND nullif(btrim(s.signed_by), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION '% can sign only after the previous stage is approved.', v_box USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_a FROM public.pj_oc_signoff_assignees WHERE slot = p_slot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No one is assigned to sign the % box yet. Set it in Projects → PO At Glance Sign-off Assignment.', v_box
      USING ERRCODE = '42501';
  END IF;
  IF lower(btrim(v_a.employee_code)) IS DISTINCT FROM lower(public.oc_current_employee_code()) THEN
    RAISE EXCEPTION 'Only % (%) can sign the % box.', v_a.employee_name, v_a.employee_code, v_box
      USING ERRCODE = '42501';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.pj_oc_assert_can_sign(text);

CREATE OR REPLACE FUNCTION public.pj_oc_signoff_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_later text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_later := CASE OLD.slot
      WHEN 'PROJECT_USER' THEN 'PLANNING'
      WHEN 'PLANNING' THEN 'VERTICAL_HEAD'
      WHEN 'VERTICAL_HEAD' THEN 'FINANCE'
      ELSE NULL END;
    IF v_later IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pj_oc_signoff s
      WHERE s.oc_id = OLD.oc_id AND s.slot = v_later
    ) THEN
      RAISE EXCEPTION 'This stage cannot be removed while a later stage is approved.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pj_oc_master m WHERE m.id = OLD.oc_id) THEN
      PERFORM public.pj_oc_assert_can_sign(OLD.slot, OLD.oc_id);
    END IF;
    RETURN OLD;
  END IF;

  NEW.signed_by := btrim(NEW.signed_by);
  IF TG_OP = 'UPDATE' AND NEW.signed_by = OLD.signed_by AND NEW.slot = OLD.slot THEN
    NEW.signed_at := OLD.signed_at;
    NEW.signed_user_id := OLD.signed_user_id;
  ELSE
    PERFORM public.pj_oc_assert_can_sign(NEW.slot, NEW.oc_id);
    NEW.signed_at := now();
    NEW.signed_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pj_oc_set_po_document(p_id uuid, p_name text, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pj_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Projects PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR nullif(btrim(COALESCE(p_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Choose a purchase order file to upload.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.pj_oc_master
     SET po_document_name = nullif(btrim(COALESCE(p_name, '')), ''),
         po_document_path = btrim(p_path)
   WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pj_oc_assert_can_sign(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pj_oc_set_po_document(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pj_oc_assert_can_sign(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pj_oc_set_po_document(uuid, text, text) TO authenticated, service_role;

-- Finance reviewers of a PO need to see the creator's signature on the preview.
CREATE OR REPLACE FUNCTION public.employee_signature_file_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_code text;
  v_emp_id bigint;
  v_file jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;
  IF v_user IS DISTINCT FROM auth.uid()
     AND NOT public.current_user_can_access_module('projects')
     AND NOT public.finance_po_current_user_has_master_access() THEN
    RAISE EXCEPTION 'You do not have access to this signature.' USING ERRCODE = '42501';
  END IF;

  SELECT nullif(btrim(p.employee_code), '')
    INTO v_code
    FROM public.profiles p
   WHERE p.id = v_user;

  SELECT m.id
    INTO v_emp_id
    FROM public.admin_ifsp_employee_master m
   WHERE m.user_id = v_user
      OR (v_code IS NOT NULL AND btrim(coalesce(m.employee_code, '')) = v_code)
   ORDER BY CASE WHEN m.user_id = v_user THEN 0 ELSE 1 END,
            CASE WHEN lower(coalesce(m.status, '')) = 'active' THEN 0 ELSE 1 END,
            m.id
   LIMIT 1;

  IF v_emp_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT d.file
    INTO v_file
    FROM public.admin_employee_master_documents d
   WHERE d.employee_master_id = v_emp_id
     AND d.file IS NOT NULL
     AND nullif(btrim(d.file ->> 'objectKey'), '') IS NOT NULL
     AND (
       d.document_key ~* 'sign'
       OR d.label ~* 'sign'
     )
   ORDER BY CASE d.status WHEN 'verified' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,
            d.updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_file IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'employeeMasterId', v_emp_id,
    'objectKey', v_file ->> 'objectKey',
    'fileName', v_file ->> 'fileName'
  );
END;
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('projects-po-documents', 'projects-po-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "projects_po_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "projects_po_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "projects_po_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "projects_po_docs_delete" ON storage.objects;

CREATE POLICY "projects_po_docs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'projects-po-documents'
    AND public.pj_oc_current_user_has_access()
  );

CREATE POLICY "projects_po_docs_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'projects-po-documents'
    AND (
      public.pj_oc_current_user_has_access()
      OR public.finance_po_current_user_has_master_access()
    )
  );

CREATE POLICY "projects_po_docs_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'projects-po-documents'
    AND public.pj_oc_current_user_has_access()
  );

CREATE POLICY "projects_po_docs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'projects-po-documents'
    AND public.pj_oc_current_user_has_access()
  );

NOTIFY pgrst, 'reload schema';

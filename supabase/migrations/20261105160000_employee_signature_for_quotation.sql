-- Lets a signed-in Projects user read the digital signature already stored
-- against an employee code (Employee Master documents whose name is a signature).
-- Does not change who can upload, review, or delete those documents.

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
     AND NOT public.current_user_can_access_module('projects') THEN
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

REVOKE ALL ON FUNCTION public.employee_signature_file_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_signature_file_for_user(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

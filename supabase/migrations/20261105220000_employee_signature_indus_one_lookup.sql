-- Signature lookup for the logged-in user's employee code.
-- Indus One stores the image on indus_one.employee_signatures (signature/{employee code}/...).
-- The previous lookup only searched Employee Master documents whose name contained "sign",
-- so an uploaded Indus One signature was reported as missing.
-- A caller can read their own signature. Someone else can read it only when they already
-- have Projects or Master PO at Glance access, and only that employee's file is returned.

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
  v_key text;
  v_name text;
  v_type text;
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

  IF v_code IS NULL THEN
    SELECT nullif(btrim(e.employee_code), '')
      INTO v_code
      FROM public.admin_ifsp_employee_master e
     WHERE e.user_id = v_user
       AND nullif(btrim(e.employee_code), '') IS NOT NULL
     ORDER BY CASE WHEN lower(coalesce(e.status, '')) = 'active' THEN 0 ELSE 1 END,
              e.id DESC
     LIMIT 1;
  END IF;

  IF v_code IS NOT NULL THEN
    SELECT s.object_key, s.file_name, s.content_type
      INTO v_key, v_name, v_type
      FROM indus_one.employee_signatures s
     WHERE btrim(s.employee_code) = v_code
       AND left(s.object_key, char_length('signature/' || v_code || '/')) = 'signature/' || v_code || '/'
       AND position('..' in s.object_key) = 0
       AND nullif(btrim(s.object_key), '') IS NOT NULL
     ORDER BY CASE WHEN s.user_id = v_user THEN 0 ELSE 1 END,
              s.updated_at DESC NULLS LAST
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

  -- Older uploads stored as an Employee Master document named as a signature.
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
    'employeeCode', v_code,
    'employeeMasterId', v_emp_id,
    'objectKey', v_file ->> 'objectKey',
    'fileName', v_file ->> 'fileName'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.employee_signature_file_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_signature_file_for_user(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

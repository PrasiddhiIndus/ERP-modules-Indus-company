-- Fix portal resolve: Employee Master uses full_name / employee_id, not employee_name.

CREATE OR REPLACE FUNCTION public.admin_employee_document_portal_resolve(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_employee_document_portal_tokens%rowtype;
  v_emp public.admin_ifsp_employee_master%rowtype;
  v_docs jsonb;
BEGIN
  v_t := public.admin_employee_document_portal_token(p_token_hash);
  SELECT * INTO v_emp FROM public.admin_ifsp_employee_master WHERE id = v_t.employee_master_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link has expired or is no longer valid. Please contact HR.';
  END IF;

  INSERT INTO public.admin_employee_master_documents (employee_master_id, document_key, label, required)
  SELECT v_emp.id, t.key, t.label, t.required
  FROM public.admin_recruitment_document_types t
  WHERE t.active
  ON CONFLICT (employee_master_id, document_key) DO NOTHING;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'key', d.document_key,
      'label', d.label,
      'required', d.required,
      'status', d.status,
      'description', t.description,
      'rejectionReason', d.rejection_reason,
      'hasFile', d.file IS NOT NULL
    )
    ORDER BY t.sort_order, d.label
  ), '[]'::jsonb)
  INTO v_docs
  FROM public.admin_employee_master_documents d
  LEFT JOIN public.admin_recruitment_document_types t ON t.key = d.document_key
  WHERE d.employee_master_id = v_emp.id;

  RETURN jsonb_build_object(
    'employeeMasterId', v_emp.id,
    'employeeName', coalesce(nullif(btrim(v_emp.full_name), ''), 'Employee'),
    'employeeCode', coalesce(v_emp.employee_code, v_emp.employee_id),
    'companyName', 'Indus Fire Safety Private Limited',
    'expiresAt', v_t.expires_at,
    'documentsOpen', true,
    'documents', v_docs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_employee_document_portal_resolve(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_employee_document_portal_resolve(text) TO service_role;

NOTIFY pgrst, 'reload schema';

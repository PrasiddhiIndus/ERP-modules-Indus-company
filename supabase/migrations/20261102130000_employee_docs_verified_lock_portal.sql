-- Verified documents cannot be changed via the employee upload link.
-- Staff may still replace them from Employee Master (resets to submitted for re-review).

CREATE OR REPLACE FUNCTION public.admin_employee_document_apply_submit(
  p_employee_master_id bigint,
  p_document_key text,
  p_file jsonb,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_recruitment_document_types%rowtype;
  v_d public.admin_employee_master_documents%rowtype;
  v_prefix text := 'admin-employee-docs/' || p_employee_master_id::text || '/';
BEGIN
  IF p_channel NOT IN ('staff', 'employee_link') THEN
    RAISE EXCEPTION 'Unknown upload channel.';
  END IF;
  IF public.admin_recruitment_clean(p_file ->> 'objectKey') IS NULL
     OR (p_file ->> 'objectKey') NOT LIKE v_prefix || '%' THEN
    RAISE EXCEPTION 'Upload a file first.';
  END IF;

  SELECT * INTO v_d
  FROM public.admin_employee_master_documents
  WHERE employee_master_id = p_employee_master_id AND document_key = p_document_key
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_t FROM public.admin_recruitment_document_types WHERE key = p_document_key AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown document type.';
    END IF;
    INSERT INTO public.admin_employee_master_documents (employee_master_id, document_key, label, required)
    VALUES (p_employee_master_id, v_t.key, v_t.label, v_t.required)
    RETURNING * INTO v_d;
  END IF;

  -- Portal / employee link: verified docs are locked. Staff in Employee Master may replace.
  IF v_d.status = 'verified' AND p_channel = 'employee_link' THEN
    RAISE EXCEPTION 'This document is already verified and cannot be changed through the upload link. Contact HR if a replacement is needed.';
  END IF;

  UPDATE public.admin_employee_master_documents SET
    status = 'submitted',
    file = p_file,
    submitted_at = now(),
    submitted_via = p_channel,
    submission_count = submission_count + 1,
    reviewed_by = NULL,
    reviewed_by_name = NULL,
    reviewed_at = NULL,
    rejection_reason = NULL,
    version = version + 1
  WHERE id = v_d.id
  RETURNING * INTO v_d;

  RETURN to_jsonb(v_d);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_employee_document_apply_submit(bigint, text, jsonb, text) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

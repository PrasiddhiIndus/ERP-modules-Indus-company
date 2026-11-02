-- Employee Master document collection (mirrors recruitment document workflow).
-- Reuses admin_recruitment_document_types for the checklist catalogue (read-only).
-- Does not alter recruitment tables or functions.

CREATE TABLE IF NOT EXISTS public.admin_employee_master_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  document_key text NOT NULL REFERENCES public.admin_recruitment_document_types(key) ON UPDATE CASCADE,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'under_review', 'verified', 'rejected')),
  file jsonb,
  submitted_at timestamptz,
  submitted_via text CHECK (submitted_via IN ('staff', 'employee_link')),
  submission_count integer NOT NULL DEFAULT 0,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name text,
  reviewed_at timestamptz,
  rejection_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_master_id, document_key)
);

CREATE INDEX IF NOT EXISTS admin_employee_master_documents_employee_idx
  ON public.admin_employee_master_documents (employee_master_id, status);

CREATE INDEX IF NOT EXISTS admin_employee_master_documents_status_idx
  ON public.admin_employee_master_documents (status);

COMMENT ON TABLE public.admin_employee_master_documents IS
  'Employee Master document checklist rows — upload / review / verify, parallel to recruitment candidate documents.';

CREATE TABLE IF NOT EXISTS public.admin_employee_document_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT 'documents' CHECK (purpose IN ('documents')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_employee_document_portal_tokens_emp_idx
  ON public.admin_employee_document_portal_tokens (employee_master_id, purpose);

COMMENT ON TABLE public.admin_employee_document_portal_tokens IS
  'Opaque upload-link tokens for Employee Master document collection.';

CREATE OR REPLACE FUNCTION public.admin_employee_document_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_employee_master_documents_touch ON public.admin_employee_master_documents;
CREATE TRIGGER trg_admin_employee_master_documents_touch
  BEFORE UPDATE ON public.admin_employee_master_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_employee_document_touch_updated_at();

ALTER TABLE public.admin_employee_master_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_employee_document_portal_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_employee_master_documents FROM anon, authenticated;
GRANT SELECT ON public.admin_employee_master_documents TO authenticated;
GRANT ALL ON public.admin_employee_master_documents TO service_role;

REVOKE ALL ON public.admin_employee_document_portal_tokens FROM anon, authenticated;
GRANT ALL ON public.admin_employee_document_portal_tokens TO service_role;

DROP POLICY IF EXISTS admin_employee_master_documents_select ON public.admin_employee_master_documents;
CREATE POLICY admin_employee_master_documents_select
  ON public.admin_employee_master_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE OR REPLACE FUNCTION public.admin_employee_document_require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.current_user_can_access_module('admin')
    OR public.current_user_has_admin_module_access()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to manage employee documents.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_document_actor_name(p_uid uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(nullif(btrim(public.admin_recruitment_actor_name(p_uid)), ''), 'Admin');
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_document_check_version(p_expected integer, p_actual integer)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_expected IS NOT NULL AND p_expected <> p_actual THEN
    RAISE EXCEPTION 'This document was updated by someone else. Refresh and try again.'
      USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_document_seed(p_employee_master_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  PERFORM public.admin_employee_document_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.admin_ifsp_employee_master WHERE id = p_employee_master_id) THEN
    RAISE EXCEPTION 'Employee not found.';
  END IF;

  INSERT INTO public.admin_employee_master_documents (employee_master_id, document_key, label, required)
  SELECT p_employee_master_id, t.key, t.label, t.required
  FROM public.admin_recruitment_document_types t
  WHERE t.active
  ON CONFLICT (employee_master_id, document_key) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_document_submit(
  p_employee_master_id bigint,
  p_document_key text,
  p_file jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_employee_document_require_admin();
  RETURN public.admin_employee_document_apply_submit(p_employee_master_id, p_document_key, p_file, 'staff');
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_employee_document_review(
  p_document_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d public.admin_employee_master_documents%rowtype;
  v_reason text := public.admin_recruitment_clean(p_reason);
  v_to text;
BEGIN
  PERFORM public.admin_employee_document_require_admin();
  v_to := CASE p_action
    WHEN 'start_review' THEN 'under_review'
    WHEN 'verify' THEN 'verified'
    WHEN 'reject' THEN 'rejected'
  END;
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unknown review action.';
  END IF;
  IF p_action = 'reject' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter the reason for rejecting this document so the employee can correct it.';
  END IF;

  SELECT * INTO v_d FROM public.admin_employee_master_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.';
  END IF;
  PERFORM public.admin_employee_document_check_version(p_expected_version, v_d.version);

  IF v_d.status = v_to THEN
    RETURN to_jsonb(v_d);
  END IF;
  IF p_action = 'start_review' AND v_d.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted documents can be taken up for review.';
  END IF;
  IF p_action IN ('verify', 'reject') AND v_d.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Only submitted or under-review documents can be verified or rejected.';
  END IF;
  IF p_action IN ('verify', 'reject') AND v_d.file IS NULL THEN
    RAISE EXCEPTION 'No file is attached for this document.';
  END IF;

  UPDATE public.admin_employee_master_documents SET
    status = v_to,
    reviewed_by = auth.uid(),
    reviewed_by_name = public.admin_employee_document_actor_name(auth.uid()),
    reviewed_at = now(),
    rejection_reason = CASE WHEN p_action = 'reject' THEN v_reason ELSE NULL END,
    version = version + 1
  WHERE id = v_d.id
  RETURNING * INTO v_d;

  RETURN to_jsonb(v_d);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_document_portal_issue(
  p_employee_master_id bigint,
  p_token_hash text,
  p_valid_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := greatest(1, least(coalesce(p_valid_days, 14), 60));
  v_expires timestamptz := now() + make_interval(days => v_days);
BEGIN
  PERFORM public.admin_employee_document_require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.admin_ifsp_employee_master WHERE id = p_employee_master_id) THEN
    RAISE EXCEPTION 'Employee not found.';
  END IF;
  IF public.admin_recruitment_clean(p_token_hash) IS NULL THEN
    RAISE EXCEPTION 'Token hash is required.';
  END IF;

  PERFORM public.admin_employee_document_seed(p_employee_master_id);

  UPDATE public.admin_employee_document_portal_tokens
  SET revoked_at = coalesce(revoked_at, now())
  WHERE employee_master_id = p_employee_master_id
    AND purpose = 'documents'
    AND revoked_at IS NULL;

  INSERT INTO public.admin_employee_document_portal_tokens (
    employee_master_id, purpose, token_hash, expires_at
  ) VALUES (
    p_employee_master_id, 'documents', p_token_hash, v_expires
  );

  RETURN jsonb_build_object(
    'employeeMasterId', p_employee_master_id,
    'expiresAt', v_expires,
    'validDays', v_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_employee_document_portal_token(p_token_hash text)
RETURNS public.admin_employee_document_portal_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_employee_document_portal_tokens%rowtype;
BEGIN
  SELECT * INTO v_t
  FROM public.admin_employee_document_portal_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND OR v_t.revoked_at IS NOT NULL OR v_t.expires_at < now() THEN
    RAISE EXCEPTION 'This link has expired or is no longer valid. Please contact HR.';
  END IF;
  UPDATE public.admin_employee_document_portal_tokens
  SET last_used_at = now(), use_count = use_count + 1
  WHERE id = v_t.id
  RETURNING * INTO v_t;
  RETURN v_t;
END;
$$;

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

  -- Ensure checklist rows exist when the employee opens the link.
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

CREATE OR REPLACE FUNCTION public.admin_employee_document_portal_attach(
  p_token_hash text,
  p_document_key text,
  p_file jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.admin_employee_document_portal_tokens%rowtype;
BEGIN
  v_t := public.admin_employee_document_portal_token(p_token_hash);
  PERFORM public.admin_employee_document_apply_submit(
    v_t.employee_master_id,
    p_document_key,
    p_file,
    'employee_link'
  );
  RETURN public.admin_employee_document_portal_resolve(p_token_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_employee_document_apply_submit(bigint, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_employee_document_portal_token(text) FROM PUBLIC;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_employee_document_seed(bigint)',
    'public.admin_employee_document_submit(bigint, text, jsonb)',
    'public.admin_employee_document_review(uuid, text, text, integer)',
    'public.admin_employee_document_portal_issue(bigint, text, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.admin_employee_document_portal_resolve(text)',
    'public.admin_employee_document_portal_attach(text, text, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

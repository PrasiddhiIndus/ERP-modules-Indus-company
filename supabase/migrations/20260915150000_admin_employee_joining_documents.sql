-- Employee joining documents uploaded during Admin Onboarding (per employee).
-- Files live in Cloudflare R2 (prefix admin-joining/); metadata in Postgres.

CREATE OR REPLACE FUNCTION public.admin_employee_policy_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_employee_joining_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  doc_kind text NOT NULL DEFAULT 'other'
    CHECK (doc_kind IN (
      'aadhaar',
      'pan',
      'photo',
      'bank_proof',
      'education',
      'experience',
      'appointment',
      'other'
    )),
  title text NOT NULL,
  file_name text,
  file_size integer,
  content_type text,
  object_key text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_employee_joining_documents IS
  'Joining documents uploaded for an employee during Admin Onboarding.';

CREATE INDEX IF NOT EXISTS admin_employee_joining_documents_employee_idx
  ON public.admin_employee_joining_documents (employee_master_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_admin_employee_joining_documents_updated_at
  ON public.admin_employee_joining_documents;
CREATE TRIGGER trg_admin_employee_joining_documents_updated_at
  BEFORE UPDATE ON public.admin_employee_joining_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_employee_policy_set_updated_at();

ALTER TABLE public.admin_employee_joining_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_employee_joining_documents TO authenticated;
GRANT ALL ON public.admin_employee_joining_documents TO service_role;

DROP POLICY IF EXISTS admin_employee_joining_documents_select ON public.admin_employee_joining_documents;
DROP POLICY IF EXISTS admin_employee_joining_documents_insert ON public.admin_employee_joining_documents;
DROP POLICY IF EXISTS admin_employee_joining_documents_update ON public.admin_employee_joining_documents;
DROP POLICY IF EXISTS admin_employee_joining_documents_delete ON public.admin_employee_joining_documents;

CREATE POLICY admin_employee_joining_documents_select
  ON public.admin_employee_joining_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master m
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.id = admin_employee_joining_documents.employee_master_id
        AND (
          m.user_id = auth.uid()
          OR (
            p.employee_code IS NOT NULL
            AND btrim(p.employee_code) <> ''
            AND m.employee_code = p.employee_code
          )
        )
    )
  );

CREATE POLICY admin_employee_joining_documents_insert
  ON public.admin_employee_joining_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE POLICY admin_employee_joining_documents_update
  ON public.admin_employee_joining_documents
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  )
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE POLICY admin_employee_joining_documents_delete
  ON public.admin_employee_joining_documents
  FOR DELETE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

NOTIFY pgrst, 'reload schema';

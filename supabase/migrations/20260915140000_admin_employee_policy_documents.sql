-- Admin Policies / Terms & Conditions documents and employee assignments.
-- Files live in Cloudflare R2 (prefix admin-policies/); this stores metadata + who is assigned.

CREATE OR REPLACE FUNCTION public.admin_employee_policy_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_employee_policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  doc_type text NOT NULL
    CHECK (doc_type IN ('policy', 'terms')),
  file_name text,
  file_size integer,
  content_type text,
  object_key text,
  assignment_scope text NOT NULL DEFAULT 'selected'
    CHECK (assignment_scope IN ('selected', 'department', 'all_active')),
  assignment_department text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_employee_policy_documents IS
  'Company policies and terms files uploaded by Admin and assigned to employees.';

CREATE INDEX IF NOT EXISTS admin_employee_policy_documents_type_idx
  ON public.admin_employee_policy_documents (doc_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_employee_policy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL
    REFERENCES public.admin_employee_policy_documents(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, employee_master_id)
);

COMMENT ON TABLE public.admin_employee_policy_assignments IS
  'Which employees a policy or terms document is assigned to.';

CREATE INDEX IF NOT EXISTS admin_employee_policy_assignments_employee_idx
  ON public.admin_employee_policy_assignments (employee_master_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS admin_employee_policy_assignments_document_idx
  ON public.admin_employee_policy_assignments (document_id);

DROP TRIGGER IF EXISTS trg_admin_employee_policy_documents_updated_at
  ON public.admin_employee_policy_documents;
CREATE TRIGGER trg_admin_employee_policy_documents_updated_at
  BEFORE UPDATE ON public.admin_employee_policy_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_employee_policy_set_updated_at();

ALTER TABLE public.admin_employee_policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_employee_policy_assignments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_employee_policy_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_employee_policy_assignments TO authenticated;
GRANT ALL ON public.admin_employee_policy_documents TO service_role;
GRANT ALL ON public.admin_employee_policy_assignments TO service_role;

DROP POLICY IF EXISTS admin_employee_policy_documents_select ON public.admin_employee_policy_documents;
DROP POLICY IF EXISTS admin_employee_policy_documents_insert ON public.admin_employee_policy_documents;
DROP POLICY IF EXISTS admin_employee_policy_documents_update ON public.admin_employee_policy_documents;
DROP POLICY IF EXISTS admin_employee_policy_documents_delete ON public.admin_employee_policy_documents;
DROP POLICY IF EXISTS admin_employee_policy_assignments_select ON public.admin_employee_policy_assignments;
DROP POLICY IF EXISTS admin_employee_policy_assignments_insert ON public.admin_employee_policy_assignments;
DROP POLICY IF EXISTS admin_employee_policy_assignments_update ON public.admin_employee_policy_assignments;
DROP POLICY IF EXISTS admin_employee_policy_assignments_delete ON public.admin_employee_policy_assignments;

-- Admin team: full access. Assigned employees: read their own assignments and files.
CREATE POLICY admin_employee_policy_documents_select
  ON public.admin_employee_policy_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR EXISTS (
      SELECT 1
      FROM public.admin_employee_policy_assignments a
      JOIN public.admin_ifsp_employee_master m ON m.id = a.employee_master_id
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.document_id = admin_employee_policy_documents.id
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

CREATE POLICY admin_employee_policy_documents_insert
  ON public.admin_employee_policy_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE POLICY admin_employee_policy_documents_update
  ON public.admin_employee_policy_documents
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  )
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE POLICY admin_employee_policy_documents_delete
  ON public.admin_employee_policy_documents
  FOR DELETE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE POLICY admin_employee_policy_assignments_select
  ON public.admin_employee_policy_assignments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
    OR EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master m
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.id = admin_employee_policy_assignments.employee_master_id
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

CREATE POLICY admin_employee_policy_assignments_insert
  ON public.admin_employee_policy_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE POLICY admin_employee_policy_assignments_update
  ON public.admin_employee_policy_assignments
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  )
  WITH CHECK (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

CREATE POLICY admin_employee_policy_assignments_delete
  ON public.admin_employee_policy_assignments
  FOR DELETE TO authenticated
  USING (
    (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT public.current_user_has_admin_module_access())
  );

NOTIFY pgrst, 'reload schema';

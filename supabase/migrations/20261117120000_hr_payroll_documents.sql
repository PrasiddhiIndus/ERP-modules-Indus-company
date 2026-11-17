-- Payroll & compliance document store for the HR payroll module.
-- One row per prototype record (sites, employees, runs, loans, held, arrears, revisions, masters, hr_attendance, iom).
-- Bank account numbers and PAN stay inside the jsonb payload. The audit log stores a redacted copy only.

CREATE TABLE IF NOT EXISTS public.pay_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection text NOT NULL,
  doc_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  UNIQUE (collection, doc_id)
);

COMMENT ON TABLE public.pay_documents IS
  'HR payroll records: site rules, employee pay, salary runs, loans, held salary, arrears, revisions, statutory masters, HR attendance handoff.';

CREATE INDEX IF NOT EXISTS pay_documents_collection_idx
  ON public.pay_documents (collection);

CREATE TABLE IF NOT EXISTS public.pay_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  collection text,
  doc_id text,
  summary text,
  before jsonb,
  after jsonb,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pay_audit_log IS
  'Who changed or exported payroll data. Account numbers, PAN and Aadhaar are not stored in full.';

CREATE INDEX IF NOT EXISTS pay_audit_log_created_idx
  ON public.pay_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.current_user_can_access_hr_payroll()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND auth.uid() IS NOT NULL
      AND (
        public.normalize_erp_role(p.role) IN ('super_admin', 'super_admin_pro', 'admin')
        OR public.normalize_erp_module_key(p.team) = 'hr'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules')) AS m(value)
          WHERE public.normalize_erp_module_key(m.value) = 'hr'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')) AS s(value)
          WHERE s.value = 'hr.salary-management'
             OR s.value LIKE 'hr.salary-management.%'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_can_access_hr_payroll() IS
  'HR payroll: full HR access, the Salary Management share, or an admin role. Recruitment-only users are excluded.';

ALTER TABLE public.pay_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pay_documents_select ON public.pay_documents;
DROP POLICY IF EXISTS pay_documents_insert ON public.pay_documents;
DROP POLICY IF EXISTS pay_documents_update ON public.pay_documents;
DROP POLICY IF EXISTS pay_documents_delete ON public.pay_documents;
DROP POLICY IF EXISTS pay_audit_log_select ON public.pay_audit_log;
DROP POLICY IF EXISTS pay_audit_log_insert ON public.pay_audit_log;

CREATE POLICY pay_documents_select
  ON public.pay_documents FOR SELECT TO authenticated
  USING (public.current_user_can_access_hr_payroll());

CREATE POLICY pay_documents_insert
  ON public.pay_documents FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_hr_payroll());

CREATE POLICY pay_documents_update
  ON public.pay_documents FOR UPDATE TO authenticated
  USING (public.current_user_can_access_hr_payroll())
  WITH CHECK (public.current_user_can_access_hr_payroll());

CREATE POLICY pay_documents_delete
  ON public.pay_documents FOR DELETE TO authenticated
  USING (public.current_user_can_access_hr_payroll());

CREATE POLICY pay_audit_log_select
  ON public.pay_audit_log FOR SELECT TO authenticated
  USING (public.current_user_can_access_hr_payroll());

CREATE POLICY pay_audit_log_insert
  ON public.pay_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_hr_payroll());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_documents TO authenticated;
GRANT SELECT, INSERT ON public.pay_audit_log TO authenticated;
GRANT ALL ON public.pay_documents TO service_role;
GRANT ALL ON public.pay_audit_log TO service_role;

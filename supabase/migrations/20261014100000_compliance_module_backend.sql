-- Compliance module storage and access.
-- Forms (wage, social security, OSH-WC) and payroll filings are limited to
-- Vivek, Vaisakh / Vaishak, and Rahul.

CREATE OR REPLACE FUNCTION public.compliance_module_user_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $compliance_access$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(btrim(coalesce(p.email, ''))) IN (
        'rahul.ifspl@gmail.com',
        'vivek@indusfire.com',
        'sharmavivekz683@gmail.com',
        'vaisakh@indusfire.com',
        'vaishak@indusfire.com',
        'vaisakh_fire@yahoo.co.in'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
    'rahul.ifspl@gmail.com',
    'vivek@indusfire.com',
    'sharmavivekz683@gmail.com',
    'vaisakh@indusfire.com',
    'vaishak@indusfire.com',
    'vaisakh_fire@yahoo.co.in'
  );
$compliance_access$;

GRANT EXECUTE ON FUNCTION public.compliance_module_user_has_access() TO authenticated, service_role;

COMMENT ON FUNCTION public.compliance_module_user_has_access() IS
  'True only for Vivek, Vaisakh/Vaishak, and Rahul. Used by Compliance Forms and Payroll Compliance.';

CREATE TABLE IF NOT EXISTS public.admin_compliance_form_packs (
  id text PRIMARY KEY,
  code text NOT NULL CHECK (code IN ('wages', 'social', 'osh', 'wage-sheet')),
  label text NOT NULL DEFAULT '',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_compliance_form_packs_code
  ON public.admin_compliance_form_packs (code, updated_at DESC);

DROP TRIGGER IF EXISTS trg_admin_compliance_form_packs_updated_at ON public.admin_compliance_form_packs;
CREATE TRIGGER trg_admin_compliance_form_packs_updated_at
  BEFORE UPDATE ON public.admin_compliance_form_packs
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.admin_compliance_form_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_module_all ON public.admin_compliance_form_packs;
CREATE POLICY compliance_module_all ON public.admin_compliance_form_packs
  FOR ALL TO authenticated
  USING (public.compliance_module_user_has_access())
  WITH CHECK (public.compliance_module_user_has_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_compliance_form_packs TO authenticated, service_role;

COMMENT ON TABLE public.admin_compliance_form_packs IS
  'Saved Compliance Forms. code wages = Code on Wage, social = Code on Social security, osh = Code on OSH-WC, wage-sheet = a single wage form opened by link.';

-- Payroll PF / ESIC month filings use the same three-person gate.
DROP POLICY IF EXISTS admin_salary_proc_all ON public.admin_compliance_filings;
DROP POLICY IF EXISTS compliance_module_all ON public.admin_compliance_filings;
CREATE POLICY compliance_module_all ON public.admin_compliance_filings
  FOR ALL TO authenticated
  USING (public.compliance_module_user_has_access())
  WITH CHECK (public.compliance_module_user_has_access());

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Payroll MIS reports — foundation (additive only).
--
-- New tables for the MIS reports in Salary Admin. Nothing existing is altered:
--   * admin_payroll_mis_settings       company-level MIS settings (default state, company name)
--   * admin_payroll_employee_tags      vertical, grade, cost centre, position type, exit reason, work state
--                                      (one row per employee; Employee Master itself is untouched)
--   * admin_payroll_departments        department → vertical master
--   * admin_payroll_cost_allocations   shared-staff split by vertical (%)
--   * admin_payroll_insurance_premiums annual group insurance premium per policy year
--   * admin_payroll_statutory_rates    statute components by state + effective date (EPS, EDLI, admin, PT/LWF slabs)
--   * admin_payroll_compliance_calendar due day per statute / state
--   * admin_payroll_budget             budget headcount / CTC by vertical and month
--   * admin_payroll_mis_access         vertical / department scoped report viewers
--   * admin_payroll_mis_audit_log      every report view and download
--   * admin_payroll_mis_job_log        after-lock snapshot errors (lock itself never fails)
--   * admin_payroll_mis_alert_recipients / admin_payroll_mis_alert_log  daily due-date alerts
--
-- Full MIS access = existing Salary Admin allowlist (admin_salary_user_has_access()).
-- Rollback: supabase/rollbacks/20261010120000_payroll_mis_foundation_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_full_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_salary_user_has_access();
$$;

CREATE TABLE IF NOT EXISTS public.admin_payroll_mis_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vertical_code text NOT NULL,
  department text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_payroll_mis_access_unique
  ON public.admin_payroll_mis_access (user_id, vertical_code, coalesce(lower(btrim(department)), ''));

CREATE OR REPLACE FUNCTION public.admin_payroll_mis_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_salary_user_has_access()
      OR EXISTS (SELECT 1 FROM public.admin_payroll_mis_access a WHERE a.user_id = auth.uid());
$$;

-- What the signed-in user may see: full, or a list of vertical / department scopes.
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_my_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'full', public.admin_salary_user_has_access(),
    'scopes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('vertical', a.vertical_code, 'department', a.department)
                       ORDER BY a.vertical_code, a.department)
      FROM public.admin_payroll_mis_access a
      WHERE a.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_mis_settings (
  key text PRIMARY KEY,
  value jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.admin_payroll_mis_settings (key, value) VALUES
  ('company_name', '"Indus Fire Safety Pvt. Ltd."'::jsonb),
  ('default_state', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Employee tags (Employee Master is not altered)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_employee_tags (
  employee_master_id bigint PRIMARY KEY
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  vertical_code text,
  grade text,
  cost_centre text,
  position_type text CHECK (position_type IS NULL OR position_type IN ('new', 'replacement')),
  exit_reason text,
  work_state text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Department → vertical master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_departments (
  department text PRIMARY KEY,
  vertical_code text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.admin_payroll_departments (department)
SELECT d FROM unnest(ARRAY[
  'Administration', 'Apprentice', 'Commercial', 'Finance', 'HR', 'Compliance', 'Dahej-HR', 'Operations',
  'Information System', 'Management', 'Marketing', 'Maintenance', 'NFPA', 'Procurement', 'Production',
  'Production - Neotech', 'Design', 'Projects', 'R&M', 'Technical', 'Training', 'Projects-FTC',
  'Production-FTC', 'Administration-FTC', 'Emergency Response Team-FTC', 'Maintenance-FTC', 'Other'
]) AS d
ON CONFLICT (department) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Shared-staff allocation %
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  vertical_code text NOT NULL,
  pct numeric(6,2) NOT NULL CHECK (pct > 0 AND pct <= 100),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_cost_allocations_unique UNIQUE (employee_master_id, vertical_code)
);

-- ---------------------------------------------------------------------------
-- Group insurance premium (annual, entered once)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_insurance_premiums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  policy_start date NOT NULL,
  policy_end date NOT NULL,
  annual_premium numeric(14,2) NOT NULL CHECK (annual_premium >= 0),
  spread text NOT NULL DEFAULT 'twelve' CHECK (spread IN ('twelve', 'remaining')),
  first_charge_month date,
  note text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_insurance_premiums_dates CHECK (policy_end >= policy_start)
);

-- ---------------------------------------------------------------------------
-- Statutory rate master (by state + effective date)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_statutory_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statute text NOT NULL CHECK (statute IN ('PF', 'ESI', 'PT', 'LWF', 'TDS')),
  component text NOT NULL,
  state text NOT NULL DEFAULT 'ALL',
  rate_pct numeric(8,4),
  fixed_amount numeric(14,2),
  wage_ceiling numeric(14,2),
  slabs_json jsonb,
  effective_from date NOT NULL,
  note text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_statutory_rates_unique UNIQUE (statute, component, state, effective_from)
);
INSERT INTO public.admin_payroll_statutory_rates (statute, component, state, rate_pct, wage_ceiling, effective_from, note) VALUES
  ('PF', 'eps', 'ALL', 8.33, 15000, DATE '2014-09-01', 'Pension (EPS) — same as the ECR file'),
  ('PF', 'epf_total', 'ALL', 12, NULL, DATE '2014-09-01', 'EPF contribution on PF wages — same as the ECR file'),
  ('PF', 'edli', 'ALL', 0.5, 15000, DATE '2014-09-01', 'EDLI'),
  ('PF', 'admin', 'ALL', 0.5, NULL, DATE '2018-06-01', 'PF admin charges')
ON CONFLICT (statute, component, state, effective_from) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Compliance calendar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_compliance_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statute text NOT NULL CHECK (statute IN ('PF', 'ESI', 'PT', 'LWF', 'TDS')),
  state text NOT NULL DEFAULT 'ALL',
  day_of_month integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  month_offset integer NOT NULL DEFAULT 1 CHECK (month_offset BETWEEN 0 AND 12),
  months_applicable integer[],
  note text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_compliance_calendar_unique UNIQUE (statute, state)
);
INSERT INTO public.admin_payroll_compliance_calendar (statute, state, day_of_month, month_offset, note) VALUES
  ('TDS', 'ALL', 7, 1, 'TDS on salary — 7th of the next month'),
  ('PF', 'ALL', 15, 1, 'PF — 15th of the next month'),
  ('ESI', 'ALL', 15, 1, 'ESI — 15th of the next month')
ON CONFLICT (statute, state) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Budget master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_code text NOT NULL,
  month_key text NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  budget_headcount numeric(10,2),
  budget_ctc numeric(16,2),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_budget_unique UNIQUE (vertical_code, month_key)
);

-- ---------------------------------------------------------------------------
-- Audit log (every view and download)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_mis_audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  report text NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'download')),
  format text,
  period jsonb,
  filters jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_payroll_mis_audit_log_created
  ON public.admin_payroll_mis_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_payroll_mis_log(
  p_report text,
  p_action text,
  p_format text DEFAULT NULL,
  p_period jsonb DEFAULT NULL,
  p_filters jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_payroll_mis_has_access() THEN
    RAISE EXCEPTION 'You do not have access to payroll reports.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.admin_payroll_mis_audit_log (user_id, user_email, report, action, format, period, filters)
  VALUES (auth.uid(), auth.jwt() ->> 'email', left(p_report, 80), p_action, left(p_format, 10), p_period, p_filters);
END;
$$;

-- ---------------------------------------------------------------------------
-- Job log (snapshot errors) and alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_mis_job_log (
  id bigserial PRIMARY KEY,
  run_id uuid,
  month_key text,
  job text NOT NULL,
  ok boolean NOT NULL,
  message text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_payroll_mis_job_log_month
  ON public.admin_payroll_mis_job_log (month_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_payroll_mis_alert_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_mis_alert_recipients_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.admin_payroll_mis_alert_log (
  id bigserial PRIMARY KEY,
  alert_date date NOT NULL,
  payment_id uuid NOT NULL,
  status text NOT NULL,
  sent_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_mis_alert_log_once UNIQUE (alert_date, payment_id)
);

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_payroll_mis_settings', 'admin_payroll_employee_tags', 'admin_payroll_departments',
    'admin_payroll_cost_allocations', 'admin_payroll_insurance_premiums', 'admin_payroll_statutory_rates',
    'admin_payroll_compliance_calendar', 'admin_payroll_budget', 'admin_payroll_mis_access',
    'admin_payroll_mis_audit_log', 'admin_payroll_mis_job_log', 'admin_payroll_mis_alert_recipients',
    'admin_payroll_mis_alert_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
  END LOOP;
END
$do$;

GRANT USAGE, SELECT ON SEQUENCE public.admin_payroll_mis_audit_log_id_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_payroll_mis_job_log_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_payroll_mis_alert_log_id_seq TO service_role;

-- Salary Admin users maintain every MIS master.
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_payroll_mis_settings', 'admin_payroll_departments', 'admin_payroll_cost_allocations',
    'admin_payroll_insurance_premiums', 'admin_payroll_statutory_rates', 'admin_payroll_compliance_calendar',
    'admin_payroll_budget', 'admin_payroll_mis_access', 'admin_payroll_mis_alert_recipients'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_full', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.admin_payroll_mis_full_access()) WITH CHECK (public.admin_payroll_mis_full_access())',
      t || '_full', t);
  END LOOP;
END
$do$;

-- Scoped viewers read the lookups the reports need (labels, splits, settings).
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_payroll_mis_settings', 'admin_payroll_departments', 'admin_payroll_cost_allocations',
    'admin_payroll_statutory_rates', 'admin_payroll_compliance_calendar'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.admin_payroll_mis_has_access())',
      t || '_read', t);
  END LOOP;
END
$do$;

-- Employee tags: Salary Admin users and Employee Master editors.
DROP POLICY IF EXISTS admin_payroll_employee_tags_read ON public.admin_payroll_employee_tags;
CREATE POLICY admin_payroll_employee_tags_read ON public.admin_payroll_employee_tags
  FOR SELECT TO authenticated
  USING (public.admin_payroll_mis_full_access() OR public.admin_employee_flags_can_edit());
DROP POLICY IF EXISTS admin_payroll_employee_tags_write ON public.admin_payroll_employee_tags;
CREATE POLICY admin_payroll_employee_tags_write ON public.admin_payroll_employee_tags
  FOR ALL TO authenticated
  USING (public.admin_payroll_mis_full_access() OR public.admin_employee_flags_can_edit())
  WITH CHECK (public.admin_payroll_mis_full_access() OR public.admin_employee_flags_can_edit());

-- Access list: users can also read their own scope rows.
DROP POLICY IF EXISTS admin_payroll_mis_access_own ON public.admin_payroll_mis_access;
CREATE POLICY admin_payroll_mis_access_own ON public.admin_payroll_mis_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Audit / job / alert logs: read by Salary Admin users; written only by functions.
DROP POLICY IF EXISTS admin_payroll_mis_audit_log_read ON public.admin_payroll_mis_audit_log;
CREATE POLICY admin_payroll_mis_audit_log_read ON public.admin_payroll_mis_audit_log
  FOR SELECT TO authenticated USING (public.admin_payroll_mis_full_access());
DROP POLICY IF EXISTS admin_payroll_mis_job_log_read ON public.admin_payroll_mis_job_log;
CREATE POLICY admin_payroll_mis_job_log_read ON public.admin_payroll_mis_job_log
  FOR SELECT TO authenticated USING (public.admin_payroll_mis_full_access());
DROP POLICY IF EXISTS admin_payroll_mis_alert_log_read ON public.admin_payroll_mis_alert_log;
CREATE POLICY admin_payroll_mis_alert_log_read ON public.admin_payroll_mis_alert_log
  FOR SELECT TO authenticated USING (public.admin_payroll_mis_full_access());

REVOKE ALL ON FUNCTION public.admin_payroll_mis_full_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_has_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_my_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_log(text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_full_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_has_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_my_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_log(text, text, text, jsonb, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

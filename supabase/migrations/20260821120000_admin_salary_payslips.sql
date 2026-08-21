-- Salary slips and process-report freeze: one slip per employee per pay month.
-- Locked salary stays on admin_salary_month_lines; this table stores the slip for profiles and reports.

CREATE TABLE IF NOT EXISTS public.admin_salary_payslips (
  id text PRIMARY KEY,
  run_id uuid REFERENCES public.admin_salary_month_runs(id) ON DELETE SET NULL,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  pay_year integer NOT NULL CHECK (pay_year >= 2000 AND pay_year <= 2100),
  pay_month integer NOT NULL CHECK (pay_month >= 1 AND pay_month <= 12),
  processed_on date,
  slip_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_salary_payslips_month_emp_unique UNIQUE (month_key, employee_master_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_payslips_emp
  ON public.admin_salary_payslips (employee_master_id, month_key DESC);
CREATE INDEX IF NOT EXISTS idx_admin_salary_payslips_month
  ON public.admin_salary_payslips (month_key);
CREATE INDEX IF NOT EXISTS idx_admin_salary_payslips_run
  ON public.admin_salary_payslips (run_id);

DROP TRIGGER IF EXISTS trg_admin_salary_payslips_updated_at ON public.admin_salary_payslips;
CREATE TRIGGER trg_admin_salary_payslips_updated_at
  BEFORE UPDATE ON public.admin_salary_payslips
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.admin_salary_payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_proc_all ON public.admin_salary_payslips;
CREATE POLICY admin_salary_proc_all ON public.admin_salary_payslips
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_payslips TO authenticated, service_role;

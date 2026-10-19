-- Month-specific salary remarks (CTC Details → payslip / salary history).

CREATE TABLE IF NOT EXISTS public.admin_salary_employee_month_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_salary_employee_month_remarks_month_key_chk
    CHECK (month_key ~ '^\d{4}-\d{2}$'),
  CONSTRAINT admin_salary_employee_month_remarks_emp_month_unique
    UNIQUE (employee_master_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_employee_month_remarks_emp
  ON public.admin_salary_employee_month_remarks (employee_master_id, month_key DESC);

DROP TRIGGER IF EXISTS trg_admin_salary_employee_month_remarks_updated_at
  ON public.admin_salary_employee_month_remarks;
CREATE TRIGGER trg_admin_salary_employee_month_remarks_updated_at
  BEFORE UPDATE ON public.admin_salary_employee_month_remarks
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.admin_salary_employee_month_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_month_remarks_all ON public.admin_salary_employee_month_remarks;
CREATE POLICY admin_salary_month_remarks_all ON public.admin_salary_employee_month_remarks
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_employee_month_remarks
  TO authenticated, service_role;

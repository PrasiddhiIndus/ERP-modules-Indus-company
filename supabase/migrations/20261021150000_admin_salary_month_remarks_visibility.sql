-- CTC month remarks: visibility on payslip / annexure (opt-in; default hidden).

ALTER TABLE public.admin_salary_employee_month_remarks
  ADD COLUMN IF NOT EXISTS show_on_payslip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_annexure boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_salary_employee_month_remarks.show_on_payslip IS
  'When false, the Remarks section is omitted from the payslip even if text is stored.';
COMMENT ON COLUMN public.admin_salary_employee_month_remarks.show_on_annexure IS
  'When false, the Remarks section is omitted from Annexure-I even if text is stored.';

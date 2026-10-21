-- Month remarks: show on documents is opt-in (unchecked by default for all employees).

ALTER TABLE public.admin_salary_employee_month_remarks
  ALTER COLUMN show_on_payslip SET DEFAULT false,
  ALTER COLUMN show_on_annexure SET DEFAULT false;

UPDATE public.admin_salary_employee_month_remarks
SET
  show_on_payslip = false,
  show_on_annexure = false
WHERE show_on_payslip IS DISTINCT FROM false
   OR show_on_annexure IS DISTINCT FROM false;

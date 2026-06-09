-- Unique employee code per ERP user (User Management / profiles).
-- Column name matches employee master + attendance: employee_code.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_code text;

COMMENT ON COLUMN public.profiles.employee_code IS
  'Unique employee code for this ERP user; matches admin_ifsp_employee_master.employee_code.';

DROP INDEX IF EXISTS public.profiles_emp_code_unique_idx;
DROP INDEX IF EXISTS public.profiles_employee_code_unique_idx;
CREATE UNIQUE INDEX profiles_employee_code_unique_idx
  ON public.profiles (lower(btrim(employee_code)))
  WHERE employee_code IS NOT NULL AND btrim(employee_code) <> '';

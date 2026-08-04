-- Daughter DOB on IFSPL Employee Master (parallel to son_dob).
ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS daughter_dob date;

COMMENT ON COLUMN public.admin_ifsp_employee_master.daughter_dob IS
  'Daughter date of birth for employee family details.';

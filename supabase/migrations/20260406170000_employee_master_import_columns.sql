-- Employee Master import columns (match sheet headers exactly)
ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS emp_code text,
  ADD COLUMN IF NOT EXISTS timestamp text,
  ADD COLUMN IF NOT EXISTS son_details text,
  ADD COLUMN IF NOT EXISTS daughter_details text,
  ADD COLUMN IF NOT EXISTS educational_qualification text;


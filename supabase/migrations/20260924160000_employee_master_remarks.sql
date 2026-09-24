-- Employee Master: free-text remarks on personal / employment details.

ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS remarks text;

COMMENT ON COLUMN public.admin_ifsp_employee_master.remarks IS
  'Free-text remarks for the employee (Employment dates / personal details).';

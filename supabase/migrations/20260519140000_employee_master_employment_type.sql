-- Employment category for admin employee master (permanent / consultant / voucher).
ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS employment_type text;

COMMENT ON COLUMN public.admin_ifsp_employee_master.employment_type IS
  'permanent | consultant | voucher — drives auto employee_id format for new rows; legacy rows may infer from employee_id.';

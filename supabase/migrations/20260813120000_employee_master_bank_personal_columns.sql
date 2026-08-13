-- Ensure Employee Master personal / bank fields exist for profile + salary processing.
-- Import Excel (UAN, ESIC, A/c number, IFSC) writes these columns; Personal details edits them.

ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS uan_no text,
  ADD COLUMN IF NOT EXISTS esic_no text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_no text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS email_id text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS confirmation_date date;

COMMENT ON COLUMN public.admin_ifsp_employee_master.uan_no IS
  'PF UAN — imported from salary bank sheet or edited on Personal details.';
COMMENT ON COLUMN public.admin_ifsp_employee_master.esic_no IS
  'ESIC number — imported from salary bank sheet or edited on Personal details.';
COMMENT ON COLUMN public.admin_ifsp_employee_master.bank_account_no IS
  'Bank account number — source of truth for Salary Processing Account column.';
COMMENT ON COLUMN public.admin_ifsp_employee_master.ifsc_code IS
  'IFSC — source of truth for Salary Processing IFSC column.';
COMMENT ON COLUMN public.admin_ifsp_employee_master.bank_name IS
  'Bank name — Personal details only (optional).';

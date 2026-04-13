-- Admin IFSP Employee Master: columns aligned with Employee Master spreadsheet labels
ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS uan_no text,
  ADD COLUMN IF NOT EXISTS esic_no text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_no text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS email_id text,
  ADD COLUMN IF NOT EXISTS marital_status text;

COMMENT ON COLUMN public.admin_ifsp_employee_master.employee_id IS 'IFSPL_employee_system_id — sequential per tenant; app-generated.';
COMMENT ON COLUMN public.admin_ifsp_employee_master.other_experience IS 'Previous_Experience (years before IFSPL).';
COMMENT ON COLUMN public.admin_ifsp_employee_master.years_of_experience IS 'Optional snapshot; UI shows Total = Previous + tenure from Date_of_Joining.';

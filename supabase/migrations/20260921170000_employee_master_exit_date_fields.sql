-- IFSPL In-house Employee Master: employment / exit date fields for Personal details.
-- confirmation_date already exists; add resignation, relieving, and F&F done dates.

ALTER TABLE public.admin_ifsp_employee_master
  ADD COLUMN IF NOT EXISTS date_of_resignation date,
  ADD COLUMN IF NOT EXISTS date_of_relieving date,
  ADD COLUMN IF NOT EXISTS fnf_done_date date;

COMMENT ON COLUMN public.admin_ifsp_employee_master.date_of_resignation IS
  'Date the employee resigned (Personal details).';
COMMENT ON COLUMN public.admin_ifsp_employee_master.date_of_relieving IS
  'Official relieving date (Personal details).';
COMMENT ON COLUMN public.admin_ifsp_employee_master.fnf_done_date IS
  'Full & final settlement completed date (Personal details).';

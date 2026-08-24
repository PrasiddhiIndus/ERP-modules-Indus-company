-- CRM outreach client master — extended site & contact fields.

ALTER TABLE public.crm_outreach_clients
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS primary_contact_designation text,
  ADD COLUMN IF NOT EXISTS primary_contact_mobile text,
  ADD COLUMN IF NOT EXISTS secondary_contact_name text,
  ADD COLUMN IF NOT EXISTS secondary_contact_designation text,
  ADD COLUMN IF NOT EXISTS secondary_contact_mobile text,
  ADD COLUMN IF NOT EXISTS secondary_contact_email text,
  ADD COLUMN IF NOT EXISTS manpower_required integer,
  ADD COLUMN IF NOT EXISTS site_status text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS raw_notes text;

CREATE INDEX IF NOT EXISTS idx_crm_outreach_clients_state
  ON public.crm_outreach_clients (state);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_clients_site_status
  ON public.crm_outreach_clients (site_status);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_clients_manpower_required
  ON public.crm_outreach_clients (manpower_required);

COMMENT ON COLUMN public.crm_outreach_clients.city IS 'Site location (city).';
COMMENT ON COLUMN public.crm_outreach_clients.primary_contact_person IS 'Primary contact — Admin-Fire Sup.';
COMMENT ON COLUMN public.crm_outreach_clients.contact_email IS 'Primary contact email (mail id).';

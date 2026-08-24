-- Dedicated client master for CRM & Outreach (separate from marketing_clients).

CREATE TABLE IF NOT EXISTS public.crm_outreach_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  primary_contact_person text,
  contact_email text,
  contact_emails text,
  city text,
  business_module text NOT NULL DEFAULT 'fire'
    CHECK (business_module IN ('fire', 'amc', 'academy', 'axiom')),
  outreach_status text NOT NULL DEFAULT 'Active'
    CHECK (outreach_status IN ('Active', 'Lead', 'Inactive')),
  last_contacted_at date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_outreach_clients_business_module
  ON public.crm_outreach_clients (business_module);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_clients_outreach_status
  ON public.crm_outreach_clients (outreach_status);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_clients_city
  ON public.crm_outreach_clients (city);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_clients_client_name
  ON public.crm_outreach_clients (client_name);

DROP TRIGGER IF EXISTS trg_crm_outreach_clients_updated_at ON public.crm_outreach_clients;
CREATE TRIGGER trg_crm_outreach_clients_updated_at
  BEFORE UPDATE ON public.crm_outreach_clients
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.crm_outreach_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_outreach_clients_access ON public.crm_outreach_clients;
CREATE POLICY crm_outreach_clients_access ON public.crm_outreach_clients
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_outreach_clients TO authenticated, service_role;

COMMENT ON TABLE public.crm_outreach_clients IS
  'CRM & Outreach client master — independent from marketing_clients.';

-- One-time copy: clients referenced by past campaigns or with outreach activity on marketing_clients.
INSERT INTO public.crm_outreach_clients (
  id,
  client_name,
  primary_contact_person,
  contact_email,
  contact_emails,
  city,
  business_module,
  outreach_status,
  last_contacted_at,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT
  mc.id,
  mc.client_name,
  mc.primary_contact_person,
  mc.contact_email,
  mc.contact_emails,
  mc.city,
  COALESCE(mc.outreach_business_module, 'fire'),
  COALESCE(mc.outreach_status, 'Active'),
  mc.last_contacted_at,
  mc.created_by,
  mc.updated_by,
  COALESCE(mc.created_at, now()),
  COALESCE(mc.updated_at, now())
FROM public.marketing_clients mc
WHERE mc.id IN (
  SELECT DISTINCT client_id
  FROM public.mail_campaign_recipients
  WHERE client_id IS NOT NULL
)
   OR mc.last_contacted_at IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Drop links to clients that no longer exist in either master.
UPDATE public.mail_campaign_recipients mcr
SET client_id = NULL
WHERE mcr.client_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_outreach_clients c WHERE c.id = mcr.client_id
  );

-- Repoint campaign recipients FK to the dedicated CRM client table.
ALTER TABLE public.mail_campaign_recipients
  DROP CONSTRAINT IF EXISTS mail_campaign_recipients_client_id_fkey;

ALTER TABLE public.mail_campaign_recipients
  ADD CONSTRAINT mail_campaign_recipients_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.crm_outreach_clients(id) ON DELETE SET NULL;

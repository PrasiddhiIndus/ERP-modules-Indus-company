-- CRM & Outreach: mail templates, sender mailboxes, campaigns + marketing_clients outreach fields.

-- ---------------------------------------------------------------------------
-- marketing_clients — outreach-specific columns (shared client master)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_clients' AND column_name = 'outreach_business_module'
  ) THEN
    ALTER TABLE public.marketing_clients
      ADD COLUMN outreach_business_module text
        CHECK (outreach_business_module IS NULL OR outreach_business_module IN ('fire', 'amc', 'academy', 'axiom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_clients' AND column_name = 'outreach_status'
  ) THEN
    ALTER TABLE public.marketing_clients
      ADD COLUMN outreach_status text NOT NULL DEFAULT 'Active'
        CHECK (outreach_status IN ('Active', 'Lead', 'Inactive'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_clients' AND column_name = 'last_contacted_at'
  ) THEN
    ALTER TABLE public.marketing_clients ADD COLUMN last_contacted_at date;
  END IF;
END $$;

COMMENT ON COLUMN public.marketing_clients.outreach_business_module IS 'CRM outreach vertical tag (fire, amc, academy, axiom).';
COMMENT ON COLUMN public.marketing_clients.outreach_status IS 'Outreach pipeline status for Client Master & Mail Outreach.';
COMMENT ON COLUMN public.marketing_clients.last_contacted_at IS 'Last mail campaign contact date.';

CREATE INDEX IF NOT EXISTS idx_marketing_clients_outreach_module
  ON public.marketing_clients (outreach_business_module);
CREATE INDEX IF NOT EXISTS idx_marketing_clients_outreach_status
  ON public.marketing_clients (outreach_status);

-- ---------------------------------------------------------------------------
-- Access helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_has_crm_outreach_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('super_admin', 'super_admin_pro', 'admin')
          OR lower(trim(coalesce(p.team, ''))) IN ('marketing')
          OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'marketing'
          OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'crmOutreach'
        )
    );
$$;

COMMENT ON FUNCTION public.current_user_has_crm_outreach_access() IS
  'RLS helper: CRM & Outreach — marketing/crmOutreach module, admins, super admins, or legacy users without profiles.';

GRANT EXECUTE ON FUNCTION public.current_user_has_crm_outreach_access() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sender_mailboxes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sender_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail text NOT NULL,
  display_name text NOT NULL,
  used_for text,
  status text NOT NULL DEFAULT 'Pending Verification'
    CHECK (status IN ('Verified', 'Pending Verification', 'Disabled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sender_mailboxes_mail_unique UNIQUE (mail)
);

CREATE INDEX IF NOT EXISTS idx_sender_mailboxes_status ON public.sender_mailboxes (status);

DROP TRIGGER IF EXISTS trg_sender_mailboxes_updated_at ON public.sender_mailboxes;
CREATE TRIGGER trg_sender_mailboxes_updated_at
  BEFORE UPDATE ON public.sender_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.sender_mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sender_mailboxes_crm_access ON public.sender_mailboxes;
CREATE POLICY sender_mailboxes_crm_access ON public.sender_mailboxes
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sender_mailboxes TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mail_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General Update',
  default_sender_mailbox_id uuid REFERENCES public.sender_mailboxes(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_templates_category ON public.mail_templates (category);

DROP TRIGGER IF EXISTS trg_mail_templates_updated_at ON public.mail_templates;
CREATE TRIGGER trg_mail_templates_updated_at
  BEFORE UPDATE ON public.mail_templates
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.mail_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_templates_crm_access ON public.mail_templates;
CREATE POLICY mail_templates_crm_access ON public.mail_templates
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_templates TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mail_campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES public.mail_templates(id) ON DELETE SET NULL,
  template_name text,
  sender_mailbox_id uuid REFERENCES public.sender_mailboxes(id) ON DELETE SET NULL,
  sender_mail text NOT NULL,
  subject text NOT NULL,
  body_template text NOT NULL DEFAULT '',
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  status text NOT NULL DEFAULT 'Queued'
    CHECK (status IN ('Queued', 'Delivered', 'Partial', 'Failed')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_campaigns_sent_at ON public.mail_campaigns (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_campaigns_status ON public.mail_campaigns (status);

DROP TRIGGER IF EXISTS trg_mail_campaigns_updated_at ON public.mail_campaigns;
CREATE TRIGGER trg_mail_campaigns_updated_at
  BEFORE UPDATE ON public.mail_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.mail_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_campaigns_crm_access ON public.mail_campaigns;
CREATE POLICY mail_campaigns_crm_access ON public.mail_campaigns
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_campaigns TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mail_campaign_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.mail_campaigns(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.marketing_clients(id) ON DELETE SET NULL,
  client_email text NOT NULL,
  client_name text,
  rendered_subject text NOT NULL DEFAULT '',
  rendered_body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Queued'
    CHECK (status IN ('Queued', 'Delivered', 'Failed', 'Skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_campaign_recipients_campaign
  ON public.mail_campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_mail_campaign_recipients_client
  ON public.mail_campaign_recipients (client_id);

ALTER TABLE public.mail_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_campaign_recipients_crm_access ON public.mail_campaign_recipients;
CREATE POLICY mail_campaign_recipients_crm_access ON public.mail_campaign_recipients
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_campaign_recipients TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Starter sender mailboxes (only when table is empty)
-- ---------------------------------------------------------------------------
INSERT INTO public.sender_mailboxes (mail, display_name, used_for, status)
SELECT v.mail, v.display_name, v.used_for, v.status
FROM (
  VALUES
    ('events@indusfiresafety.com', 'Indus Events Desk', 'Expo & event invites', 'Verified'),
    ('info@indusfiresafety.com', 'Indus Fire Safety', 'General client updates', 'Verified'),
    ('academy@induslearning.in', 'Indus Learning Academy', 'Academy announcements', 'Verified')
) AS v(mail, display_name, used_for, status)
WHERE NOT EXISTS (SELECT 1 FROM public.sender_mailboxes LIMIT 1);

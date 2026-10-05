-- CRM & Outreach — In-House (employee) mail: templates, groups, campaigns, recipient log.
-- Kept separate from the Client outreach tables (mail_templates / mail_campaigns) so the two
-- flows evolve independently. Employee emails stay in public.profiles; groups store profile ids only.

-- ---------------------------------------------------------------------------
-- crm_inhouse_mail_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_inhouse_mail_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General Update',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_crm_inhouse_mail_templates_updated_at ON public.crm_inhouse_mail_templates;
CREATE TRIGGER trg_crm_inhouse_mail_templates_updated_at
  BEFORE UPDATE ON public.crm_inhouse_mail_templates
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.crm_inhouse_mail_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_inhouse_mail_templates_crm_access ON public.crm_inhouse_mail_templates;
CREATE POLICY crm_inhouse_mail_templates_crm_access ON public.crm_inhouse_mail_templates
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_inhouse_mail_templates TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- crm_inhouse_mail_groups + members (profile ids only — no email copies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_inhouse_mail_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_inhouse_mail_groups_name
  ON public.crm_inhouse_mail_groups (lower(btrim(name)));

DROP TRIGGER IF EXISTS trg_crm_inhouse_mail_groups_updated_at ON public.crm_inhouse_mail_groups;
CREATE TRIGGER trg_crm_inhouse_mail_groups_updated_at
  BEFORE UPDATE ON public.crm_inhouse_mail_groups
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.crm_inhouse_mail_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_inhouse_mail_groups_crm_access ON public.crm_inhouse_mail_groups;
CREATE POLICY crm_inhouse_mail_groups_crm_access ON public.crm_inhouse_mail_groups
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_inhouse_mail_groups TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.crm_inhouse_mail_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.crm_inhouse_mail_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_inhouse_mail_group_members_unique UNIQUE (group_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_inhouse_mail_group_members_profile
  ON public.crm_inhouse_mail_group_members (profile_id);

ALTER TABLE public.crm_inhouse_mail_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_inhouse_mail_group_members_crm_access ON public.crm_inhouse_mail_group_members;
CREATE POLICY crm_inhouse_mail_group_members_crm_access ON public.crm_inhouse_mail_group_members
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_inhouse_mail_group_members TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- crm_inhouse_mail_campaigns (written by the API server; read by CRM users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_inhouse_mail_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES public.crm_inhouse_mail_templates(id) ON DELETE SET NULL,
  template_name text,
  sender_mail text NOT NULL DEFAULT '',
  subject text NOT NULL,
  body_template text NOT NULL DEFAULT '',
  group_ids uuid[] NOT NULL DEFAULT '{}',
  group_names text[] NOT NULL DEFAULT '{}',
  total_recipients integer NOT NULL DEFAULT 0 CHECK (total_recipients >= 0),
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  status text NOT NULL DEFAULT 'Sending'
    CHECK (status IN ('Sending', 'Delivered', 'Partial', 'Failed')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_inhouse_mail_campaigns_sent_at
  ON public.crm_inhouse_mail_campaigns (sent_at DESC);

DROP TRIGGER IF EXISTS trg_crm_inhouse_mail_campaigns_updated_at ON public.crm_inhouse_mail_campaigns;
CREATE TRIGGER trg_crm_inhouse_mail_campaigns_updated_at
  BEFORE UPDATE ON public.crm_inhouse_mail_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.crm_inhouse_mail_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_inhouse_mail_campaigns_crm_read ON public.crm_inhouse_mail_campaigns;
CREATE POLICY crm_inhouse_mail_campaigns_crm_read ON public.crm_inhouse_mail_campaigns
  FOR SELECT TO authenticated
  USING (public.current_user_has_crm_outreach_access());

GRANT SELECT ON public.crm_inhouse_mail_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_inhouse_mail_campaigns TO service_role;

-- ---------------------------------------------------------------------------
-- crm_inhouse_mail_campaign_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_inhouse_mail_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.crm_inhouse_mail_campaigns(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_email text NOT NULL DEFAULT '',
  recipient_name text,
  rendered_subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Queued'
    CHECK (status IN ('Queued', 'Sending', 'Delivered', 'Failed', 'Skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_inhouse_mail_recipients_campaign_status
  ON public.crm_inhouse_mail_campaign_recipients (campaign_id, status);

ALTER TABLE public.crm_inhouse_mail_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_inhouse_mail_recipients_crm_read ON public.crm_inhouse_mail_campaign_recipients;
CREATE POLICY crm_inhouse_mail_recipients_crm_read ON public.crm_inhouse_mail_campaign_recipients
  FOR SELECT TO authenticated
  USING (public.current_user_has_crm_outreach_access());

GRANT SELECT ON public.crm_inhouse_mail_campaign_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_inhouse_mail_campaign_recipients TO service_role;

NOTIFY pgrst, 'reload schema';

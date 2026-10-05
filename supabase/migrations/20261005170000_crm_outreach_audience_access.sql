-- Client / In-House Mail Outreach access split.
--
-- User Management can now grant the sub-modules:
--   crmOutreach.client   → Client mail outreach (clients, templates, campaigns, senders)
--   crmOutreach.inhouse  → In-House mail to employees
-- Full crmOutreach / marketing module, marketing team and Admin roles keep both.
-- The older single grant crmOutreach.home is converted to both keys.
-- Run after 20261005120000_crm_inhouse_mail.sql.

-- ---------------------------------------------------------------------------
-- Client audience (existing function — adds crmOutreach.client / .home)
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
          OR COALESCE(p.allowed_sub_modules, '[]'::jsonb) ? 'crmOutreach.client'
          OR COALESCE(p.allowed_sub_modules, '[]'::jsonb) ? 'crmOutreach.home'
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- In-House audience
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_has_crm_inhouse_mail_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'super_admin_pro', 'admin')
        OR lower(trim(coalesce(p.team, ''))) IN ('marketing')
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'marketing'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'crmOutreach'
        OR COALESCE(p.allowed_sub_modules, '[]'::jsonb) ? 'crmOutreach.inhouse'
        OR COALESCE(p.allowed_sub_modules, '[]'::jsonb) ? 'crmOutreach.home'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_has_crm_inhouse_mail_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_crm_inhouse_mail_access() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- In-House tables → In-House access check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('crm_inhouse_mail_templates',            'crm_inhouse_mail_templates_crm_access',     'ALL'),
      ('crm_inhouse_mail_groups',               'crm_inhouse_mail_groups_crm_access',        'ALL'),
      ('crm_inhouse_mail_group_members',        'crm_inhouse_mail_group_members_crm_access', 'ALL'),
      ('crm_inhouse_mail_campaigns',            'crm_inhouse_mail_campaigns_crm_read',       'SELECT'),
      ('crm_inhouse_mail_campaign_recipients',  'crm_inhouse_mail_recipients_crm_read',      'SELECT')
    ) AS v(table_name, policy_name, cmd)
  LOOP
    IF to_regclass(format('public.%I', t.table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.policy_name, t.table_name);
    IF t.cmd = 'ALL' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
           USING (public.current_user_has_crm_inhouse_mail_access())
           WITH CHECK (public.current_user_has_crm_inhouse_mail_access())',
        t.policy_name, t.table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
           USING (public.current_user_has_crm_inhouse_mail_access())',
        t.policy_name, t.table_name
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Legacy grant crmOutreach.home → crmOutreach.client + crmOutreach.inhouse
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET allowed_sub_modules = (
  SELECT coalesce(jsonb_agg(DISTINCT v ORDER BY v), '[]'::jsonb)
  FROM (
    SELECT value AS v
    FROM jsonb_array_elements_text(p.allowed_sub_modules)
    WHERE value <> 'crmOutreach.home'
    UNION
    SELECT 'crmOutreach.client'
    UNION
    SELECT 'crmOutreach.inhouse'
  ) s
)
WHERE jsonb_typeof(p.allowed_sub_modules) = 'array'
  AND p.allowed_sub_modules ? 'crmOutreach.home';

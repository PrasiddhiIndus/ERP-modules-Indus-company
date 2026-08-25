-- Lead Master (marketing): project leads from the CMIE-style sheet.
-- Authenticated users with marketing access (same helper as other marketing / outreach tables).

CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  project text,
  project_type text,
  ownership text,
  industry text,
  project_cost numeric,
  project_stage text,
  location text,
  district text,
  project_state text,
  address_state text,
  telephone text,
  email text,
  contact_person text,
  contact_person_2 text,
  sheet_updated_on date,
  remarks text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_company
  ON public.marketing_leads (company);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_project_stage
  ON public.marketing_leads (project_stage);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_project_state
  ON public.marketing_leads (project_state);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_sheet_updated_on
  ON public.marketing_leads (sheet_updated_on DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at
  ON public.marketing_leads (created_at DESC);

DROP TRIGGER IF EXISTS trg_marketing_leads_updated_at ON public.marketing_leads;
CREATE TRIGGER trg_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_leads_access ON public.marketing_leads;
CREATE POLICY marketing_leads_access ON public.marketing_leads
  FOR ALL TO authenticated
  USING (public.current_user_has_crm_outreach_access())
  WITH CHECK (public.current_user_has_crm_outreach_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_leads TO authenticated, service_role;

COMMENT ON TABLE public.marketing_leads IS
  'Marketing Lead Master — project leads (company, project, stage, location, contact).';

-- AMC Management Module: operational tables, indexes, triggers, dashboard views, RLS-ready

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.amc_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Settings / masters (contract types, categories, SLA rules, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_settings_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_type text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  sort_order integer DEFAULT 0,
  config_json jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (master_type, code)
);

CREATE INDEX IF NOT EXISTS idx_amc_settings_masters_type ON public.amc_settings_masters(master_type);

-- ---------------------------------------------------------------------------
-- TABLE 1: amc_customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text UNIQUE NOT NULL,
  customer_name text NOT NULL,
  customer_category text,
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_email text,
  service_contact_name text,
  service_contact_phone text,
  service_contact_email text,
  billing_contact_name text,
  billing_contact_phone text,
  billing_contact_email text,
  escalation_contact_name text,
  escalation_contact_phone text,
  escalation_contact_email text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  pincode text,
  gstin text,
  status text DEFAULT 'active',
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_amc_customers_code ON public.amc_customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_amc_customers_status ON public.amc_customers(status);
CREATE INDEX IF NOT EXISTS idx_amc_customers_name ON public.amc_customers(customer_name);

-- ---------------------------------------------------------------------------
-- TABLE 2: amc_contracts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_no text UNIQUE NOT NULL,
  customer_id uuid REFERENCES public.amc_customers(id),
  contract_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  renewal_due_date date,
  scope_summary text,
  visit_frequency text,
  visits_committed integer,
  sla_response_hours integer,
  sla_closure_hours integer,
  branch_id uuid,
  coordinator_employee_id uuid,
  status text DEFAULT 'draft',
  excluded_items text,
  remarks text,
  attachment_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_amc_contracts_no ON public.amc_contracts(contract_no);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_customer ON public.amc_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_status ON public.amc_contracts(status);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_end_date ON public.amc_contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_renewal_due ON public.amc_contracts(renewal_due_date);

-- ---------------------------------------------------------------------------
-- TABLE 3: amc_contract_sites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_contract_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.amc_customers(id),
  site_code text,
  site_name text NOT NULL,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  pincode text,
  site_contact_name text,
  site_contact_phone text,
  site_contact_email text,
  assigned_engineer_id uuid,
  assigned_team_name text,
  service_window text,
  criticality text,
  status text DEFAULT 'active',
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_contract_sites_contract ON public.amc_contract_sites(contract_id);
CREATE INDEX IF NOT EXISTS idx_amc_contract_sites_customer ON public.amc_contract_sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_contract_sites_status ON public.amc_contract_sites(status);

-- ---------------------------------------------------------------------------
-- TABLE 4: amc_assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.amc_customers(id),
  site_id uuid REFERENCES public.amc_contract_sites(id) ON DELETE CASCADE,
  asset_code text UNIQUE,
  equipment_category text,
  equipment_name text NOT NULL,
  make text,
  model text,
  serial_number text,
  installation_date date,
  warranty_status text,
  amc_status text,
  service_frequency text,
  last_service_date date,
  next_due_date date,
  criticality text,
  condition_notes text,
  status text DEFAULT 'active',
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_assets_code ON public.amc_assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_amc_assets_contract ON public.amc_assets(contract_id);
CREATE INDEX IF NOT EXISTS idx_amc_assets_site ON public.amc_assets(site_id);
CREATE INDEX IF NOT EXISTS idx_amc_assets_status ON public.amc_assets(status);
CREATE INDEX IF NOT EXISTS idx_amc_assets_next_due ON public.amc_assets(next_due_date);

-- ---------------------------------------------------------------------------
-- TABLE 5: amc_pm_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_pm_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_no text UNIQUE,
  contract_id uuid REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.amc_customers(id),
  site_id uuid REFERENCES public.amc_contract_sites(id),
  asset_id uuid REFERENCES public.amc_assets(id),
  planned_date date,
  due_date date NOT NULL,
  assigned_engineer_id uuid,
  assigned_team_name text,
  schedule_source text,
  status text DEFAULT 'generated',
  sla_status text DEFAULT 'within_sla',
  completion_date date,
  rescheduled_from uuid REFERENCES public.amc_pm_schedules(id),
  rescheduled_reason text,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_pm_no ON public.amc_pm_schedules(pm_no);
CREATE INDEX IF NOT EXISTS idx_amc_pm_contract ON public.amc_pm_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_amc_pm_site ON public.amc_pm_schedules(site_id);
CREATE INDEX IF NOT EXISTS idx_amc_pm_asset ON public.amc_pm_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_amc_pm_status ON public.amc_pm_schedules(status);
CREATE INDEX IF NOT EXISTS idx_amc_pm_due_date ON public.amc_pm_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_amc_pm_sla_status ON public.amc_pm_schedules(sla_status);

-- ---------------------------------------------------------------------------
-- TABLE 6: amc_complaints
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_no text UNIQUE NOT NULL,
  contract_id uuid REFERENCES public.amc_contracts(id),
  customer_id uuid REFERENCES public.amc_customers(id),
  site_id uuid REFERENCES public.amc_contract_sites(id),
  asset_id uuid REFERENCES public.amc_assets(id),
  complaint_category text,
  priority text DEFAULT 'medium',
  complaint_description text NOT NULL,
  complaint_logged_at timestamptz DEFAULT now(),
  reported_by_name text,
  reported_by_phone text,
  assigned_engineer_id uuid,
  assigned_team_name text,
  response_due_at timestamptz,
  closure_due_at timestamptz,
  actual_response_at timestamptz,
  actual_closed_at timestamptz,
  resolution_summary text,
  status text DEFAULT 'logged',
  sla_status text DEFAULT 'within_sla',
  escalation_level integer DEFAULT 0,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_complaints_no ON public.amc_complaints(complaint_no);
CREATE INDEX IF NOT EXISTS idx_amc_complaints_customer ON public.amc_complaints(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_complaints_contract ON public.amc_complaints(contract_id);
CREATE INDEX IF NOT EXISTS idx_amc_complaints_status ON public.amc_complaints(status);
CREATE INDEX IF NOT EXISTS idx_amc_complaints_sla ON public.amc_complaints(sla_status);
CREATE INDEX IF NOT EXISTS idx_amc_complaints_closure_due ON public.amc_complaints(closure_due_at);

-- ---------------------------------------------------------------------------
-- TABLE 7: amc_service_visits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_service_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_no text UNIQUE NOT NULL,
  visit_type text NOT NULL,
  contract_id uuid REFERENCES public.amc_contracts(id),
  customer_id uuid REFERENCES public.amc_customers(id),
  site_id uuid REFERENCES public.amc_contract_sites(id),
  asset_id uuid REFERENCES public.amc_assets(id),
  pm_schedule_id uuid REFERENCES public.amc_pm_schedules(id),
  complaint_id uuid REFERENCES public.amc_complaints(id),
  engineer_id uuid,
  visit_started_at timestamptz,
  visit_completed_at timestamptz,
  work_done_summary text,
  observations text,
  recommendations text,
  followup_required boolean DEFAULT false,
  report_status text DEFAULT 'pending',
  signoff_status text DEFAULT 'pending',
  status text DEFAULT 'created',
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_visits_no ON public.amc_service_visits(visit_no);
CREATE INDEX IF NOT EXISTS idx_amc_visits_customer ON public.amc_service_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_visits_status ON public.amc_service_visits(status);
CREATE INDEX IF NOT EXISTS idx_amc_visits_report_status ON public.amc_service_visits(report_status);

-- ---------------------------------------------------------------------------
-- TABLE 8: amc_service_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_service_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid REFERENCES public.amc_service_visits(id) ON DELETE CASCADE,
  report_no text UNIQUE,
  report_summary text,
  report_file_url text,
  findings text,
  actions_taken text,
  recommendations text,
  customer_signoff_name text,
  customer_signoff_at timestamptz,
  signoff_attachment_url text,
  report_status text DEFAULT 'uploaded',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_reports_no ON public.amc_service_reports(report_no);
CREATE INDEX IF NOT EXISTS idx_amc_reports_visit ON public.amc_service_reports(visit_id);
CREATE INDEX IF NOT EXISTS idx_amc_reports_status ON public.amc_service_reports(report_status);

-- ---------------------------------------------------------------------------
-- TABLE 9: amc_technician_allocations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_technician_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL,
  allocation_date date NOT NULL,
  linked_type text NOT NULL,
  linked_id uuid NOT NULL,
  allocation_status text DEFAULT 'assigned',
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_alloc_technician ON public.amc_technician_allocations(technician_id);
CREATE INDEX IF NOT EXISTS idx_amc_alloc_date ON public.amc_technician_allocations(allocation_date);
CREATE INDEX IF NOT EXISTS idx_amc_alloc_status ON public.amc_technician_allocations(allocation_status);

-- ---------------------------------------------------------------------------
-- TABLE 10: amc_alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL,
  contract_id uuid REFERENCES public.amc_contracts(id),
  customer_id uuid REFERENCES public.amc_customers(id),
  site_id uuid REFERENCES public.amc_contract_sites(id),
  asset_id uuid REFERENCES public.amc_assets(id),
  complaint_id uuid REFERENCES public.amc_complaints(id),
  pm_schedule_id uuid REFERENCES public.amc_pm_schedules(id),
  visit_id uuid REFERENCES public.amc_service_visits(id),
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status text DEFAULT 'open',
  action_required boolean DEFAULT true,
  assigned_to uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_alerts_type ON public.amc_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_amc_alerts_severity ON public.amc_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_amc_alerts_status ON public.amc_alerts(status);
CREATE INDEX IF NOT EXISTS idx_amc_alerts_due ON public.amc_alerts(due_at);

-- ---------------------------------------------------------------------------
-- TABLE 11: amc_contract_renewals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_contract_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.amc_contracts(id),
  previous_end_date date,
  renewal_status text,
  renewal_discussion_started_at timestamptz,
  renewed_contract_id uuid REFERENCES public.amc_contracts(id),
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amc_renewals_contract ON public.amc_contract_renewals(contract_id);

-- ---------------------------------------------------------------------------
-- TABLE 12: amc_activity_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amc_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name text NOT NULL,
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  action_type text NOT NULL,
  action_summary text,
  actor_id uuid,
  actor_name text,
  action_at timestamptz DEFAULT now(),
  metadata_json jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_amc_activity_record ON public.amc_activity_logs(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_amc_activity_at ON public.amc_activity_logs(action_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'amc_settings_masters', 'amc_customers', 'amc_contracts', 'amc_contract_sites',
    'amc_assets', 'amc_pm_schedules', 'amc_complaints', 'amc_service_visits',
    'amc_service_reports', 'amc_technician_allocations', 'amc_alerts',
    'amc_contract_renewals'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.amc_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Dashboard views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_amc_dashboard_summary
WITH (security_invoker = on) AS
SELECT
  (SELECT count(*) FROM public.amc_contracts WHERE status IN ('active', 'running')) AS active_contracts,
  (SELECT count(*) FROM public.amc_contracts
   WHERE status IN ('active', 'running', 'expiring_soon')
     AND end_date <= (CURRENT_DATE + interval '30 days')) AS contracts_expiring_30d,
  (SELECT count(*) FROM public.amc_pm_schedules
   WHERE due_date = CURRENT_DATE AND status NOT IN ('completed', 'closed', 'cancelled')) AS pm_due_today,
  (SELECT count(*) FROM public.amc_pm_schedules
   WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'closed', 'cancelled')) AS pm_overdue,
  (SELECT count(*) FROM public.amc_complaints
   WHERE status NOT IN ('closed', 'resolved')) AS open_complaints,
  (SELECT count(*) FROM public.amc_complaints WHERE sla_status = 'breached') AS sla_breaches,
  (SELECT count(*) FROM public.amc_service_visits WHERE report_status = 'pending') AS pending_service_reports,
  (SELECT count(*) FROM public.amc_contracts WHERE status = 'at_risk') AS contracts_at_risk;

CREATE OR REPLACE VIEW public.vw_amc_contract_expiry
WITH (security_invoker = on) AS
SELECT
  c.id,
  c.contract_no,
  c.customer_id,
  cust.customer_name,
  c.contract_type,
  c.start_date,
  c.end_date,
  c.renewal_due_date,
  c.status,
  (c.end_date - CURRENT_DATE) AS days_to_expiry
FROM public.amc_contracts c
LEFT JOIN public.amc_customers cust ON cust.id = c.customer_id
WHERE c.end_date >= CURRENT_DATE - interval '90 days'
ORDER BY c.end_date ASC;

CREATE OR REPLACE VIEW public.vw_amc_pm_due_overdue
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.pm_no,
  p.contract_id,
  p.customer_id,
  p.site_id,
  p.asset_id,
  p.planned_date,
  p.due_date,
  p.status,
  p.sla_status,
  p.assigned_engineer_id,
  CASE
    WHEN p.due_date < CURRENT_DATE AND p.status NOT IN ('completed', 'closed', 'cancelled') THEN 'overdue'
    WHEN p.due_date = CURRENT_DATE THEN 'due_today'
    ELSE 'upcoming'
  END AS due_bucket
FROM public.amc_pm_schedules p;

CREATE OR REPLACE VIEW public.vw_amc_complaint_sla
WITH (security_invoker = on) AS
SELECT
  c.id,
  c.complaint_no,
  c.customer_id,
  c.site_id,
  c.priority,
  c.status,
  c.sla_status,
  c.complaint_logged_at,
  c.response_due_at,
  c.closure_due_at,
  c.assigned_engineer_id,
  EXTRACT(EPOCH FROM (c.closure_due_at - now())) / 3600 AS hours_to_closure_due
FROM public.amc_complaints c
WHERE c.status NOT IN ('closed');

CREATE OR REPLACE VIEW public.vw_amc_engineer_workload
WITH (security_invoker = on) AS
SELECT
  t.technician_id,
  t.allocation_date,
  count(*) FILTER (WHERE t.linked_type = 'complaint') AS open_calls,
  count(*) FILTER (WHERE t.linked_type = 'pm') AS pending_pm,
  count(*) AS assigned_jobs_today
FROM public.amc_technician_allocations t
WHERE t.allocation_date = CURRENT_DATE
  AND t.allocation_status = 'assigned'
GROUP BY t.technician_id, t.allocation_date;

-- ---------------------------------------------------------------------------
-- RLS (authenticated users — refine per role later)
-- ---------------------------------------------------------------------------
ALTER TABLE public.amc_settings_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_contract_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_pm_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_service_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_service_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_technician_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_contract_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amc_activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'amc_settings_masters', 'amc_customers', 'amc_contracts', 'amc_contract_sites',
    'amc_assets', 'amc_pm_schedules', 'amc_complaints', 'amc_service_visits',
    'amc_service_reports', 'amc_technician_allocations', 'amc_alerts',
    'amc_contract_renewals', 'amc_activity_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS amc_%s_auth_all ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY amc_%s_auth_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.amc_customers IS 'AMC customer master for service operations';
COMMENT ON TABLE public.amc_contracts IS 'Annual maintenance contracts lifecycle';

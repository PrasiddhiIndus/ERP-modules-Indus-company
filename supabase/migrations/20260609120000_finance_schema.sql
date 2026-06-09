-- Finance / P&L module — isolated under `finance` schema
-- Expose `finance` in Supabase Dashboard → Settings → API → Exposed schemas

CREATE SCHEMA IF NOT EXISTS finance;

GRANT USAGE ON SCHEMA finance TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance
  GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION finance.current_user_has_finance_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR p.team = 'finance'
        OR (p.allowed_modules IS NOT NULL AND p.allowed_modules @> '"finance"'::jsonb)
      )
  ) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IS NULL
      AND p.team IS NULL
      AND (p.allowed_modules IS NULL OR p.allowed_modules = '[]'::jsonb)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION finance.current_user_can_access_site(p_site_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = finance, public
AS $$
BEGIN
  IF finance.current_user_has_finance_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM finance.user_site_access usa
    WHERE usa.user_id = auth.uid()
      AND usa.site_id = p_site_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

INSERT INTO finance.settings (setting_key, setting_value, description)
VALUES
  ('margin_targets', '{"target_margin": 12, "warn_margin": 8}'::jsonb, 'P&L margin alert thresholds'),
  ('default_period_range', '{"months_back": 24}'::jsonb, 'Default period picker range')
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Master: Sites / Projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  service_type text,
  work_order_no text,
  contract_start date,
  contract_end date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  manager_user_id uuid,
  sort_order integer DEFAULT 0,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_finance_sites_status ON finance.sites(status);
CREATE INDEX IF NOT EXISTS idx_finance_sites_name ON finance.sites(name);

-- ---------------------------------------------------------------------------
-- Master: Revenue heads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.revenue_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  sign smallint NOT NULL DEFAULT 1 CHECK (sign IN (1, -1)),
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Master: Expense hierarchy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.expense_parent_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  color text DEFAULT '#1F6F4E',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance.expense_child_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  parent_head_id uuid NOT NULL REFERENCES finance.expense_parent_heads(id),
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_expense_child_parent ON finance.expense_child_heads(parent_head_id);

-- Site-specific ordered expense structure
CREATE TABLE IF NOT EXISTS finance.site_expense_structure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES finance.sites(id) ON DELETE CASCADE,
  parent_head_id uuid NOT NULL REFERENCES finance.expense_parent_heads(id),
  child_head_id uuid NOT NULL REFERENCES finance.expense_child_heads(id),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (site_id, child_head_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_site_structure_site ON finance.site_expense_structure(site_id);

-- ---------------------------------------------------------------------------
-- Budget / estimate versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.budget_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES finance.sites(id) ON DELETE CASCADE,
  effective_from text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (site_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_finance_budget_versions_site ON finance.budget_versions(site_id, effective_from);

CREATE TABLE IF NOT EXISTS finance.budget_revenue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_version_id uuid NOT NULL REFERENCES finance.budget_versions(id) ON DELETE CASCADE,
  revenue_head_id uuid NOT NULL REFERENCES finance.revenue_heads(id),
  amount numeric(18, 2) NOT NULL DEFAULT 0,
  UNIQUE (budget_version_id, revenue_head_id)
);

CREATE TABLE IF NOT EXISTS finance.budget_expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_version_id uuid NOT NULL REFERENCES finance.budget_versions(id) ON DELETE CASCADE,
  child_head_id uuid NOT NULL REFERENCES finance.expense_child_heads(id),
  amount numeric(18, 2) NOT NULL DEFAULT 0,
  UNIQUE (budget_version_id, child_head_id)
);

-- ---------------------------------------------------------------------------
-- Period entries (monthly actuals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.period_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES finance.sites(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (site_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_finance_period_entries_period ON finance.period_entries(period_key);

CREATE TABLE IF NOT EXISTS finance.revenue_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_entry_id uuid NOT NULL REFERENCES finance.period_entries(id) ON DELETE CASCADE,
  revenue_head_id uuid NOT NULL REFERENCES finance.revenue_heads(id),
  amount numeric(18, 2) NOT NULL DEFAULT 0,
  UNIQUE (period_entry_id, revenue_head_id)
);

CREATE TABLE IF NOT EXISTS finance.expense_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_entry_id uuid NOT NULL REFERENCES finance.period_entries(id) ON DELETE CASCADE,
  child_head_id uuid NOT NULL REFERENCES finance.expense_child_heads(id),
  amount numeric(18, 2) NOT NULL DEFAULT 0,
  UNIQUE (period_entry_id, child_head_id)
);

-- ---------------------------------------------------------------------------
-- Cost allocation / amortization spreads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES finance.sites(id) ON DELETE CASCADE,
  child_head_id uuid NOT NULL REFERENCES finance.expense_child_heads(id),
  total_amount numeric(18, 2) NOT NULL CHECK (total_amount >= 0),
  start_period text NOT NULL,
  months integer NOT NULL CHECK (months > 0),
  spread_mode text NOT NULL DEFAULT 'fixed' CHECK (spread_mode IN ('fixed', 'remaining')),
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_finance_cost_alloc_site ON finance.cost_allocations(site_id);

-- ---------------------------------------------------------------------------
-- Site manager access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.user_site_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid NOT NULL REFERENCES finance.sites(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'edit' CHECK (access_level IN ('view', 'edit')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_user_site_access_user ON finance.user_site_access(user_id);

-- ---------------------------------------------------------------------------
-- Import / export audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.import_export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL CHECK (operation IN ('import', 'export', 'backup', 'restore')),
  file_name text,
  record_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'partial')),
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sites', 'revenue_heads', 'expense_parent_heads', 'expense_child_heads',
    'budget_versions', 'period_entries', 'cost_allocations', 'settings'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_finance_%s_updated ON finance.%s;
      CREATE TRIGGER trg_finance_%s_updated
        BEFORE UPDATE ON finance.%s
        FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard views (security invoker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW finance.vw_site_period_summary
WITH (security_invoker = on) AS
SELECT
  pe.site_id,
  pe.period_key,
  pe.status AS entry_status,
  COALESCE(rev.total_revenue, 0) AS total_revenue,
  COALESCE(exp.total_expense, 0) AS total_expense,
  COALESCE(rev.total_revenue, 0) - COALESCE(exp.total_expense, 0) AS profit,
  CASE
    WHEN COALESCE(rev.total_revenue, 0) > 0
    THEN ((COALESCE(rev.total_revenue, 0) - COALESCE(exp.total_expense, 0)) / rev.total_revenue) * 100
    ELSE 0
  END AS margin_pct
FROM finance.period_entries pe
LEFT JOIN LATERAL (
  SELECT SUM(rel.amount * rh.sign) AS total_revenue
  FROM finance.revenue_entry_lines rel
  JOIN finance.revenue_heads rh ON rh.id = rel.revenue_head_id
  WHERE rel.period_entry_id = pe.id
) rev ON true
LEFT JOIN LATERAL (
  SELECT SUM(eel.amount) AS total_expense
  FROM finance.expense_entry_lines eel
  WHERE eel.period_entry_id = pe.id
) exp ON true;

CREATE OR REPLACE VIEW finance.vw_portfolio_summary
WITH (security_invoker = on) AS
SELECT
  period_key,
  COUNT(DISTINCT site_id) AS sites_reporting,
  SUM(total_revenue) AS total_revenue,
  SUM(total_expense) AS total_expense,
  SUM(profit) AS total_profit,
  CASE
    WHEN SUM(total_revenue) > 0 THEN (SUM(profit) / SUM(total_revenue)) * 100
    ELSE 0
  END AS portfolio_margin_pct
FROM finance.vw_site_period_summary
GROUP BY period_key;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE finance.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.revenue_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.expense_parent_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.expense_child_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.site_expense_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.budget_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.budget_revenue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.budget_expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.period_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.revenue_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.expense_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.user_site_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.import_export_logs ENABLE ROW LEVEL SECURITY;

-- Masters: finance admin full access; site managers read
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settings', 'revenue_heads', 'expense_parent_heads', 'expense_child_heads',
    'user_site_access', 'import_export_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS finance_%s_admin ON finance.%s', tbl, tbl);
    EXECUTE format('
      CREATE POLICY finance_%s_admin ON finance.%s
        FOR ALL TO authenticated
        USING (finance.current_user_has_finance_admin())
        WITH CHECK (finance.current_user_has_finance_admin());
    ', tbl, tbl);
  END LOOP;
END;
$$;

-- Sites: admin all; site managers scoped
DROP POLICY IF EXISTS finance_sites_admin ON finance.sites;
CREATE POLICY finance_sites_admin ON finance.sites
  FOR ALL TO authenticated
  USING (finance.current_user_has_finance_admin())
  WITH CHECK (finance.current_user_has_finance_admin());

DROP POLICY IF EXISTS finance_sites_manager ON finance.sites;
CREATE POLICY finance_sites_manager ON finance.sites
  FOR SELECT TO authenticated
  USING (finance.current_user_can_access_site(id));

-- Site-scoped tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'site_expense_structure', 'budget_versions', 'budget_revenue_lines',
    'budget_expense_lines', 'period_entries', 'revenue_entry_lines',
    'expense_entry_lines', 'cost_allocations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS finance_%s_admin ON finance.%s', tbl, tbl);
    EXECUTE format('
      CREATE POLICY finance_%s_admin ON finance.%s
        FOR ALL TO authenticated
        USING (finance.current_user_has_finance_admin())
        WITH CHECK (finance.current_user_has_finance_admin());
    ', tbl, tbl);
  END LOOP;
END;
$$;

-- Site managers: read/write their sites on operational tables
DROP POLICY IF EXISTS finance_site_expense_structure_manager ON finance.site_expense_structure;
CREATE POLICY finance_site_expense_structure_manager ON finance.site_expense_structure
  FOR ALL TO authenticated
  USING (finance.current_user_can_access_site(site_id))
  WITH CHECK (finance.current_user_can_access_site(site_id));

DROP POLICY IF EXISTS finance_budget_versions_manager ON finance.budget_versions;
CREATE POLICY finance_budget_versions_manager ON finance.budget_versions
  FOR ALL TO authenticated
  USING (finance.current_user_can_access_site(site_id))
  WITH CHECK (finance.current_user_can_access_site(site_id));

DROP POLICY IF EXISTS finance_period_entries_manager ON finance.period_entries;
CREATE POLICY finance_period_entries_manager ON finance.period_entries
  FOR ALL TO authenticated
  USING (finance.current_user_can_access_site(site_id))
  WITH CHECK (finance.current_user_can_access_site(site_id));

DROP POLICY IF EXISTS finance_cost_allocations_manager ON finance.cost_allocations;
CREATE POLICY finance_cost_allocations_manager ON finance.cost_allocations
  FOR ALL TO authenticated
  USING (finance.current_user_can_access_site(site_id))
  WITH CHECK (finance.current_user_can_access_site(site_id));

-- Budget/entry lines via parent site
DROP POLICY IF EXISTS finance_budget_revenue_lines_manager ON finance.budget_revenue_lines;
CREATE POLICY finance_budget_revenue_lines_manager ON finance.budget_revenue_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM finance.budget_versions bv
      WHERE bv.id = budget_version_id
        AND finance.current_user_can_access_site(bv.site_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finance.budget_versions bv
      WHERE bv.id = budget_version_id
        AND finance.current_user_can_access_site(bv.site_id)
    )
  );

DROP POLICY IF EXISTS finance_budget_expense_lines_manager ON finance.budget_expense_lines;
CREATE POLICY finance_budget_expense_lines_manager ON finance.budget_expense_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM finance.budget_versions bv
      WHERE bv.id = budget_version_id
        AND finance.current_user_can_access_site(bv.site_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finance.budget_versions bv
      WHERE bv.id = budget_version_id
        AND finance.current_user_can_access_site(bv.site_id)
    )
  );

DROP POLICY IF EXISTS finance_revenue_entry_lines_manager ON finance.revenue_entry_lines;
CREATE POLICY finance_revenue_entry_lines_manager ON finance.revenue_entry_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM finance.period_entries pe
      WHERE pe.id = period_entry_id
        AND finance.current_user_can_access_site(pe.site_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finance.period_entries pe
      WHERE pe.id = period_entry_id
        AND finance.current_user_can_access_site(pe.site_id)
    )
  );

DROP POLICY IF EXISTS finance_expense_entry_lines_manager ON finance.expense_entry_lines;
CREATE POLICY finance_expense_entry_lines_manager ON finance.expense_entry_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM finance.period_entries pe
      WHERE pe.id = period_entry_id
        AND finance.current_user_can_access_site(pe.site_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finance.period_entries pe
      WHERE pe.id = period_entry_id
        AND finance.current_user_can_access_site(pe.site_id)
    )
  );

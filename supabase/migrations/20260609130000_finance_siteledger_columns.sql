-- SiteLedger UI alignment: period keys, external ids, custom flags

ALTER TABLE finance.sites
  ADD COLUMN IF NOT EXISTS contract_start_period text,
  ADD COLUMN IF NOT EXISTS contract_end_period text;

ALTER TABLE finance.expense_parent_heads
  ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false;

ALTER TABLE finance.expense_child_heads
  ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false;

ALTER TABLE finance.budget_versions
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_budget_versions_external_id
  ON finance.budget_versions (external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE finance.cost_allocations
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_cost_allocations_external_id
  ON finance.cost_allocations (external_id)
  WHERE external_id IS NOT NULL;

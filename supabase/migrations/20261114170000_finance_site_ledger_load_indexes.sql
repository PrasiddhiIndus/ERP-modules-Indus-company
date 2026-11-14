-- =============================================================================
-- Finance Site Ledger: faster full-ledger load (Reports, Income–Expenditure,
-- Budget vs Actual).
--
-- 1) Composite indexes that match the loader's paged ORDER BY (<col>, id), so
--    each page is an index range scan instead of a sort over the whole table.
-- 2) Foreign-key indexes on head columns for the line tables (joins / head
--    deletes no longer seq-scan the large entry-line tables).
-- 3) Admin RLS policies call the access helper as `(SELECT …)` so Postgres
--    evaluates it ONCE per query (InitPlan) instead of once per row. Access
--    rules are unchanged — same helper, same USING / WITH CHECK.
--
-- No table structures, data or financial logic are changed.
-- =============================================================================

-- 1) Paging order indexes ------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_finance_sites_sort_id
  ON finance.sites (sort_order, id);
CREATE INDEX IF NOT EXISTS idx_finance_site_structure_sort_id
  ON finance.site_expense_structure (sort_order, id);
CREATE INDEX IF NOT EXISTS idx_finance_budget_versions_eff_id
  ON finance.budget_versions (effective_from, id);
CREATE INDEX IF NOT EXISTS idx_finance_period_entries_period_id
  ON finance.period_entries (period_key, id);
CREATE INDEX IF NOT EXISTS idx_finance_cost_alloc_start_id
  ON finance.cost_allocations (start_period, id);

-- 2) Foreign-key / join indexes -----------------------------------------------
-- (period_entry_id / budget_version_id are already the leading column of the
--  existing UNIQUE constraints, so they are covered.)
CREATE INDEX IF NOT EXISTS idx_finance_rev_entry_lines_head
  ON finance.revenue_entry_lines (revenue_head_id);
CREATE INDEX IF NOT EXISTS idx_finance_exp_entry_lines_head
  ON finance.expense_entry_lines (child_head_id);
CREATE INDEX IF NOT EXISTS idx_finance_budget_rev_lines_head
  ON finance.budget_revenue_lines (revenue_head_id);
CREATE INDEX IF NOT EXISTS idx_finance_budget_exp_lines_head
  ON finance.budget_expense_lines (child_head_id);
CREATE INDEX IF NOT EXISTS idx_finance_cost_alloc_head
  ON finance.cost_allocations (child_head_id);
CREATE INDEX IF NOT EXISTS idx_finance_site_structure_parent
  ON finance.site_expense_structure (parent_head_id);
CREATE INDEX IF NOT EXISTS idx_finance_site_structure_child
  ON finance.site_expense_structure (child_head_id);

-- 3) Admin policies: evaluate the helper once per statement --------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settings',
    'revenue_heads',
    'expense_parent_heads',
    'expense_child_heads',
    'user_site_access',
    'import_export_logs',
    'sites',
    'site_expense_structure',
    'budget_versions',
    'budget_revenue_lines',
    'budget_expense_lines',
    'period_entries',
    'revenue_entry_lines',
    'expense_entry_lines',
    'cost_allocations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS finance_%s_admin ON finance.%s', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY finance_%s_admin ON finance.%s
         FOR ALL TO authenticated
         USING ((SELECT finance.current_user_has_finance_admin()))
         WITH CHECK ((SELECT finance.current_user_has_finance_admin()))',
      tbl, tbl
    );
  END LOOP;
END;
$$;

ANALYZE finance.sites;
ANALYZE finance.site_expense_structure;
ANALYZE finance.budget_versions;
ANALYZE finance.budget_revenue_lines;
ANALYZE finance.budget_expense_lines;
ANALYZE finance.period_entries;
ANALYZE finance.revenue_entry_lines;
ANALYZE finance.expense_entry_lines;
ANALYZE finance.cost_allocations;

NOTIFY pgrst, 'reload schema';

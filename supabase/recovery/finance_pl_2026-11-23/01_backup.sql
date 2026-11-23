-- ============================================================================
-- Finance P&L / Site Ledger — STEP 1: BACKUP (run first, before anything else)
-- ============================================================================
-- Run in the Supabase SQL editor (production). Read-only on finance data: it only
-- COPIES tables into a new schema finance_backup_20261123. Safe to re-run (IF NOT EXISTS).
--
-- Also take a platform backup: Supabase Dashboard → Database → Backups → note the latest
-- daily backup / PITR window. Figures deleted by the old code can only come from there.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS finance_backup_20261123;
REVOKE ALL ON SCHEMA finance_backup_20261123 FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON SCHEMA finance_backup_20261123 FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sites',
    'revenue_heads',
    'expense_parent_heads',
    'expense_child_heads',
    'site_expense_structure',
    'budget_versions',
    'budget_revenue_lines',
    'budget_expense_lines',
    'period_entries',
    'revenue_entry_lines',
    'expense_entry_lines',
    'cost_allocations'
  ] LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS finance_backup_20261123.%I AS TABLE finance.%I',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Finance-related activity log rows (who did what, from which page, automatic or not).
CREATE TABLE IF NOT EXISTS finance_backup_20261123.erp_activity_log_finance AS
SELECT *
FROM public.erp_activity_log
WHERE module = 'Finance / P&L'
   OR entity IN (
     'sites', 'site_expense_structure', 'expense_parent_heads', 'expense_child_heads',
     'budget_versions', 'budget_revenue_lines', 'budget_expense_lines', 'period_entries',
     'revenue_entry_lines', 'expense_entry_lines', 'cost_allocations', 'revenue_heads'
   )
   OR entity LIKE 'rpc:replace_%';

-- Helper used by the investigation / restore scripts: site meta JSON stored in sites.remarks.
CREATE OR REPLACE FUNCTION finance_backup_20261123.site_meta(p_remarks text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  i integer;
BEGIN
  IF p_remarks IS NULL THEN RETURN '{}'::jsonb; END IF;
  i := position('@@siteMeta::' IN p_remarks);
  IF i = 0 THEN RETURN '{}'::jsonb; END IF;
  RETURN substring(p_remarks FROM i + length('@@siteMeta::'))::jsonb;
EXCEPTION WHEN others THEN
  RETURN '{}'::jsonb;
END;
$$;

-- Guarantees a jsonb array (avoids 22023 "cannot extract elements from a scalar").
CREATE OR REPLACE FUNCTION finance_backup_20261123.jsonb_as_array(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p IS NOT NULL AND jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION finance_backup_20261123.jsonb_changes_array(p_details jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT finance_backup_20261123.jsonb_as_array(p_details -> 'changes');
$$;

CREATE OR REPLACE FUNCTION finance_backup_20261123.rows_text_component_count(p_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  j jsonb;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN NULL; END IF;
  IF p_text = '[empty list]' THEN RETURN 0; END IF;
  IF p_text ~ '^\[\d+ items\]' THEN
    RETURN substring(p_text FROM '^\[(\d+) items\]')::int;
  END IF;
  BEGIN
    j := p_text::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF jsonb_typeof(j) = 'array' THEN
    RETURN jsonb_array_length(j);
  END IF;
  RETURN NULL;
END;
$$;

-- Restore log (filled by 04_restore_apply.sql).
CREATE TABLE IF NOT EXISTS finance_backup_20261123.restore_log (
  id             bigserial PRIMARY KEY,
  restored_at    timestamptz NOT NULL DEFAULT now(),
  site_id        uuid NOT NULL,
  site_code      text,
  child_head_id  uuid NOT NULL,
  child_code     text,
  parent_head_id uuid NOT NULL,
  sort_order     integer NOT NULL,
  evidence       jsonb
);

-- Verify the copy: live vs backup row counts must match.
SELECT 'sites' AS tbl, (SELECT count(*) FROM finance.sites) AS live, (SELECT count(*) FROM finance_backup_20261123.sites) AS backup
UNION ALL SELECT 'expense_parent_heads', (SELECT count(*) FROM finance.expense_parent_heads), (SELECT count(*) FROM finance_backup_20261123.expense_parent_heads)
UNION ALL SELECT 'expense_child_heads', (SELECT count(*) FROM finance.expense_child_heads), (SELECT count(*) FROM finance_backup_20261123.expense_child_heads)
UNION ALL SELECT 'site_expense_structure', (SELECT count(*) FROM finance.site_expense_structure), (SELECT count(*) FROM finance_backup_20261123.site_expense_structure)
UNION ALL SELECT 'budget_versions', (SELECT count(*) FROM finance.budget_versions), (SELECT count(*) FROM finance_backup_20261123.budget_versions)
UNION ALL SELECT 'budget_expense_lines', (SELECT count(*) FROM finance.budget_expense_lines), (SELECT count(*) FROM finance_backup_20261123.budget_expense_lines)
UNION ALL SELECT 'period_entries', (SELECT count(*) FROM finance.period_entries), (SELECT count(*) FROM finance_backup_20261123.period_entries)
UNION ALL SELECT 'expense_entry_lines', (SELECT count(*) FROM finance.expense_entry_lines), (SELECT count(*) FROM finance_backup_20261123.expense_entry_lines)
UNION ALL SELECT 'revenue_entry_lines', (SELECT count(*) FROM finance.revenue_entry_lines), (SELECT count(*) FROM finance_backup_20261123.revenue_entry_lines)
UNION ALL SELECT 'cost_allocations', (SELECT count(*) FROM finance.cost_allocations), (SELECT count(*) FROM finance_backup_20261123.cost_allocations)
UNION ALL SELECT 'erp_activity_log_finance', NULL, (SELECT count(*) FROM finance_backup_20261123.erp_activity_log_finance);

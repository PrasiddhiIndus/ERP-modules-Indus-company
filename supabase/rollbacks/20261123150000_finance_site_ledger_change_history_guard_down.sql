-- Rollback for 20261123150000_finance_site_ledger_change_history_guard.sql
-- Removes the history triggers and restores the ORIGINAL destructive replace_site_structure
-- (from 20260807140000). The history table is kept (it holds the audit trail) — drop it
-- manually only if you are sure: DROP TABLE finance.ledger_change_history;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sites', 'site_expense_structure', 'expense_parent_heads',
    'expense_child_heads', 'cost_allocations', 'budget_versions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ledger_change_history ON finance.%I', tbl);
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS finance.ledger_change_history_capture();

CREATE OR REPLACE FUNCTION finance.replace_site_structure(
  p_site_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = finance
AS $$
DECLARE
  v_expected integer;
  v_actual integer;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'replace_site_structure: site_id is required';
  END IF;

  v_expected := COALESCE(jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)), 0);

  DELETE FROM finance.site_expense_structure
  WHERE site_id = p_site_id;

  IF v_expected > 0 THEN
    INSERT INTO finance.site_expense_structure (site_id, parent_head_id, child_head_id, sort_order)
    SELECT
      p_site_id,
      (elem->>'parent_head_id')::uuid,
      (elem->>'child_head_id')::uuid,
      COALESCE((elem->>'sort_order')::integer, 0)
    FROM jsonb_array_elements(p_rows) AS elem;
  END IF;

  SELECT COUNT(*)::integer INTO v_actual
  FROM finance.site_expense_structure
  WHERE site_id = p_site_id;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'replace_site_structure: expected % rows after replace, found %',
      v_expected, v_actual;
  END IF;

  RETURN v_actual;
END;
$$;

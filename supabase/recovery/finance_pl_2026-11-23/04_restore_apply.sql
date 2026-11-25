-- ============================================================================
-- Finance P&L / Site Ledger — STEP 4: RESTORE (writes) — run only after review
-- ============================================================================
-- Preconditions (the script stops itself if they are not met):
--   * 01_backup.sql has been run (finance_backup_20261123 exists with structure rows).
--   * The output of 03_restore_preview.sql has been reviewed and approved.
--
-- Effect: INSERTs missing component rows (site_expense_structure) for confidence = 'restore'
-- only. ON CONFLICT DO NOTHING: an existing component is never changed or duplicated.
-- No figures, budgets, spreads, sites or heads are modified. Every inserted row is logged in
-- finance_backup_20261123.restore_log (with its evidence) so it can be reviewed or undone:
--   DELETE FROM finance.site_expense_structure s
--   USING finance_backup_20261123.restore_log r
--   WHERE s.site_id = r.site_id AND s.child_head_id = r.child_head_id;
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('finance_backup_20261123.site_expense_structure') IS NULL
     OR to_regclass('finance_backup_20261123.restore_log') IS NULL THEN
    RAISE EXCEPTION 'Run 01_backup.sql first — no backup found in finance_backup_20261123.';
  END IF;
END $$;

WITH fig AS (
  SELECT pe.site_id, l.child_head_id, max(pe.period_key) AS last_period,
         count(DISTINCT pe.period_key) AS months_with_figures
  FROM finance.expense_entry_lines l
  JOIN finance.period_entries pe ON pe.id = l.period_entry_id
  WHERE l.amount <> 0
  GROUP BY 1, 2
), site_last AS (
  SELECT site_id, max(period_key) AS site_last_period FROM finance.period_entries GROUP BY 1
), latest_bv AS (
  SELECT DISTINCT ON (site_id) site_id, id AS budget_version_id
  FROM finance.budget_versions ORDER BY site_id, effective_from DESC NULLS LAST
), bud AS (
  SELECT bv.site_id, bl.child_head_id, bool_or(bv.id = lb.budget_version_id) AS in_latest_budget
  FROM finance.budget_expense_lines bl
  JOIN finance.budget_versions bv ON bv.id = bl.budget_version_id
  LEFT JOIN latest_bv lb ON lb.site_id = bv.site_id
  WHERE bl.amount <> 0
  GROUP BY 1, 2
), alloc AS (
  SELECT site_id, child_head_id, count(*) AS spreads FROM finance.cost_allocations GROUP BY 1, 2
), candidates AS (
  SELECT site_id, child_head_id FROM fig
  UNION SELECT site_id, child_head_id FROM bud
  UNION SELECT site_id, child_head_id FROM alloc
), classified AS (
  SELECT
    c.site_id, c.child_head_id,
    st.code AS site_code, ch.code AS child_code, ch.parent_head_id, ch.sort_order AS master_sort,
    jsonb_build_object(
      'last_period', f.last_period,
      'months_with_figures', f.months_with_figures,
      'site_last_period', sl.site_last_period,
      'in_latest_budget', coalesce(b.in_latest_budget, false),
      'spreads', coalesce(a.spreads, 0)
    ) AS evidence,
    CASE
      WHEN finance_backup_20261123.jsonb_as_array(
             finance_backup_20261123.site_meta(st.remarks) -> 'excludedHeadKeys'
           ) ? ch.code
        THEN 'skip'
      WHEN coalesce(a.spreads, 0) > 0
        OR coalesce(b.in_latest_budget, false)
        OR (f.last_period IS NOT NULL AND sl.site_last_period IS NOT NULL
            AND to_date(f.last_period || '-01', 'YYYY-MM-DD')
                >= to_date(sl.site_last_period || '-01', 'YYYY-MM-DD') - interval '1 month')
        THEN 'restore'
      ELSE 'review'
    END AS confidence
  FROM candidates c
  JOIN finance.sites st ON st.id = c.site_id
  JOIN finance.expense_child_heads ch ON ch.id = c.child_head_id
  LEFT JOIN fig f ON f.site_id = c.site_id AND f.child_head_id = c.child_head_id
  LEFT JOIN site_last sl ON sl.site_id = c.site_id
  LEFT JOIN bud b ON b.site_id = c.site_id AND b.child_head_id = c.child_head_id
  LEFT JOIN alloc a ON a.site_id = c.site_id AND a.child_head_id = c.child_head_id
  WHERE NOT EXISTS (
    SELECT 1 FROM finance.site_expense_structure s
    WHERE s.site_id = c.site_id AND s.child_head_id = c.child_head_id
  )
), to_insert AS (
  SELECT
    k.*,
    (SELECT coalesce(max(s.sort_order), -1) FROM finance.site_expense_structure s WHERE s.site_id = k.site_id)
      + row_number() OVER (PARTITION BY k.site_id ORDER BY k.master_sort, k.child_code) AS new_sort_order
  FROM classified k
  WHERE k.confidence = 'restore' AND k.parent_head_id IS NOT NULL
), inserted AS (
  INSERT INTO finance.site_expense_structure (site_id, parent_head_id, child_head_id, sort_order)
  SELECT site_id, parent_head_id, child_head_id, new_sort_order FROM to_insert
  ON CONFLICT (site_id, child_head_id) DO NOTHING
  RETURNING site_id, parent_head_id, child_head_id, sort_order
)
INSERT INTO finance_backup_20261123.restore_log
  (site_id, site_code, child_head_id, child_code, parent_head_id, sort_order, evidence)
SELECT i.site_id, ti.site_code, i.child_head_id, ti.child_code, i.parent_head_id, i.sort_order, ti.evidence
FROM inserted i
JOIN to_insert ti ON ti.site_id = i.site_id AND ti.child_head_id = i.child_head_id;

-- Review what was restored in this run, then COMMIT (or ROLLBACK to undo everything).
SELECT r.site_code, r.child_code, ph.code AS parent_code, r.sort_order, r.evidence
FROM finance_backup_20261123.restore_log r
JOIN finance.expense_parent_heads ph ON ph.id = r.parent_head_id
WHERE r.restored_at >= now() - interval '5 minutes'
ORDER BY r.site_code, r.child_code;

COMMIT;

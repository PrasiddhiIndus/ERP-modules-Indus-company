-- ============================================================================
-- Finance P&L / Site Ledger — STEP 3: RESTORE PREVIEW (read-only)
-- ============================================================================
-- Shows exactly the component rows 04_restore_apply.sql would insert. Nothing is changed.
--
-- What is restored: the MEMBERSHIP of a cost line in a site's setup (site_expense_structure),
-- only for confidence = 'restore' rows from Q1 (evidence of current use on that site).
-- What is NOT touched: any figure, budget amount, spread, site field or existing component.
-- No values are invented: parent = the cost line's own parent head in the master;
-- position = appended after the site's existing components (original order is not recorded).
-- ============================================================================

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
    st.code AS site_code, st.name AS site_name,
    ch.code AS child_code, ch.label AS child_label, ch.parent_head_id, ch.sort_order AS master_sort,
    f.last_period, f.months_with_figures, sl.site_last_period,
    coalesce(b.in_latest_budget, false) AS in_latest_budget,
    coalesce(a.spreads, 0) AS spreads,
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
)
SELECT
  k.site_code, k.site_name, k.child_code, k.child_label,
  ph.code AS parent_code,
  (SELECT coalesce(max(s.sort_order), -1) FROM finance.site_expense_structure s WHERE s.site_id = k.site_id)
    + row_number() OVER (PARTITION BY k.site_id ORDER BY k.master_sort, k.child_code) AS new_sort_order,
  k.last_period, k.months_with_figures, k.site_last_period, k.in_latest_budget, k.spreads
FROM classified k
JOIN finance.expense_parent_heads ph ON ph.id = k.parent_head_id
WHERE k.confidence = 'restore'
ORDER BY k.site_code, ph.code, k.child_code;

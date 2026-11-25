-- ============================================================================
-- Finance P&L / Site Ledger — STEP 2: INVESTIGATE (read-only, SELECT only)
-- ============================================================================
-- Run after 01_backup.sql. Each block is one result; run them one at a time in the
-- Supabase SQL editor and export the results (CSV) for the report.
-- Nothing here changes data.
--
-- Note: erp_activity_log.details->'changes' is sometimes a scalar/object, not an array.
-- Always guard jsonb_array_elements / jsonb_array_length with jsonb_typeof = 'array'.
-- ============================================================================

-- Helper functions (site_meta, jsonb_as_array, jsonb_changes_array, rows_text_component_count)
-- are created ONCE by 01_backup.sql. This file must not re-create them: CREATE OR REPLACE
-- rewrites the function's catalog row, and two runs at the same moment fail with
-- "XX000: tuple concurrently updated".

-- ── Q0. Pre-check: all four helpers exist (expect 4 rows, all true). If not, re-run 01_backup.sql.
SELECT f AS helper, to_regprocedure(f) IS NOT NULL AS present
FROM unnest(ARRAY[
  'finance_backup_20261123.site_meta(text)',
  'finance_backup_20261123.jsonb_as_array(jsonb)',
  'finance_backup_20261123.jsonb_changes_array(jsonb)',
  'finance_backup_20261123.rows_text_component_count(text)'
]) AS f;


-- ── Q1. Components missing from a site's setup, with the evidence that they belonged there ──
-- A component is "missing" when the site has figures, budget lines or cost spreads for a cost
-- line that is no longer in the site's structure.
--   confidence = restore  → used in the site's latest month (or the month before), in its
--                           latest budget version, or still has a cost spread
--   confidence = review   → only older figures/budgets (may have been removed on purpose)
--   confidence = skip     → the site meta lists it as excluded on purpose (excludedHeadKeys)
WITH fig AS (
  SELECT pe.site_id, l.child_head_id,
         count(DISTINCT pe.period_key) AS months_with_figures,
         min(pe.period_key) AS first_period,
         max(pe.period_key) AS last_period,
         sum(l.amount) AS total_amount
  FROM finance.expense_entry_lines l
  JOIN finance.period_entries pe ON pe.id = l.period_entry_id
  WHERE l.amount <> 0
  GROUP BY 1, 2
), site_last AS (
  SELECT pe.site_id, max(pe.period_key) AS site_last_period
  FROM finance.period_entries pe
  GROUP BY 1
), latest_bv AS (
  SELECT DISTINCT ON (site_id) site_id, id AS budget_version_id, effective_from
  FROM finance.budget_versions
  ORDER BY site_id, effective_from DESC NULLS LAST
), bud AS (
  SELECT bv.site_id, bl.child_head_id,
         bool_or(bv.id = lb.budget_version_id) AS in_latest_budget,
         count(*) AS budget_lines
  FROM finance.budget_expense_lines bl
  JOIN finance.budget_versions bv ON bv.id = bl.budget_version_id
  LEFT JOIN latest_bv lb ON lb.site_id = bv.site_id
  WHERE bl.amount <> 0
  GROUP BY 1, 2
), alloc AS (
  SELECT site_id, child_head_id, count(*) AS spreads
  FROM finance.cost_allocations
  GROUP BY 1, 2
), candidates AS (
  SELECT site_id, child_head_id FROM fig
  UNION SELECT site_id, child_head_id FROM bud
  UNION SELECT site_id, child_head_id FROM alloc
), missing AS (
  SELECT c.*
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1 FROM finance.site_expense_structure s
    WHERE s.site_id = c.site_id AND s.child_head_id = c.child_head_id
  )
)
SELECT
  st.code AS site_code,
  st.name AS site_name,
  st.status AS site_status,
  ch.code AS head_code,
  ch.label AS head_label,
  ch.is_active AS head_active,
  ph.code AS master_parent_code,
  f.months_with_figures,
  f.first_period,
  f.last_period,
  sl.site_last_period,
  f.total_amount,
  coalesce(b.in_latest_budget, false) AS in_latest_budget,
  coalesce(b.budget_lines, 0) AS budget_lines,
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
FROM missing m
JOIN finance.sites st ON st.id = m.site_id
JOIN finance.expense_child_heads ch ON ch.id = m.child_head_id
LEFT JOIN finance.expense_parent_heads ph ON ph.id = ch.parent_head_id
LEFT JOIN fig f ON f.site_id = m.site_id AND f.child_head_id = m.child_head_id
LEFT JOIN site_last sl ON sl.site_id = m.site_id
LEFT JOIN bud b ON b.site_id = m.site_id AND b.child_head_id = m.child_head_id
LEFT JOIN alloc a ON a.site_id = m.site_id AND a.child_head_id = m.child_head_id
ORDER BY confidence, st.code, ph.code, ch.code;


-- ── Q2. Affected sites summary (one row per site) ──
-- Sites with no components at all but with figures/budgets are the most visible symptom.
SELECT
  st.code AS site_code,
  st.name AS site_name,
  st.status,
  (SELECT count(*) FROM finance.site_expense_structure s WHERE s.site_id = st.id) AS components_now,
  (SELECT count(*) FROM finance_backup_20261123.site_expense_structure s WHERE s.site_id = st.id) AS components_in_backup,
  (SELECT count(DISTINCT l.child_head_id)
     FROM finance.expense_entry_lines l JOIN finance.period_entries pe ON pe.id = l.period_entry_id
     WHERE pe.site_id = st.id AND l.amount <> 0) AS cost_lines_with_figures,
  (SELECT count(DISTINCT l.child_head_id)
     FROM finance.expense_entry_lines l JOIN finance.period_entries pe ON pe.id = l.period_entry_id
     WHERE pe.site_id = st.id AND l.amount <> 0
       AND NOT EXISTS (SELECT 1 FROM finance.site_expense_structure s
                       WHERE s.site_id = st.id AND s.child_head_id = l.child_head_id)) AS figure_lines_not_in_setup,
  coalesce(finance_backup_20261123.site_meta(st.remarks) ->> 'structureEmpty', 'false') AS flagged_empty_on_purpose
FROM finance.sites st
ORDER BY figure_lines_not_in_setup DESC, st.code;


-- ── Q3. Structure-save timeline per site, from the activity log ──
-- Every Site Setup save logged "replaced finance site structure" with the site id and the
-- number of components sent ("[N items]"). A drop in N that the user did not intend is the
-- moment components were lost — and whose browser tab sent it, automatic or not.
WITH rpc AS (
  SELECT
    a.created_at,
    a.user_email,
    a.details ->> 'trigger' AS trigger,
    a.route,
    a.success,
    (SELECT c ->> 'new' FROM jsonb_array_elements(finance_backup_20261123.jsonb_changes_array(a.details)) c
      WHERE c ->> 'field' = 'p_site_id' LIMIT 1) AS site_uuid,
    (SELECT c ->> 'new' FROM jsonb_array_elements(finance_backup_20261123.jsonb_changes_array(a.details)) c
      WHERE c ->> 'field' = 'p_rows' LIMIT 1) AS rows_text
  FROM public.erp_activity_log a
  WHERE a.entity = 'rpc:replace_site_structure'
), parsed AS (
  SELECT
    r.*,
    finance_backup_20261123.rows_text_component_count(r.rows_text) AS components_sent
  FROM rpc r
)
SELECT
  st.code AS site_code,
  st.name AS site_name,
  p.created_at,
  p.user_email,
  p.trigger,
  p.route,
  p.success,
  p.components_sent,
  lag(p.components_sent) OVER w AS previous_components,
  p.components_sent - lag(p.components_sent) OVER w AS change
FROM parsed p
LEFT JOIN finance.sites st ON st.id::text = p.site_uuid
WINDOW w AS (PARTITION BY p.site_uuid ORDER BY p.created_at)
ORDER BY st.code, p.created_at;


-- ── Q3b. Only the drops (components removed in one save) ──
WITH rpc AS (
  SELECT a.created_at, a.user_email, a.details ->> 'trigger' AS trigger, a.success,
    (SELECT c ->> 'new' FROM jsonb_array_elements(finance_backup_20261123.jsonb_changes_array(a.details)) c
      WHERE c ->> 'field' = 'p_site_id' LIMIT 1) AS site_uuid,
    (SELECT c ->> 'new' FROM jsonb_array_elements(finance_backup_20261123.jsonb_changes_array(a.details)) c
      WHERE c ->> 'field' = 'p_rows' LIMIT 1) AS rows_text
  FROM public.erp_activity_log a
  WHERE a.entity = 'rpc:replace_site_structure' AND a.success
), parsed AS (
  SELECT r.*,
    finance_backup_20261123.rows_text_component_count(r.rows_text) AS n
  FROM rpc r
), seq AS (
  SELECT p.*, lag(p.n) OVER (PARTITION BY p.site_uuid ORDER BY p.created_at) AS prev_n
  FROM parsed p
)
SELECT st.code AS site_code, st.name AS site_name, s.created_at, s.user_email, s.trigger,
       s.prev_n AS components_before, s.n AS components_after, s.prev_n - s.n AS components_removed
FROM seq s
LEFT JOIN finance.sites st ON st.id::text = s.site_uuid
WHERE s.prev_n IS NOT NULL AND s.n < s.prev_n
ORDER BY s.created_at DESC;


-- ── Q4. Destructive deletes recorded by the activity log (old head-prune / detach code) ──
-- A DELETE on expense_entry_lines filtered by child_head_id removed FIGURES for that cost
-- line on every site; those values exist only in a platform backup (PITR / daily backup).
SELECT
  a.created_at,
  a.user_email,
  a.details ->> 'trigger' AS trigger,
  a.entity,
  a.route,
  a.success,
  a.details ->> 'rows_affected' AS rows_affected,
  a.details ->> 'path' AS request_path,
  ch.code AS head_code,
  ch.label AS head_label
FROM public.erp_activity_log a
LEFT JOIN finance.expense_child_heads ch
  ON ch.id::text = substring(a.details ->> 'path' FROM 'child_head_id=eq\.([0-9a-f-]{36})')
WHERE a.action = 'DELETE'
  AND a.entity IN ('site_expense_structure', 'expense_entry_lines', 'budget_expense_lines',
                   'cost_allocations', 'expense_child_heads', 'expense_parent_heads', 'budget_versions')
ORDER BY a.created_at DESC;


-- ── Q5. Cost lines that are inactive (soft-deleted by the old prune) but still carry figures ──
SELECT ch.code, ch.label, ch.is_active,
       count(DISTINCT pe.site_id) AS sites_with_figures,
       count(*) AS figure_lines,
       max(pe.period_key) AS last_period
FROM finance.expense_child_heads ch
JOIN finance.expense_entry_lines l ON l.child_head_id = ch.id AND l.amount <> 0
JOIN finance.period_entries pe ON pe.id = l.period_entry_id
WHERE ch.is_active = false
GROUP BY ch.code, ch.label, ch.is_active
ORDER BY last_period DESC;


-- ── Q6. Misleading activity entries: bulk head re-writes the user never made ──
-- The old code re-upserted EVERY parent/child head on many saves (even a figure save), so a
-- user appears to have "updated" dozens of cost lines within the same minute.
SELECT
  date_trunc('minute', a.created_at) AS minute,
  a.user_email,
  a.details ->> 'trigger' AS trigger,
  a.entity,
  count(*) AS rows_logged
FROM public.erp_activity_log a
WHERE a.entity IN ('expense_child_heads', 'expense_parent_heads', 'revenue_heads')
  AND a.action IN ('INSERT', 'UPDATE')
GROUP BY 1, 2, 3, 4
HAVING count(*) >= 5
ORDER BY minute DESC;


-- ── Q7. Per user: Finance writes logged as user vs automatic ──
SELECT
  a.user_email,
  count(*) FILTER (WHERE a.details ->> 'trigger' = 'user') AS logged_as_user,
  count(*) FILTER (WHERE a.details ->> 'trigger' = 'automatic') AS logged_as_automatic,
  count(*) FILTER (WHERE a.entity IN ('expense_child_heads', 'expense_parent_heads', 'revenue_heads')) AS head_rewrites,
  count(*) FILTER (WHERE a.entity = 'rpc:replace_site_structure') AS structure_replaces,
  min(a.created_at) AS first_seen,
  max(a.created_at) AS last_seen
FROM public.erp_activity_log a
WHERE a.module = 'Finance / P&L' OR a.entity LIKE 'rpc:replace_%'
GROUP BY a.user_email
ORDER BY head_rewrites DESC;

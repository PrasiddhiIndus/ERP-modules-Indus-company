-- Database performance audit for Supabase Dashboard → SQL Editor.
-- Run sections individually. Requires pg_stat_statements (enable in Dashboard → Database → Extensions).

-- =============================================================================
-- 1) Enable query stats (once per project; may require restart)
-- =============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- =============================================================================
-- 2) Top slow / frequent queries (last reset of stats)
-- =============================================================================
SELECT
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct_total,
  rows,
  left(regexp_replace(query, '\s+', ' ', 'g'), 200) AS query_sample
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND query NOT ILIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 25;

-- =============================================================================
-- 3) Tables with high sequential scan ratio (missing indexes)
-- =============================================================================
SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  idx_scan,
  n_live_tup AS est_rows,
  CASE
    WHEN seq_scan + idx_scan = 0 THEN 0
    ELSE round(100.0 * seq_scan / (seq_scan + idx_scan), 1)
  END AS seq_scan_pct
FROM pg_stat_user_tables
WHERE schemaname IN ('public', 'indus_one', 'billing', 'finance', 'projects')
  AND n_live_tup > 100
ORDER BY seq_scan DESC NULLS LAST
LIMIT 30;

-- =============================================================================
-- 4) Largest tables by disk size
-- =============================================================================
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup AS est_rows
FROM pg_stat_user_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'supabase_migrations')
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;

-- =============================================================================
-- 5) Unused indexes (candidates to drop after verifying)
-- =============================================================================
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname IN ('public', 'indus_one', 'billing', 'finance')
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

-- =============================================================================
-- 6) Index bloat check on hot attendance / leave tables
-- =============================================================================
SELECT
  c.relname AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  s.n_live_tup,
  s.n_dead_tup,
  CASE WHEN s.n_live_tup > 0
    THEN round(100.0 * s.n_dead_tup / s.n_live_tup, 1)
    ELSE 0
  END AS dead_tuple_pct,
  s.last_autovacuum,
  s.last_autoanalyze
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'erp_attendance_punches',
    'admin_attendance_register',
    'admin_ifsp_employee_master',
    'erp_activity_log'
  )
UNION ALL
SELECT
  c.relname,
  pg_size_pretty(pg_total_relation_size(c.oid)),
  s.n_live_tup,
  s.n_dead_tup,
  CASE WHEN s.n_live_tup > 0
    THEN round(100.0 * s.n_dead_tup / s.n_live_tup, 1)
    ELSE 0
  END,
  s.last_autovacuum,
  s.last_autoanalyze
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'indus_one'
  AND c.relname IN ('admin_leave_requests', 'admin_leave_attendance_marks');

-- =============================================================================
-- 7) EXPLAIN the leave overlap query (replace dates as needed)
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT employee_code, leave_type_code, from_date, to_date
FROM indus_one.admin_leave_requests
WHERE status = 'approved'
  AND from_date <= '2026-06-30'::date
  AND to_date >= '2026-06-01'::date;

-- =============================================================================
-- 8) After applying performance migrations — refresh stats
-- =============================================================================
-- ANALYZE public.admin_attendance_register;
-- ANALYZE public.erp_attendance_punches;
-- ANALYZE indus_one.admin_leave_requests;
-- VACUUM (ANALYZE) public.erp_activity_log;  -- if dead_tuple_pct > 20%

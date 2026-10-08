-- =============================================================================
-- Rules Console — Phase 2A weekly-off check (read-only).
--
-- Run in the Supabase SQL editor AFTER 20261008140000 and BEFORE
-- 20261008140100 (wiring). Compares the new weekly-off rule with the old
-- "3rd Saturday is a weekly off" rule for every employee and every day of the
-- previous, current and next month. Every row must show 0 differences.
-- Any difference = do not wire; roll back 20261008140000.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15min';

WITH
days AS (
  SELECT d::date AS d
  FROM generate_series(
    (date_trunc('month', current_date) - interval '1 month')::date,
    (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
    interval '1 day'
  ) d
),
emps AS (
  SELECT DISTINCT ON (public.normalize_attendance_employee_code(employee_code))
         public.normalize_attendance_employee_code(employee_code) AS code, department AS dept
  FROM public.admin_ifsp_employee_master
  WHERE nullif(btrim(employee_code), '') IS NOT NULL
),
cmp AS (
  SELECT e.code, e.dept, days.d,
         extract(dow FROM days.d) = 0
           OR (public.admin_rule_is_third_saturday(days.d)
               AND (e.dept IS NULL OR public.admin_rule_value('wo.third_saturday_off', e.dept, days.d) IS DISTINCT FROM 'false'::jsonb))
           AS old_weekly_off,
         public.admin_rule_is_weekly_off(e.code, days.d) AS new_weekly_off,
         public.admin_rule_holidays_apply(e.code, days.d) AS holidays_apply
  FROM emps e CROSS JOIN days
)
SELECT 'Weekly off: old rule vs new rule' AS check_name,
       count(*) AS rows_checked,
       count(*) FILTER (WHERE old_weekly_off IS DISTINCT FROM new_weekly_off) AS differences,
       string_agg(DISTINCT CASE WHEN old_weekly_off IS DISTINCT FROM new_weekly_off THEN code || ' ' || d::text END, ', ') AS first_differences
FROM cmp
UNION ALL
SELECT 'Holidays apply to everyone', count(*), count(*) FILTER (WHERE NOT holidays_apply), NULL
FROM cmp;

ROLLBACK;

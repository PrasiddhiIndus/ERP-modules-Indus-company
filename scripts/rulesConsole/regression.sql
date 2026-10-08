-- =============================================================================
-- Rules Console — production regression snapshot (read-only).
--
-- Run in the Supabase SQL editor BEFORE applying a Rules Console migration,
-- save the output, apply the migration, run again. Every row must match
-- (same row count and same hash). Any difference = stop and roll back.
--
-- Covers the previous and current month for every employee in Employee Master:
--   * C/O start date and expiry date for each earning day
--   * Sunday P(OD)-only and 3rd-Saturday flags per employee
--   * Whether each day earns C/O, per employee and prior mark
--   * The value of each wired rule per department and day
--   * The C/O ledger itself (proves no stored credit was changed)
-- Runs inside a READ ONLY transaction: it cannot write anything.
--
-- Needs 20261008100000 (admin_rule_value). If that migration is not applied
-- yet, delete the "Rule value" block for the first (baseline) run only and
-- compare the remaining rows.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15min';

WITH
days AS (
  SELECT d::date AS d
  FROM generate_series(
    (date_trunc('month', current_date) - interval '1 month')::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) d
),
emps AS (
  SELECT DISTINCT public.normalize_attendance_employee_code(employee_code) AS code
  FROM public.admin_ifsp_employee_master
  WHERE nullif(btrim(employee_code), '') IS NOT NULL
),
depts AS (
  SELECT DISTINCT department AS dept FROM public.admin_ifsp_employee_master
  UNION SELECT NULL
),
wired AS (
  SELECT unnest(ARRAY[
    'wo.third_saturday_off', 'co.start_date', 'co.expiry_months', 'co.sunday_pod_only', 'co.third_saturday_earns'
  ]) AS k
),
sections AS (
  SELECT 'C/O start date' AS section, 1 AS n,
         md5(indus_one.comp_off_cutoff_date()::text) AS h,
         indus_one.comp_off_cutoff_date()::text AS sample

  UNION ALL
  SELECT 'C/O expiry per earned day', count(*),
         md5(string_agg(d::text || '=' || coalesce(indus_one.comp_off_expiry_for_earned(d)::text, '∅'), ',' ORDER BY d)),
         min(indus_one.comp_off_expiry_for_earned(d))::text
  FROM days

  UNION ALL
  SELECT 'Employee C/O flags', count(*),
         md5(string_agg(code || ':' || indus_one.comp_off_sunday_pod_only_employee(code)::text
                             || ':' || indus_one.comp_off_third_saturday_excluded_employee(code)::text, ',' ORDER BY code)),
         count(*) FILTER (WHERE indus_one.comp_off_third_saturday_excluded_employee(code))::text || ' excluded on 3rd Sat'
  FROM emps

  UNION ALL
  SELECT 'C/O earning day (employee × day × prior mark)', count(*),
         md5(string_agg(e.code || '|' || days.d::text || '|' || coalesce(p, '∅') || '=' ||
                        coalesce(indus_one.comp_off_is_earning_day(days.d, p, e.code)::text, '∅'),
                        ',' ORDER BY e.code, days.d, p NULLS FIRST)),
         count(*) FILTER (WHERE indus_one.comp_off_is_earning_day(days.d, p, e.code))::text || ' earning'
  FROM emps e
  CROSS JOIN days
  CROSS JOIN unnest(ARRAY[NULL, 'WO', 'NH/PH']::text[]) p

  UNION ALL
  SELECT 'Rule value (rule × department × day)', count(*),
         md5(string_agg(w.k || '|' || coalesce(dp.dept, '∅') || '|' || days.d::text || '=' ||
                        coalesce(public.admin_rule_value(w.k, dp.dept, days.d)::text, '∅'),
                        ',' ORDER BY w.k, dp.dept NULLS FIRST, days.d)),
         NULL
  FROM wired w
  CROSS JOIN depts dp
  CROSS JOIN days

  UNION ALL
  SELECT 'C/O ledger (stored credits)', count(*),
         md5(coalesce(string_agg(
               employee_code || '|' || earned_date::text || '|' || coalesce(source_type, '') || '|' ||
               coalesce(credit_amount::text, '') || '|' || coalesce(consumed_amount::text, '') || '|' ||
               coalesce(expiry_date::text, '') || '|' || coalesce(status, ''),
               ',' ORDER BY employee_code, earned_date), '')),
         sum(credit_amount)::text || ' credited'
  FROM indus_one.comp_off_credits
)
SELECT section, n AS rows_checked, h AS hash, sample FROM sections;

ROLLBACK;

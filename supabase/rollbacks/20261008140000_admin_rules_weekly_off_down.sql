-- =============================================================================
-- Rollback for 20261008140000_admin_rules_weekly_off.sql
-- Restores the C/O earning day from 20260923140000 and "3rd Saturday is a
-- weekly off" as the editable weekly-off rule.
--
-- Run by hand (roll back 20261008140100 first if applied).
-- Removed: wo.pattern / wo.custom_days / wo.auto / wo.auto_holiday values other
-- than the setup rows (the browser would otherwise keep reading them).
-- Changes made to "3rd Saturday is a weekly off" before 2A are kept.
-- Afterwards: DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008140000';
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_earning_day(
  p_date date,
  p_prior_mark text DEFAULT NULL,
  p_employee_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN p_date IS NULL THEN false
      WHEN indus_one.comp_off_normalize_mark(p_prior_mark) IN ('WO', 'NH/PH', 'NHPH') THEN true
      WHEN extract(dow FROM p_date) = 0 THEN true
      WHEN EXISTS (
        SELECT 1
        FROM public.admin_national_public_holidays h
        WHERE h.holiday_date = p_date
          AND h.holiday_type IN ('NH', 'PH')
      ) THEN true
      WHEN indus_one.comp_off_is_third_saturday(p_date)
        AND NOT indus_one.comp_off_third_saturday_excluded_employee(p_employee_code)
      THEN true
      ELSE false
    END;
$$;

DROP FUNCTION IF EXISTS public.admin_rule_holidays_apply(text, date);
DROP FUNCTION IF EXISTS public.admin_rule_is_weekly_off(text, date);
DROP FUNCTION IF EXISTS public.admin_rule_weekly_off_pattern(text, date);
DROP FUNCTION IF EXISTS public.admin_rule_is_third_saturday(date);

ALTER TABLE public.admin_attendance_rule_values DISABLE TRIGGER admin_attendance_rule_values_append_only;
DELETE FROM public.admin_attendance_rule_values
WHERE rule_key IN ('wo.pattern', 'wo.custom_days', 'wo.auto', 'wo.auto_holiday')
  AND NOT (scope_type = 'company' AND reason = 'Existing rule at setup');
ALTER TABLE public.admin_attendance_rule_values ENABLE TRIGGER admin_attendance_rule_values_append_only;

UPDATE public.admin_attendance_rules
SET is_wired = true, retired = false,
    engine_ref = 'src/lib/attendanceRules.js isThirdSaturdayWorkingDepartment → isAutoWeekoffDate, isPaidThirdSaturdayWeekoffCell, buildMonthlyRegisterGrid'
WHERE rule_key = 'wo.third_saturday_off';

UPDATE public.admin_attendance_rules AS r
SET is_wired = false, engine_ref = 'Phase 2A', applies_note = s.applies_note, description = s.description
FROM (VALUES
  ('wo.pattern', 'Attendance register and monthly totals', 'Which days are marked WO automatically.'),
  ('wo.custom_days', 'Attendance register', 'Used when the pattern is "Custom weekdays".'),
  ('wo.auto', 'Attendance register', 'When on, weekly off days are filled in the register automatically.'),
  ('wo.auto_holiday', 'Attendance register', 'When on, dates in the holiday calendar are filled as NH/PH automatically.')
) AS s(rule_key, applies_note, description)
WHERE r.rule_key = s.rule_key;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Rules Console — Phase 2A: weekly off reads from rules.
--
-- Needs 20261008120000 + 20261008130000.
-- Wiring (making the rules editable) is a separate step, applied only after
-- scripts/rulesConsole/regression.sql shows no difference:
--   20261008140100_admin_rules_weekly_off_wire.sql
-- Rollback: supabase/rollbacks/20261008140000_admin_rules_weekly_off_down.sql
--
-- Rules:
--   wo.pattern       sun_3rd_sat | sun_only | none | custom   (replaces wo.third_saturday_off)
--   wo.custom_days   weekdays for "custom" (0 = Sunday … 6 = Saturday)
--   wo.auto          fill weekly offs in the register automatically
--   wo.auto_holiday  NH/PH apply to the employee (auto mark + C/O earning)
--
-- Seeds reproduce today exactly: every wo.third_saturday_off row (company and
-- department, with its dates) is carried over as a wo.pattern row
-- (Yes → "Sunday + 3rd Saturday", No → "Sunday only", empty → inherit).
--
-- C/O earning day (indus_one.comp_off_is_earning_day) — only change in the engine:
--   * prior mark WO / NH/PH                  → earns (unchanged)
--   * NH/PH calendar day                     → earns if holidays apply (wo.auto_holiday)
--   * 3rd Saturday                           → earns if co.third_saturday_earns (unchanged)
--                                              AND (it is a weekly off OR pattern is "Sunday only")
--     The "Sunday only" clause keeps M&M / Maintenance-FTC earning on a worked
--     3rd Saturday, as today. Phase 2B replaces it with co.third_saturday_basis.
--   * any other day                          → earns only if it is a weekly off
--   With the seeds every employee has Sunday + 3rd Saturday or Sunday only, so
--   results are identical to before. "No weekly off" stops Sunday earning.
-- No register, punch, leave or credit row is changed by this migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Holiday rule key (Phase 1 builds may have it as wo.holiday_auto)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_attendance_rules WHERE rule_key = 'wo.holiday_auto') THEN
    INSERT INTO public.admin_attendance_rules
      (rule_key, module, label, description, value_type, default_value, options, unit, min_value, max_value, step,
       allowed_scopes, is_wired, hidden_until_wired, retired, replaces, engine_ref, applies_note, sort_order)
    SELECT 'wo.auto_holiday', module, label, description, value_type, default_value, options, unit, min_value,
           max_value, step, allowed_scopes, false, false, false, 'wo.holiday_auto', engine_ref, applies_note, sort_order
    FROM public.admin_attendance_rules WHERE rule_key = 'wo.holiday_auto'
    ON CONFLICT (rule_key) DO NOTHING;

    UPDATE public.admin_attendance_rules
    SET retired = true, is_wired = false, hidden_until_wired = true, engine_ref = 'Renamed to wo.auto_holiday'
    WHERE rule_key = 'wo.holiday_auto';
  END IF;
END;
$$;

INSERT INTO public.admin_attendance_rule_values
  (rule_key, scope_type, scope_id, scope_label, value, effective_from, reason, created_by, created_by_name)
SELECT r.rule_key, 'company', NULL, NULL, r.default_value, DATE '2000-01-01', 'Existing rule at setup', NULL, 'System'
FROM public.admin_attendance_rules r
WHERE r.rule_key = 'wo.auto_holiday'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_attendance_rule_values v WHERE v.rule_key = r.rule_key AND v.scope_type = 'company'
  );

-- -----------------------------------------------------------------------------
-- 2. wo.pattern from the existing 3rd-Saturday history (same dates and levels)
-- -----------------------------------------------------------------------------
INSERT INTO public.admin_attendance_rule_values
  (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
   created_by, created_by_name)
SELECT
  'wo.pattern',
  v.scope_type,
  v.scope_id,
  v.scope_label,
  CASE WHEN v.value IS NULL THEN NULL
       WHEN v.value = 'false'::jsonb THEN '"sun_only"'::jsonb
       ELSE '"sun_3rd_sat"'::jsonb END,
  CASE WHEN v.old_value IS NULL THEN NULL
       WHEN v.old_value = 'false'::jsonb THEN '"sun_only"'::jsonb
       ELSE '"sun_3rd_sat"'::jsonb END,
  v.effective_from,
  'Carried over from "3rd Saturday is a weekly off": ' || v.reason,
  'active',
  v.created_by,
  v.created_by_name
FROM public.admin_attendance_rule_values v
WHERE v.rule_key = 'wo.third_saturday_off'
  AND v.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_attendance_rule_values p
    WHERE p.rule_key = 'wo.pattern' AND p.reason LIKE 'Carried over from "3rd Saturday%'
  )
ORDER BY v.id;

-- The old key is no longer read; nobody can change it any more.
UPDATE public.admin_attendance_rules
SET is_wired = false, retired = true, engine_ref = 'Replaced by wo.pattern'
WHERE rule_key = 'wo.third_saturday_off';

UPDATE public.admin_attendance_rules AS r
SET engine_ref = s.engine_ref, applies_note = s.applies_note, description = s.description
FROM (VALUES
  ('wo.pattern',
   'public.admin_rule_is_weekly_off() ← indus_one.comp_off_is_earning_day; src/lib/attendanceRules.js isWeeklyOffDay → register sync, stale WO clearing, grid, totals',
   'Attendance register, monthly totals and C/O earning',
   'Which days are weekly offs. Weekly offs are marked WO and, when worked, earn C/O. "No weekly off" means every day is a working day and no day earns C/O except holidays.'),
  ('wo.custom_days',
   'public.admin_rule_is_weekly_off(); src/lib/attendanceRules.js isWeeklyOffDay',
   'Attendance register, monthly totals and C/O earning',
   'Used when the pattern is "Custom weekdays".'),
  ('wo.auto',
   'src/lib/attendanceRules.js isAutoWeeklyOffDay → syncRegisterAutoWeekoffMarks, buildMonthlyRegisterGrid',
   'Attendance register',
   'When on, weekly off days are filled in the register automatically.'),
  ('wo.auto_holiday',
   'indus_one.comp_off_is_earning_day; src/lib/attendanceRules.js isAutoHolidayFor → syncRegisterAutoHolidayMarks, totals',
   'Attendance register and C/O earning',
   'When on, holiday-calendar dates are marked NH/PH and earn C/O when worked. When off, holidays do not apply: the day is a normal working day.')
) AS s(rule_key, engine_ref, applies_note, description)
WHERE r.rule_key = s.rule_key;

-- -----------------------------------------------------------------------------
-- 3. Weekly-off check (mirrored by isWeeklyOffDay in src/lib/attendanceRules.js)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rule_is_third_saturday(p_date date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_date IS NOT NULL AND extract(dow FROM p_date) = 6 AND extract(day FROM p_date) BETWEEN 15 AND 21;
$$;

CREATE OR REPLACE FUNCTION public.admin_rule_weekly_off_pattern(p_employee_code text, p_date date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN v IN ('sun_3rd_sat', 'sun_only', 'none', 'custom') THEN v
    ELSE 'sun_3rd_sat'
  END
  FROM (SELECT public.get_rule_value(p_employee_code, 'wo.pattern', p_date) #>> '{}' AS v) s;
$$;

CREATE OR REPLACE FUNCTION public.admin_rule_is_weekly_off(p_employee_code text, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_date IS NULL THEN false
    WHEN p.pattern = 'none' THEN false
    WHEN p.pattern = 'sun_only' THEN extract(dow FROM p_date) = 0
    WHEN p.pattern = 'custom' THEN
      coalesce(public.get_rule_value(p_employee_code, 'wo.custom_days', p_date), '[0]'::jsonb)
        @> to_jsonb(extract(dow FROM p_date)::integer)
    ELSE extract(dow FROM p_date) = 0 OR public.admin_rule_is_third_saturday(p_date)
  END
  FROM (SELECT public.admin_rule_weekly_off_pattern(p_employee_code, p_date) AS pattern) p;
$$;

CREATE OR REPLACE FUNCTION public.admin_rule_holidays_apply(p_employee_code text, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((public.get_rule_value(p_employee_code, 'wo.auto_holiday', p_date) #>> '{}')::boolean, true);
$$;

GRANT EXECUTE ON FUNCTION public.admin_rule_is_third_saturday(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_weekly_off_pattern(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_is_weekly_off(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_holidays_apply(text, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. C/O earning day
-- -----------------------------------------------------------------------------
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
      WHEN EXISTS (
        SELECT 1
        FROM public.admin_national_public_holidays h
        WHERE h.holiday_date = p_date
          AND h.holiday_type IN ('NH', 'PH')
      ) AND public.admin_rule_holidays_apply(p_employee_code, p_date) THEN true
      WHEN indus_one.comp_off_is_third_saturday(p_date) THEN
        NOT indus_one.comp_off_third_saturday_excluded_employee(p_employee_code)
        AND (
          public.admin_rule_is_weekly_off(p_employee_code, p_date)
          OR public.admin_rule_weekly_off_pattern(p_employee_code, p_date) = 'sun_only'
        )
      ELSE public.admin_rule_is_weekly_off(p_employee_code, p_date)
    END;
$$;

COMMENT ON FUNCTION indus_one.comp_off_is_earning_day(date, text, text) IS
  'C/O earning day: prior WO/NH-PH; holiday where holidays apply; weekly off per Rules Console (wo.pattern); '
  'worked 3rd Saturday for "Sunday only" departments unless co.third_saturday_earns = No.';

NOTIFY pgrst, 'reload schema';

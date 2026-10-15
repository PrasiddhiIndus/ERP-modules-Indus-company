-- =============================================================================
-- Employee Master: "Has weekly off" split into "Sunday off" and "3rd Saturday off".
--
-- Needs 20261008160000_employee_attendance_flags.sql. Works with or without
-- 20261008170000_employee_co_expiry_flag.sql ("C/O expires" is used only when it is installed).
-- Rollback: supabase/rollbacks/20261015140000_employee_weekly_off_sunday_third_saturday_down.sql
--
-- The two checkboxes still save the employee's own wo.pattern value:
--   Sunday ✓  3rd Saturday ✓  → sun_3rd_sat
--   Sunday ✓  3rd Saturday ✗  → sun_only
--   Sunday ✗  3rd Saturday ✓  → third_sat_only   (new pattern: only the 3rd Saturday is a weekly off)
--   Sunday ✗  3rd Saturday ✗  → none
-- When the chosen pattern is what the employee's department / company already gives,
-- the employee's own value is removed instead, so they keep following that level.
--
-- C/O earning needs no engine change: on a "3rd Saturday only" pattern the 3rd Saturday is a
-- weekly off (earns, unless co.third_saturday_earns = No for the department) and Sunday is a
-- normal working day (does not earn), exactly like any other weekday.
-- No existing employee uses third_sat_only, so nothing changes for anyone until it is chosen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New pattern option (keeps the Rules Console's option check happy)
-- -----------------------------------------------------------------------------
UPDATE public.admin_attendance_rules
SET options = coalesce(options, '[]'::jsonb)
      || '[{"value":"third_sat_only","label":"3rd Saturday only"}]'::jsonb
WHERE rule_key = 'wo.pattern'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(options, '[]'::jsonb)) o WHERE o ->> 'value' = 'third_sat_only'
  );

-- -----------------------------------------------------------------------------
-- 2. Weekly-off checks (mirrored by weeklyOffPattern / isWeeklyOffDay in src/lib/attendanceRules.js)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rule_weekly_off_pattern(p_employee_code text, p_date date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN v IN ('sun_3rd_sat', 'sun_only', 'third_sat_only', 'none', 'custom') THEN v
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
    WHEN extract(dow FROM p_date) <> 0
         AND NOT public.admin_rule_is_third_saturday(p_date)
         AND NOT EXISTS (
           SELECT 1 FROM public.admin_attendance_rule_values v
           WHERE v.rule_key = 'wo.pattern' AND v.status = 'active' AND v.value = '"custom"'::jsonb
         ) THEN false
    ELSE (
      SELECT CASE
        WHEN p.pattern = 'none' THEN false
        WHEN p.pattern = 'sun_only' THEN extract(dow FROM p_date) = 0
        WHEN p.pattern = 'third_sat_only' THEN public.admin_rule_is_third_saturday(p_date)
        WHEN p.pattern = 'custom' THEN
          coalesce(public.get_rule_value(p_employee_code, 'wo.custom_days', p_date), '[0]'::jsonb)
            @> to_jsonb(extract(dow FROM p_date)::integer)
        ELSE extract(dow FROM p_date) = 0 OR public.admin_rule_is_third_saturday(p_date)
      END
      FROM (SELECT public.admin_rule_weekly_off_pattern(p_employee_code, p_date) AS pattern) p
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rule_weekly_off_pattern(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_is_weekly_off(text, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Employee Master read: Sunday / 3rd Saturday checkboxes
-- -----------------------------------------------------------------------------
-- plpgsql so it can be created on databases without the "C/O expires" update (no co_expires key then).
CREATE OR REPLACE FUNCTION public.admin_employee_attendance_flags(p_employee_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pattern text := public.admin_rule_weekly_off_pattern(p_employee_code, current_date);
  v_custom jsonb := coalesce(public.get_rule_value(p_employee_code, 'wo.custom_days', current_date), '[0]'::jsonb);
  v_out jsonb;
  v_co_expires boolean;
BEGIN
  v_out := jsonb_build_object(
    'has_weekly_off', v_pattern <> 'none',
    'sunday_off', CASE v_pattern
        WHEN 'sun_3rd_sat' THEN true
        WHEN 'sun_only' THEN true
        WHEN 'custom' THEN v_custom @> '0'::jsonb
        ELSE false
      END,
    'third_saturday_off', CASE v_pattern
        WHEN 'sun_3rd_sat' THEN true
        WHEN 'third_sat_only' THEN true
        WHEN 'custom' THEN v_custom @> '6'::jsonb
        ELSE false
      END,
    'earns_co', public.admin_rule_earns_co(p_employee_code, current_date),
    'has_holidays', public.admin_rule_holidays_apply(p_employee_code, current_date)
  );
  IF to_regprocedure('public.admin_rule_co_expires(text, date)') IS NOT NULL THEN
    EXECUTE 'SELECT public.admin_rule_co_expires($1, current_date)' INTO v_co_expires USING p_employee_code;
    v_out := v_out || jsonb_build_object('co_expires', v_co_expires);
  END IF;
  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_employee_attendance_flags(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Set one rule to an exact value for the employee
-- -----------------------------------------------------------------------------
-- Removes the employee's own value when the level above already gives p_want;
-- otherwise stores p_want for the employee. Returns true when something was saved.
CREATE OR REPLACE FUNCTION public.admin_employee_value_apply(
  p_rule_key text,
  p_employee text,
  p_label text,
  p_want jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := 'Employee Master: set to ' || coalesce(p_want #>> '{}', 'default');
  v_own record;
BEGIN
  IF public.get_rule_value(p_employee, p_rule_key, current_date) IS NOT DISTINCT FROM p_want THEN
    RETURN false;
  END IF;

  SELECT * INTO v_own FROM public.admin_rules_own_value(p_rule_key, 'employee', p_employee, current_date);

  IF v_own.value IS NOT NULL THEN
    INSERT INTO public.admin_attendance_rule_values
      (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
       created_by, created_by_name)
    VALUES
      (p_rule_key, 'employee', p_employee, p_label, NULL, v_own.value, current_date, v_reason, 'active',
       auth.uid(), public.admin_rules_actor_name());
    IF public.get_rule_value(p_employee, p_rule_key, current_date) IS NOT DISTINCT FROM p_want THEN
      RETURN true;
    END IF;
  END IF;

  INSERT INTO public.admin_attendance_rule_values
    (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
     created_by, created_by_name)
  VALUES
    (p_rule_key, 'employee', p_employee, p_label, p_want, NULL, current_date, v_reason, 'active',
     auth.uid(), public.admin_rules_actor_name());
  RETURN true;
END;
$$;

-- Internal: only called by admin_employee_attendance_flags_save (which checks access).
REVOKE ALL ON FUNCTION public.admin_employee_value_apply(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Employee Master save with p_weekly_off_pattern
-- -----------------------------------------------------------------------------
-- Both earlier versions, so named-argument calls from the app are never ambiguous.
DROP FUNCTION IF EXISTS public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean, boolean);

-- NULL for a setting = leave it unchanged. p_weekly_off_pattern wins over p_has_weekly_off.
CREATE OR REPLACE FUNCTION public.admin_employee_attendance_flags_save(
  p_employee_code text,
  p_has_weekly_off boolean DEFAULT NULL,
  p_earns_co boolean DEFAULT NULL,
  p_has_holidays boolean DEFAULT NULL,
  p_co_expires boolean DEFAULT NULL,
  p_weekly_off_pattern text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp text := public.admin_rule_norm_employee(p_employee_code);
  v_label text;
  v_pattern_default jsonb;
  v_pattern text := nullif(btrim(coalesce(p_weekly_off_pattern, '')), '');
BEGIN
  IF NOT public.admin_employee_flags_can_edit() THEN
    RAISE EXCEPTION 'You cannot change attendance settings for employees.' USING ERRCODE = '42501';
  END IF;

  IF v_pattern IS NOT NULL AND v_pattern NOT IN ('sun_3rd_sat', 'sun_only', 'third_sat_only', 'none') THEN
    RAISE EXCEPTION 'Choose which days are weekly offs.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(nullif(btrim(m.full_name), ''), v_emp) || ' (' || v_emp || ')' INTO v_label
  FROM public.admin_ifsp_employee_master m
  WHERE public.normalize_attendance_employee_code(m.employee_code) = v_emp
  LIMIT 1;
  IF v_emp IS NULL OR v_label IS NULL THEN
    RAISE EXCEPTION 'Save the employee first, then change attendance settings.' USING ERRCODE = '22023';
  END IF;

  IF v_pattern IS NOT NULL THEN
    PERFORM public.admin_employee_value_apply('wo.pattern', v_emp, v_label, to_jsonb(v_pattern));
  ELSIF p_has_weekly_off IS NOT NULL THEN
    SELECT CASE WHEN r.default_value IS NULL OR r.default_value = '"none"'::jsonb THEN '"sun_3rd_sat"'::jsonb
                ELSE r.default_value END
    INTO v_pattern_default
    FROM public.admin_attendance_rules r WHERE r.rule_key = 'wo.pattern';

    PERFORM public.admin_employee_flag_apply('wo.pattern', v_emp, v_label, p_has_weekly_off,
      '"none"'::jsonb, coalesce(v_pattern_default, '"sun_3rd_sat"'::jsonb));
  END IF;
  IF p_has_holidays IS NOT NULL THEN
    PERFORM public.admin_employee_flag_apply('wo.auto_holiday', v_emp, v_label, p_has_holidays,
      'false'::jsonb, 'true'::jsonb);
  END IF;
  IF p_earns_co IS NOT NULL THEN
    PERFORM public.admin_employee_flag_apply('co.earn', v_emp, v_label, p_earns_co,
      'false'::jsonb, 'true'::jsonb);
  END IF;
  IF p_co_expires IS NOT NULL THEN
    IF to_regprocedure('indus_one.comp_off_resync_expiry(text)') IS NULL THEN
      RAISE EXCEPTION 'The "C/O expires" setting is not set up on this server yet. Ask IT to apply the latest database update.'
        USING ERRCODE = '22023';
    END IF;
    IF public.admin_employee_flag_apply('co.expiry_mode', v_emp, v_label, p_co_expires,
         '"never"'::jsonb, '"months"'::jsonb) THEN
      PERFORM indus_one.comp_off_resync_expiry(v_emp);
    END IF;
  END IF;

  RETURN public.admin_employee_attendance_flags(v_emp);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean, boolean, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

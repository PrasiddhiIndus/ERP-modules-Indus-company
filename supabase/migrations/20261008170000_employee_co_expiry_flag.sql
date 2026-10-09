-- =============================================================================
-- Employee Master: "C/O expires" per employee.
--
-- Needs 20261008160000_employee_attendance_flags.sql.
-- Rollback: supabase/rollbacks/20261008170000_employee_co_expiry_flag_down.sql
--
-- Ticked (default)  → C/O expires co.expiry_months (2) after the day it was earned, as today.
-- Unticked          → co.expiry_mode = "never" for the employee: new C/O never expires and
--                     unused C/O that has not expired yet stops expiring.
-- Ticking again puts back "earned date + co.expiry_months" on that unused C/O
-- (C/O already past that date then expires as usual).
--
-- "Never" is stored as expiry_date 9999-12-31 (the column is NOT NULL), so balances, FIFO use
-- (never-expiring C/O is used last) and the expiry job work unchanged.
-- With no co.expiry_mode value saved anywhere nothing changes for anyone.
-- =============================================================================

UPDATE public.admin_attendance_rules
SET is_wired = true,
    hidden_until_wired = false,
    engine_ref = 'public.admin_rule_co_expires() ← indus_one.comp_off_credits insert trigger',
    applies_note = 'C/O earning',
    description = 'Whether newly earned C/O expires. Employee Master also updates the employee''s unused C/O.'
WHERE rule_key = 'co.expiry_mode'
  AND NOT retired;

CREATE OR REPLACE FUNCTION public.admin_rule_co_expires(p_employee_code text, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(public.get_rule_value(p_employee_code, 'co.expiry_mode', p_date) #>> '{}', 'months') <> 'never';
$$;

GRANT EXECUTE ON FUNCTION public.admin_rule_co_expires(text, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. New C/O (attendance and manual adjustments) follows the employee's setting
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.comp_off_credit_apply_expiry_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
BEGIN
  IF NOT public.admin_rule_co_expires(NEW.employee_code, (now() AT TIME ZONE 'Asia/Kolkata')::date) THEN
    NEW.expiry_date := DATE '9999-12-31';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comp_off_credit_expiry_mode ON indus_one.comp_off_credits;
CREATE TRIGGER trg_comp_off_credit_expiry_mode
  BEFORE INSERT ON indus_one.comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION indus_one.comp_off_credit_apply_expiry_mode();

-- -----------------------------------------------------------------------------
-- 2. Unused, not-yet-expired C/O of one employee follows the current setting
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.comp_off_resync_expiry(p_employee_code text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_expires boolean := public.admin_rule_co_expires(v_code, v_today);
  v_count integer;
BEGIN
  UPDATE indus_one.comp_off_credits c
  SET expiry_date = CASE WHEN v_expires THEN indus_one.comp_off_expiry_for_earned(c.earned_date)
                         ELSE DATE '9999-12-31' END,
      updated_at = now()
  WHERE c.employee_code = v_code
    AND c.status IN ('available', 'partial')
    AND c.expiry_date >= v_today
    AND c.expiry_date IS DISTINCT FROM CASE WHEN v_expires THEN indus_one.comp_off_expiry_for_earned(c.earned_date)
                                            ELSE DATE '9999-12-31' END;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION indus_one.comp_off_resync_expiry(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Employee Master read / save with the fourth checkbox
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_employee_attendance_flags(p_employee_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'has_weekly_off', public.admin_rule_weekly_off_pattern(p_employee_code, current_date) <> 'none',
    'earns_co', public.admin_rule_earns_co(p_employee_code, current_date),
    'co_expires', public.admin_rule_co_expires(p_employee_code, current_date),
    'has_holidays', public.admin_rule_holidays_apply(p_employee_code, current_date)
  );
$$;

DROP FUNCTION IF EXISTS public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean);

-- NULL for a flag = leave it unchanged. Returns the flags in force today.
CREATE OR REPLACE FUNCTION public.admin_employee_attendance_flags_save(
  p_employee_code text,
  p_has_weekly_off boolean DEFAULT NULL,
  p_earns_co boolean DEFAULT NULL,
  p_has_holidays boolean DEFAULT NULL,
  p_co_expires boolean DEFAULT NULL
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
BEGIN
  IF NOT public.admin_employee_flags_can_edit() THEN
    RAISE EXCEPTION 'You cannot change attendance settings for employees.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(btrim(m.full_name), ''), v_emp) || ' (' || v_emp || ')' INTO v_label
  FROM public.admin_ifsp_employee_master m
  WHERE public.normalize_attendance_employee_code(m.employee_code) = v_emp
  LIMIT 1;
  IF v_emp IS NULL OR v_label IS NULL THEN
    RAISE EXCEPTION 'Save the employee first, then change attendance settings.' USING ERRCODE = '22023';
  END IF;

  SELECT CASE WHEN r.default_value IS NULL OR r.default_value = '"none"'::jsonb THEN '"sun_3rd_sat"'::jsonb
              ELSE r.default_value END
  INTO v_pattern_default
  FROM public.admin_attendance_rules r WHERE r.rule_key = 'wo.pattern';

  IF p_has_weekly_off IS NOT NULL THEN
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
    IF public.admin_employee_flag_apply('co.expiry_mode', v_emp, v_label, p_co_expires,
         '"never"'::jsonb, '"months"'::jsonb) THEN
      PERFORM indus_one.comp_off_resync_expiry(v_emp);
    END IF;
  END IF;

  RETURN public.admin_employee_attendance_flags(v_emp);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Rollback for 20261008170000_employee_co_expiry_flag.sql.
-- New C/O expires after co.expiry_months for everyone again, unused never-expiring C/O gets
-- "earned date + co.expiry_months" back, and Employee Master returns to three checkboxes.
-- Employee-level co.expiry_mode values stay in the history but are no longer read.

DROP TRIGGER IF EXISTS trg_comp_off_credit_expiry_mode ON indus_one.comp_off_credits;
DROP FUNCTION IF EXISTS indus_one.comp_off_credit_apply_expiry_mode();
DROP FUNCTION IF EXISTS indus_one.comp_off_resync_expiry(text);

UPDATE indus_one.comp_off_credits
SET expiry_date = indus_one.comp_off_expiry_for_earned(earned_date),
    updated_at = now()
WHERE expiry_date = DATE '9999-12-31';

UPDATE public.admin_attendance_rules
SET is_wired = false,
    engine_ref = 'Phase 2C',
    description = 'Whether C/O credits expire.'
WHERE rule_key = 'co.expiry_mode';

CREATE OR REPLACE FUNCTION public.admin_employee_attendance_flags(p_employee_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'has_weekly_off', public.admin_rule_weekly_off_pattern(p_employee_code, current_date) <> 'none',
    'earns_co', public.admin_rule_earns_co(p_employee_code, current_date),
    'has_holidays', public.admin_rule_holidays_apply(p_employee_code, current_date)
  );
$$;

DROP FUNCTION IF EXISTS public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.admin_employee_attendance_flags_save(
  p_employee_code text,
  p_has_weekly_off boolean DEFAULT NULL,
  p_earns_co boolean DEFAULT NULL,
  p_has_holidays boolean DEFAULT NULL
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

  RETURN public.admin_employee_attendance_flags(v_emp);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_rule_co_expires(text, date);

NOTIFY pgrst, 'reload schema';

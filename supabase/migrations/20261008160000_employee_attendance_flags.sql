-- =============================================================================
-- Employee Master: "Has weekly off", "Earns C/O" and "Has NH/PH" per employee.
--
-- Needs 20261008120000 … 20261008140100 (Rules Console scopes and weekly-off rules).
-- Rollback: supabase/rollbacks/20261008160000_employee_attendance_flags_down.sql
--
-- The three checkboxes are employee-level values of existing Rules Console rules,
-- so the console and Employee Master never disagree:
--   Has weekly off  off → wo.pattern      = "none"  (no WO; Sundays / 3rd Saturdays are working days)
--   Has NH/PH       off → wo.auto_holiday = false   (no NH/PH; a punch is a normal working day)
--   Earns C/O       off → co.earn         = false   (no C/O on any day)
-- Ticking a box again removes the employee's own value, so the employee follows the
-- department / company setting as before. Changes apply from today; earlier days and
-- credits already in the C/O ledger are not touched.
--
-- co.earn is wired here: indus_one.comp_off_try_earn_credit (every C/O credit goes
-- through it — register trigger, punch trigger, reconcile) returns early when it is off.
-- With no co.earn value saved anywhere every employee earns exactly as before.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. co.earn is read by the C/O engine
-- -----------------------------------------------------------------------------
UPDATE public.admin_attendance_rules
SET is_wired = true,
    hidden_until_wired = false,
    engine_ref = 'public.admin_rule_earns_co() ← indus_one.comp_off_try_earn_credit',
    applies_note = 'C/O earning',
    description = 'When off, no C/O is earned on any day — weekly offs, holidays and days marked WO included.'
WHERE rule_key = 'co.earn'
  AND NOT retired;

CREATE OR REPLACE FUNCTION public.admin_rule_earns_co(p_employee_code text, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((public.get_rule_value(p_employee_code, 'co.earn', p_date) #>> '{}')::boolean, true);
$$;

GRANT EXECUTE ON FUNCTION public.admin_rule_earns_co(text, date) TO authenticated, service_role;

-- Same as 20260923150000 plus the co.earn check.
CREATE OR REPLACE FUNCTION indus_one.comp_off_try_earn_credit(
  p_employee_code text,
  p_earned_date date,
  p_register_id uuid,
  p_mark text,
  p_prior_mark text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_mark text := indus_one.comp_off_normalize_mark(p_mark);
  v_source text;
BEGIN
  IF v_code = '' OR p_earned_date IS NULL THEN RETURN; END IF;
  IF p_earned_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_present_mark(v_mark) THEN RETURN; END IF;
  IF NOT public.admin_rule_earns_co(v_code, p_earned_date) THEN RETURN; END IF;
  IF NOT indus_one.comp_off_is_earning_day(p_earned_date, p_prior_mark, v_code) THEN RETURN; END IF;

  -- Production* / R&M: Sunday machine punch (P/HD) does not earn; P(OD) earns +1.
  -- Also revoke any leftover non-POD Sunday credit for this day.
  IF extract(dow FROM p_earned_date) = 0
     AND indus_one.comp_off_sunday_pod_only_employee(v_code)
     AND v_mark IS DISTINCT FROM 'P(OD)' THEN
    PERFORM indus_one.comp_off_try_revoke_credit(v_code, p_earned_date);
    RETURN;
  END IF;

  v_source := CASE
    WHEN v_mark = 'P(OD)' THEN 'register_pod'
    ELSE 'register_p'
  END;

  INSERT INTO indus_one.comp_off_credits (
    employee_code, earned_date, source_type, source_register_id, source_key,
    credit_amount, expiry_date, status
  )
  VALUES (
    v_code,
    p_earned_date,
    v_source,
    p_register_id,
    v_code || '|' || p_earned_date::text,
    1,
    indus_one.comp_off_expiry_for_earned(p_earned_date),
    'available'
  )
  ON CONFLICT (employee_code, earned_date) DO UPDATE
  SET
    source_register_id = coalesce(excluded.source_register_id, indus_one.comp_off_credits.source_register_id),
    source_type = excluded.source_type,
    source_key = excluded.source_key,
    status = CASE
      WHEN indus_one.comp_off_credits.status = 'revoked'
        AND indus_one.comp_off_credits.consumed_amount = 0
      THEN 'available'
      ELSE indus_one.comp_off_credits.status
    END,
    updated_at = now();
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Read the three flags for one employee (today)
-- -----------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.admin_employee_attendance_flags(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Save from Employee Master
-- -----------------------------------------------------------------------------
-- Employee Master editors (Admin roles, Admin module, Employee Administration page) or Rules Console users.
CREATE OR REPLACE FUNCTION public.admin_employee_flags_can_edit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_rules_can_edit()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce((to_jsonb(p) ->> 'is_active')::boolean, true)
        AND (
          public.normalize_erp_module_key(p.team) = 'admin'
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules')) m(value)
            WHERE public.normalize_erp_module_key(m.value) = 'admin'
          )
          OR public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules') ? 'admin.employee'
        )
    );
$$;

-- One flag: p_off_value is the "unticked" value; ticking removes the employee's own value
-- (and only if the level above is also "off", stores p_on_value for the employee).
CREATE OR REPLACE FUNCTION public.admin_employee_flag_apply(
  p_rule_key text,
  p_employee text,
  p_label text,
  p_want_on boolean,
  p_off_value jsonb,
  p_on_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := CASE WHEN p_want_on THEN 'Employee Master: ticked' ELSE 'Employee Master: unticked' END;
  v_own record;
  v_current jsonb;
BEGIN
  v_current := public.get_rule_value(p_employee, p_rule_key, current_date);
  IF (v_current IS DISTINCT FROM p_off_value) = p_want_on THEN
    RETURN false;
  END IF;

  SELECT * INTO v_own FROM public.admin_rules_own_value(p_rule_key, 'employee', p_employee, current_date);

  IF NOT p_want_on THEN
    INSERT INTO public.admin_attendance_rule_values
      (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
       created_by, created_by_name)
    VALUES
      (p_rule_key, 'employee', p_employee, p_label, p_off_value, v_own.value, current_date, v_reason, 'active',
       auth.uid(), public.admin_rules_actor_name());
    RETURN true;
  END IF;

  IF v_own.value IS NOT NULL THEN
    INSERT INTO public.admin_attendance_rule_values
      (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
       created_by, created_by_name)
    VALUES
      (p_rule_key, 'employee', p_employee, p_label, NULL, v_own.value, current_date, v_reason, 'active',
       auth.uid(), public.admin_rules_actor_name());
    v_current := public.get_rule_value(p_employee, p_rule_key, current_date);
    IF v_current IS DISTINCT FROM p_off_value THEN
      RETURN true;
    END IF;
  END IF;

  INSERT INTO public.admin_attendance_rule_values
    (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
     created_by, created_by_name)
  VALUES
    (p_rule_key, 'employee', p_employee, p_label, p_on_value, NULL, current_date, v_reason, 'active',
     auth.uid(), public.admin_rules_actor_name());
  RETURN true;
END;
$$;

-- Internal: only called by admin_employee_attendance_flags_save (which checks access).
REVOKE ALL ON FUNCTION public.admin_employee_flag_apply(text, text, text, boolean, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

-- NULL for a flag = leave it unchanged. Returns the flags in force today.
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

GRANT EXECUTE ON FUNCTION public.admin_employee_flags_can_edit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

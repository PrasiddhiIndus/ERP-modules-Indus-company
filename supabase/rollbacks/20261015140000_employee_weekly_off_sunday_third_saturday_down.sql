-- Rollback for 20261015140000_employee_weekly_off_sunday_third_saturday.sql.
-- Employee Master returns to one "Has weekly off" checkbox. Employees saved as
-- "3rd Saturday only" are read as "Sunday + 3rd Saturday" again (unknown patterns fall back to it);
-- their saved values stay in the history.

UPDATE public.admin_attendance_rules
SET options = (
  SELECT coalesce(jsonb_agg(o), '[]'::jsonb)
  FROM jsonb_array_elements(options) o
  WHERE o ->> 'value' <> 'third_sat_only'
)
WHERE rule_key = 'wo.pattern' AND options IS NOT NULL;

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
        WHEN p.pattern = 'custom' THEN
          coalesce(public.get_rule_value(p_employee_code, 'wo.custom_days', p_date), '[0]'::jsonb)
            @> to_jsonb(extract(dow FROM p_date)::integer)
        ELSE extract(dow FROM p_date) = 0 OR public.admin_rule_is_third_saturday(p_date)
      END
      FROM (SELECT public.admin_rule_weekly_off_pattern(p_employee_code, p_date) AS pattern) p
    )
  END;
$$;

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

DROP FUNCTION IF EXISTS public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean, boolean, text);
DROP FUNCTION IF EXISTS public.admin_employee_value_apply(text, text, text, jsonb);

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

-- =============================================================================
-- Rules Console — Phase 2A speed-up. Apply after 20261008140000, before 140100.
-- Rollback: supabase/rollbacks/20261008140050_admin_rules_weekly_off_speed_down.sql
--
-- * Index on the normalised employee code in Employee Master: get_rule() looks
--   up the employee's department on every call (C/O earning, regression checks).
-- * admin_rule_is_weekly_off(): a day that is neither a Sunday nor a 3rd
--   Saturday can only be a weekly off under "Custom weekdays", so it returns
--   false without any rule lookup while no active "Custom weekdays" value exists.
-- Results are unchanged; no data is changed.
-- =============================================================================

CREATE INDEX IF NOT EXISTS admin_ifsp_employee_master_norm_code_idx
  ON public.admin_ifsp_employee_master (public.normalize_attendance_employee_code(employee_code));

CREATE INDEX IF NOT EXISTS admin_attendance_rule_values_custom_pattern_idx
  ON public.admin_attendance_rule_values (rule_key)
  WHERE status = 'active' AND value = '"custom"'::jsonb;

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

GRANT EXECUTE ON FUNCTION public.admin_rule_is_weekly_off(text, date) TO authenticated, service_role;

ANALYZE public.admin_ifsp_employee_master;

NOTIFY pgrst, 'reload schema';

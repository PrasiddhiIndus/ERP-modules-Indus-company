-- =============================================================================
-- Rollback for 20261008140050_admin_rules_weekly_off_speed.sql
-- Restores the 20261008140000 version of admin_rule_is_weekly_off and drops the indexes.
-- Afterwards: DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008140050';
-- =============================================================================

BEGIN;

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

DROP INDEX IF EXISTS public.admin_attendance_rule_values_custom_pattern_idx;
DROP INDEX IF EXISTS public.admin_ifsp_employee_master_norm_code_idx;

COMMIT;

NOTIFY pgrst, 'reload schema';

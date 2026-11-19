-- =============================================================================
-- Ensure Employee Master "C/O expires" works (missing pieces from 20261008170000).
--
-- Live symptom: Employee Master save shows
--   "The C/O expires setting is not set up on this server yet…"
-- because admin_employee_attendance_flags_save looks for
-- indus_one.comp_off_resync_expiry(text) and that function was never installed.
--
-- This migration only adds / wires what is missing:
--   * public.admin_rule_co_expires
--   * indus_one.comp_off_credit_apply_expiry_mode + insert trigger
--   * indus_one.comp_off_resync_expiry
--   * wire catalogue row co.expiry_mode
--
-- Does NOT:
--   * rewrite admin_employee_attendance_flags_save (weekly-off pattern version stays)
--   * insert employee rule rows
--   * mass-update existing C/O credits (resync runs only when an employee toggles the checkbox)
-- With no co.expiry_mode value saved for an employee, behaviour stays "expires after months".
-- Rollback: supabase/rollbacks/20261118170000_employee_co_expiry_flag_ensure_down.sql
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

NOTIFY pgrst, 'reload schema';

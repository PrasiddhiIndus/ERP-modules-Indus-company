-- Rollback for 20261008160000_employee_attendance_flags.sql.
-- C/O earning ignores co.earn again and the Employee Master save functions are removed.
-- Employee-level rule values already saved stay in the history; wo.pattern and wo.auto_holiday
-- values keep applying (they are Rules Console rules), co.earn values are no longer read.

UPDATE public.admin_attendance_rules
SET is_wired = false,
    engine_ref = 'Phase 2B',
    description = 'When off, no C/O is earned on any day.'
WHERE rule_key = 'co.earn';

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
  IF NOT indus_one.comp_off_is_earning_day(p_earned_date, p_prior_mark, v_code) THEN RETURN; END IF;

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

DROP FUNCTION IF EXISTS public.admin_employee_attendance_flags_save(text, boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.admin_employee_flag_apply(text, text, text, boolean, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.admin_employee_flags_can_edit();
DROP FUNCTION IF EXISTS public.admin_employee_attendance_flags(text);
DROP FUNCTION IF EXISTS public.admin_rule_earns_co(text, date);

NOTIFY pgrst, 'reload schema';

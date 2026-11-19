-- =============================================================================
-- Ensure indus_one.comp_off_manual_deduct_month_amount exists.
--
-- Live symptom (Admin → C/O Management, lowering a month value):
--   function indus_one.comp_off_manual_deduct_month_amount(text, numeric, date, date, date, text) does not exist
--
-- Cause: set_comp_off_month_balance (20261021140000) deducts via this helper, which was
-- only created in 20261021120000. Some environments got the setter without the helper.
--
-- Idempotent CREATE OR REPLACE — safe if 20261021120000 already ran.
-- Rollback: supabase/rollbacks/20261119103000_comp_off_manual_deduct_month_amount_ensure_down.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION indus_one.comp_off_manual_deduct_month_amount(
  p_employee_code text,
  p_amount numeric,
  p_month_start date,
  p_month_end date,
  p_consumption_date date,
  p_idempotency_prefix text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_remaining numeric := greatest(coalesce(p_amount, 0), 0);
  v_as_of date := coalesce(p_consumption_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_credit_id uuid;
  v_take numeric;
  v_key text;
BEGIN
  IF v_code = '' OR v_remaining <= 0 THEN RETURN; END IF;

  WHILE v_remaining > 0 LOOP
    SELECT c.id, least(c.remaining_amount, v_remaining)
    INTO v_credit_id, v_take
    FROM indus_one.comp_off_credits c
    WHERE upper(btrim(c.employee_code)) = v_code
      AND c.earned_date >= p_month_start
      AND c.earned_date <= p_month_end
      AND c.status <> 'revoked'
      AND c.remaining_amount > 0
    ORDER BY c.earned_date ASC, c.expiry_date ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_credit_id IS NULL OR coalesce(v_take, 0) <= 0 THEN
      RAISE EXCEPTION 'Insufficient C/O remaining in % for employee %',
        to_char(p_month_start, 'YYYY-MM'), v_code
        USING ERRCODE = 'P0001';
    END IF;

    v_key := coalesce(p_idempotency_prefix, v_code || '|manual-month')
      || '|deduct|' || gen_random_uuid()::text;

    UPDATE indus_one.comp_off_credits
    SET consumed_amount = consumed_amount + v_take, updated_at = now()
    WHERE id = v_credit_id;

    INSERT INTO indus_one.comp_off_deductions (
      employee_code, consumption_date, register_id, credit_id, amount, entry_type, idempotency_key
    )
    VALUES (v_code, v_as_of, NULL, v_credit_id, v_take, 'deduct', v_key);

    PERFORM indus_one.comp_off_refresh_credit_status(v_credit_id);
    v_remaining := v_remaining - v_take;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION indus_one.comp_off_manual_deduct_month_amount(text, numeric, date, date, date, text) IS
  'Internal: deduct remaining C/O from credits earned in a month range (used by set_comp_off_month_balance).';

GRANT EXECUTE ON FUNCTION indus_one.comp_off_manual_deduct_month_amount(text, numeric, date, date, date, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

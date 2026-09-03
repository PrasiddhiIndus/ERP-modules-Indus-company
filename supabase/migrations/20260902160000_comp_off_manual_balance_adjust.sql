-- Manual C/O balance adjustment (admin) — set available balance from Leave Management UI.

ALTER TABLE indus_one.comp_off_credits
  DROP CONSTRAINT IF EXISTS comp_off_credits_source_type_check;

ALTER TABLE indus_one.comp_off_credits
  ADD CONSTRAINT comp_off_credits_source_type_check
  CHECK (source_type IN ('register_p', 'register_pod', 'punch', 'manual'));

CREATE OR REPLACE FUNCTION indus_one.comp_off_manual_deduct_amount(
  p_employee_code text,
  p_amount numeric,
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
  IF v_as_of < indus_one.comp_off_cutoff_date() THEN
    RAISE EXCEPTION 'C/O manual adjustment is only allowed from the current month onward'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM indus_one.expire_comp_off_credits(v_as_of);

  WHILE v_remaining > 0 LOOP
    SELECT c.id, least(c.remaining_amount, v_remaining)
    INTO v_credit_id, v_take
    FROM indus_one.comp_off_credits c
    WHERE upper(btrim(c.employee_code)) = v_code
      AND c.earned_date >= indus_one.comp_off_cutoff_date()
      AND c.status IN ('available', 'partial')
      AND c.remaining_amount > 0
      AND c.expiry_date >= v_as_of
    ORDER BY c.expiry_date ASC, c.earned_date ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_credit_id IS NULL OR coalesce(v_take, 0) <= 0 THEN
      RAISE EXCEPTION 'Insufficient C/O balance for employee %', v_code
        USING ERRCODE = 'P0001';
    END IF;

    v_key := coalesce(p_idempotency_prefix, v_code || '|manual') || '|deduct|' || gen_random_uuid()::text;

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

CREATE OR REPLACE FUNCTION indus_one.set_comp_off_available_balance(
  p_employee_code text,
  p_target_balance numeric,
  p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_target numeric := greatest(coalesce(p_target_balance, 0), 0);
  v_current numeric := 0;
  v_delta numeric := 0;
  v_prefix text;
BEGIN
  IF NOT (SELECT public.current_user_has_attendance_admin_access()) THEN
    RAISE EXCEPTION 'Not authorized to adjust C/O balance'
      USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Employee code is required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_as_of < indus_one.comp_off_cutoff_date() THEN
    RAISE EXCEPTION 'C/O manual adjustment is only allowed from the current month onward'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM indus_one.expire_comp_off_credits(v_as_of);
  v_current := indus_one.get_comp_off_available_balance(v_code, v_as_of);
  v_delta := v_target - v_current;

  IF abs(v_delta) < 0.0001 THEN
    RETURN v_current;
  END IF;

  v_prefix := 'manual|' || v_code || '|' || v_as_of::text;

  IF v_delta > 0 THEN
    INSERT INTO indus_one.comp_off_credits (
      employee_code, earned_date, source_type, source_register_id, source_key,
      credit_amount, expiry_date, status
    )
    VALUES (
      v_code,
      v_as_of,
      'manual',
      NULL,
      v_prefix || '|credit|' || gen_random_uuid()::text,
      v_delta,
      indus_one.comp_off_expiry_for_earned(v_as_of),
      'available'
    )
    ON CONFLICT (employee_code, earned_date) DO UPDATE
    SET
      credit_amount = indus_one.comp_off_credits.credit_amount + excluded.credit_amount,
      status = CASE
        WHEN indus_one.comp_off_credits.status IN ('expired', 'revoked', 'consumed')
          AND indus_one.comp_off_credits.remaining_amount <= 0
        THEN 'available'
        ELSE indus_one.comp_off_credits.status
      END,
      updated_at = now();
  ELSE
    PERFORM indus_one.comp_off_manual_deduct_amount(
      v_code, abs(v_delta), v_as_of, v_prefix
    );
  END IF;

  RETURN indus_one.get_comp_off_available_balance(v_code, v_as_of);
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.set_comp_off_available_balance(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.comp_off_manual_deduct_amount(text, numeric, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

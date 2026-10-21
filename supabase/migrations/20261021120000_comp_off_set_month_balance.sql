-- Admin C/O Balances: set remaining balance for a past (or current) calendar month.
-- Used to backfill months from the C/O cutoff through today. Manual credits for past
-- months keep a usable expiry (at least 2 months from today) so they show and can be used.

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

CREATE OR REPLACE FUNCTION indus_one.set_comp_off_month_balance(
  p_employee_code text,
  p_month_key text,
  p_target_remaining numeric,
  p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_mk text := btrim(coalesce(p_month_key, ''));
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cutoff date := indus_one.comp_off_cutoff_date();
  v_target numeric := greatest(coalesce(p_target_remaining, 0), 0);
  v_month_start date;
  v_month_end date;
  v_current numeric := 0;
  v_delta numeric := 0;
  v_prefix text;
  v_expiry date;
  v_earned date;
BEGIN
  IF NOT (SELECT public.current_user_has_attendance_admin_access()) THEN
    RAISE EXCEPTION 'Not authorized to adjust C/O balance'
      USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Employee code is required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_mk !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Select a valid month'
      USING ERRCODE = 'P0001';
  END IF;

  v_month_start := (v_mk || '-01')::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  IF v_month_end < v_cutoff THEN
    RAISE EXCEPTION 'C/O balances can only be set from % onward', to_char(v_cutoff, 'Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  IF v_month_start > date_trunc('month', v_as_of)::date THEN
    RAISE EXCEPTION 'Cannot set C/O balance for a future month'
      USING ERRCODE = 'P0001';
  END IF;

  -- Current remaining of credits earned in this month (include expired so we can reopen).
  SELECT coalesce(sum(
    CASE
      WHEN c.status = 'revoked' THEN 0::numeric
      ELSE c.remaining_amount
    END
  ), 0)
  INTO v_current
  FROM indus_one.comp_off_credits c
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= greatest(v_month_start, v_cutoff)
    AND c.earned_date <= v_month_end;

  v_delta := v_target - v_current;
  IF abs(v_delta) < 0.0001 THEN
    RETURN v_current;
  END IF;

  v_prefix := 'manual-month|' || v_code || '|' || v_mk;
  v_earned := least(v_month_end, v_as_of);
  IF v_earned < v_cutoff THEN
    v_earned := v_cutoff;
  END IF;
  -- Keep backfilled months usable at least as long as a credit earned today.
  v_expiry := greatest(
    indus_one.comp_off_expiry_for_earned(v_earned),
    indus_one.comp_off_expiry_for_earned(v_as_of)
  );

  IF v_delta > 0 THEN
    INSERT INTO indus_one.comp_off_credits (
      employee_code, earned_date, source_type, source_register_id, source_key,
      credit_amount, expiry_date, status
    )
    VALUES (
      v_code,
      v_earned,
      'manual',
      NULL,
      v_prefix || '|credit|' || gen_random_uuid()::text,
      v_delta,
      v_expiry,
      'available'
    )
    ON CONFLICT (employee_code, earned_date) DO UPDATE
    SET
      credit_amount = indus_one.comp_off_credits.credit_amount + excluded.credit_amount,
      expiry_date = greatest(indus_one.comp_off_credits.expiry_date, excluded.expiry_date),
      status = CASE
        WHEN indus_one.comp_off_credits.status IN ('expired', 'revoked', 'consumed')
          AND (indus_one.comp_off_credits.credit_amount + excluded.credit_amount
               - indus_one.comp_off_credits.consumed_amount) > 0
        THEN 'available'
        WHEN indus_one.comp_off_credits.consumed_amount > 0
          AND (indus_one.comp_off_credits.credit_amount + excluded.credit_amount
               - indus_one.comp_off_credits.consumed_amount) > 0
        THEN 'partial'
        ELSE indus_one.comp_off_credits.status
      END,
      updated_at = now();
  ELSE
    PERFORM indus_one.comp_off_manual_deduct_month_amount(
      v_code, abs(v_delta), greatest(v_month_start, v_cutoff), v_month_end, v_as_of, v_prefix
    );
  END IF;

  -- Reactivate any remaining credits in the month that were expired but now have life left.
  UPDATE indus_one.comp_off_credits c
  SET
    status = CASE WHEN c.consumed_amount > 0 THEN 'partial' ELSE 'available' END,
    expiry_date = greatest(c.expiry_date, v_expiry),
    updated_at = now()
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= greatest(v_month_start, v_cutoff)
    AND c.earned_date <= v_month_end
    AND c.status IN ('expired', 'available', 'partial')
    AND c.remaining_amount > 0
    AND c.expiry_date < v_as_of;

  SELECT coalesce(sum(
    CASE
      WHEN c.status IN ('revoked', 'expired', 'consumed') THEN 0::numeric
      WHEN c.expiry_date < v_as_of THEN 0::numeric
      ELSE c.remaining_amount
    END
  ), 0)
  INTO v_current
  FROM indus_one.comp_off_credits c
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= greatest(v_month_start, v_cutoff)
    AND c.earned_date <= v_month_end;

  RETURN v_current;
END;
$$;

COMMENT ON FUNCTION indus_one.set_comp_off_month_balance(text, text, numeric, text) IS
  'Admin: set remaining C/O for credits earned in a YYYY-MM month (past or current, from cutoff).';

GRANT EXECUTE ON FUNCTION indus_one.comp_off_manual_deduct_month_amount(text, numeric, date, date, date, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.set_comp_off_month_balance(text, text, numeric, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

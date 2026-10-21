-- Admin C/O Balances: allow setting remaining balance for any month Jan–Dec
-- in the current or a past calendar year (not only from the C/O cutoff).

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

  -- Full calendar year Jan–Dec for current or past years only.
  IF date_trunc('year', v_month_start)::date > date_trunc('year', v_as_of)::date THEN
    RAISE EXCEPTION 'Cannot set C/O balance for a future year'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(
    CASE
      WHEN c.status = 'revoked' THEN 0::numeric
      ELSE c.remaining_amount
    END
  ), 0)
  INTO v_current
  FROM indus_one.comp_off_credits c
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= v_month_start
    AND c.earned_date <= v_month_end;

  v_delta := v_target - v_current;
  IF abs(v_delta) < 0.0001 THEN
    RETURN v_current;
  END IF;

  v_prefix := 'manual-month|' || v_code || '|' || v_mk;
  -- Keep the credit inside the selected month so the Jan–Dec grid column updates.
  v_earned := least(v_month_end, greatest(v_month_start, v_as_of));
  IF v_earned > v_month_end THEN
    v_earned := v_month_end;
  END IF;
  IF v_earned < v_month_start THEN
    v_earned := v_month_start;
  END IF;

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
      v_code, abs(v_delta), v_month_start, v_month_end, v_as_of, v_prefix
    );
  END IF;

  UPDATE indus_one.comp_off_credits c
  SET
    status = CASE WHEN c.consumed_amount > 0 THEN 'partial' ELSE 'available' END,
    expiry_date = greatest(c.expiry_date, v_expiry),
    updated_at = now()
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= v_month_start
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
    AND c.earned_date >= v_month_start
    AND c.earned_date <= v_month_end;

  RETURN v_current;
END;
$$;

COMMENT ON FUNCTION indus_one.set_comp_off_month_balance(text, text, numeric, text) IS
  'Admin: set remaining C/O for credits earned in a YYYY-MM month (any Jan–Dec in current or past years).';

-- Year grid must include Jan–Dec (not only from the C/O cutoff).
CREATE OR REPLACE FUNCTION indus_one.fetch_comp_off_monthly_summary(p_year integer)
RETURNS TABLE (
  employee_code text,
  month_key text,
  earned numeric,
  used numeric,
  expired numeric,
  available numeric,
  remaining numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_current_mk text := to_char(v_as_of, 'YYYY-MM');
  v_year_start date := make_date(p_year, 1, 1);
  v_year_end date := make_date(p_year, 12, 31);
BEGIN
  RETURN QUERY
  WITH earned_agg AS (
    SELECT
      indus_one.comp_off_norm_emp(c.employee_code) AS emp,
      to_char(c.earned_date, 'YYYY-MM') AS mk,
      sum(c.credit_amount)::numeric AS earned
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_year_start
      AND c.earned_date <= v_year_end
      AND c.status <> 'revoked'
      AND indus_one.comp_off_norm_emp(c.employee_code) <> ''
    GROUP BY 1, 2
  ),
  used_agg AS (
    SELECT
      indus_one.comp_off_norm_emp(d.employee_code) AS emp,
      to_char(d.consumption_date, 'YYYY-MM') AS mk,
      sum(d.amount)::numeric AS used
    FROM indus_one.comp_off_deductions d
    WHERE d.entry_type = 'deduct'
      AND d.consumption_date >= v_year_start
      AND d.consumption_date <= v_year_end
      AND indus_one.comp_off_norm_emp(d.employee_code) <> ''
    GROUP BY 1, 2
  ),
  expired_agg AS (
    SELECT
      indus_one.comp_off_norm_emp(c.employee_code) AS emp,
      to_char(c.expiry_date, 'YYYY-MM') AS mk,
      sum(c.remaining_amount)::numeric AS expired
    FROM indus_one.comp_off_credits c
    WHERE c.status = 'expired'
      AND c.earned_date >= v_year_start
      AND c.earned_date <= v_year_end
      AND extract(year FROM c.expiry_date)::integer = p_year
      AND indus_one.comp_off_norm_emp(c.employee_code) <> ''
    GROUP BY 1, 2
  ),
  remaining_agg AS (
    SELECT
      indus_one.comp_off_norm_emp(c.employee_code) AS emp,
      to_char(c.earned_date, 'YYYY-MM') AS mk,
      sum(
        CASE
          WHEN c.status IN ('revoked', 'expired', 'consumed') THEN 0::numeric
          WHEN c.expiry_date < v_as_of THEN 0::numeric
          ELSE c.remaining_amount
        END
      )::numeric AS remaining
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_year_start
      AND c.earned_date <= v_year_end
      AND indus_one.comp_off_norm_emp(c.employee_code) <> ''
    GROUP BY 1, 2
  ),
  available_now AS (
    SELECT
      indus_one.comp_off_norm_emp(c.employee_code) AS emp,
      sum(c.remaining_amount)::numeric AS avail
    FROM indus_one.comp_off_credits c
    WHERE c.status IN ('available', 'partial')
      AND c.remaining_amount > 0
      AND c.expiry_date >= v_as_of
      AND indus_one.comp_off_norm_emp(c.employee_code) <> ''
    GROUP BY 1
  ),
  keys AS (
    SELECT emp, mk FROM earned_agg
    UNION
    SELECT emp, mk FROM used_agg
    UNION
    SELECT emp, mk FROM expired_agg
    UNION
    SELECT emp, mk FROM remaining_agg
    UNION
    SELECT emp, v_current_mk AS mk FROM available_now WHERE avail > 0
  )
  SELECT
    k.emp AS employee_code,
    k.mk AS month_key,
    coalesce(ea.earned, 0) AS earned,
    coalesce(ua.used, 0) AS used,
    coalesce(xa.expired, 0) AS expired,
    CASE
      WHEN k.mk = v_current_mk THEN coalesce(an.avail, 0)
      ELSE 0::numeric
    END AS available,
    coalesce(ra.remaining, 0) AS remaining
  FROM keys k
  LEFT JOIN earned_agg ea ON ea.emp = k.emp AND ea.mk = k.mk
  LEFT JOIN used_agg ua ON ua.emp = k.emp AND ua.mk = k.mk
  LEFT JOIN expired_agg xa ON xa.emp = k.emp AND xa.mk = k.mk
  LEFT JOIN remaining_agg ra ON ra.emp = k.emp AND ra.mk = k.mk
  LEFT JOIN available_now an ON an.emp = k.emp;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.fetch_comp_off_monthly_summary(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Fix C/O earn count logic (CREATE OR REPLACE / DROP FUNCTION only).
-- This migration does not UPDATE / DELETE / INSERT any existing table rows.
-- Self-contained: includes earning-day helpers so it works even if
-- 20260921120000 was not applied yet.
-- Gaps fixed going forward (and when C/O Balances UI calls reconcile):
-- 1) NH/PH overwrite of Present was revoking credit without re-earning while punch remains
-- 2) Punch matching used weak code match (missed some WO+punch rows)
-- 3) Summary/lookup group by normalized employee code (010572 vs 10572)
-- 4) Reconcile also walks punches on calendar weekoff / holiday days

-- Present marks that earn C/O
CREATE OR REPLACE FUNCTION indus_one.comp_off_is_present_mark(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.comp_off_normalize_mark(p_mark) IN ('P', 'P(OD)', 'HD');
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_third_saturday(p_date date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_date IS NOT NULL
    AND extract(dow FROM p_date) = 6
    AND (
      SELECT count(*)::integer
      FROM generate_series(
        date_trunc('month', p_date)::date,
        p_date,
        interval '1 day'
      ) AS d(day)
      WHERE extract(dow FROM d.day) = 6
    ) = 3;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_third_saturday_excluded_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_ifsp_employee_master m
    WHERE public.normalize_attendance_employee_code(m.employee_code)
        = public.normalize_attendance_employee_code(p_employee_code)
      AND lower(btrim(coalesce(m.department, ''))) IN (
        'production',
        'r&m',
        'm&m'
      )
  );
$$;

-- Prefer 3-arg earning day (employee-aware 3rd Saturday). Drop old 2-arg overload if present.
DROP FUNCTION IF EXISTS indus_one.comp_off_is_earning_day(date, text);

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_earning_day(
  p_date date,
  p_prior_mark text DEFAULT NULL,
  p_employee_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN p_date IS NULL THEN false
      WHEN indus_one.comp_off_normalize_mark(p_prior_mark) IN ('WO', 'NH/PH', 'NHPH') THEN true
      WHEN extract(dow FROM p_date) = 0 THEN true
      WHEN EXISTS (
        SELECT 1
        FROM public.admin_national_public_holidays h
        WHERE h.holiday_date = p_date
          AND h.holiday_type IN ('NH', 'PH')
      ) THEN true
      WHEN indus_one.comp_off_is_third_saturday(p_date)
        AND NOT indus_one.comp_off_third_saturday_excluded_employee(p_employee_code)
      THEN true
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_is_earning_calendar_day(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT indus_one.comp_off_is_earning_day(p_date, NULL, NULL);
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_norm_emp(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_attendance_employee_code(p_code);
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_codes_match(p_a text, p_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    indus_one.comp_off_norm_emp(p_a) <> ''
    AND indus_one.comp_off_norm_emp(p_a) = indus_one.comp_off_norm_emp(p_b);
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_employee_has_punch(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_attendance_punches p
    WHERE p.punch_date = p_date
      AND indus_one.comp_off_codes_match(p.employee_code, p_employee_code)
  );
$$;

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

CREATE OR REPLACE FUNCTION indus_one.comp_off_try_revoke_credit(
  p_employee_code text,
  p_earned_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
BEGIN
  IF v_code = '' OR p_earned_date IS NULL THEN RETURN; END IF;
  IF p_earned_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;

  UPDATE indus_one.comp_off_credits c
  SET status = 'revoked', updated_at = now()
  WHERE indus_one.comp_off_norm_emp(c.employee_code) = v_code
    AND c.earned_date = p_earned_date
    AND c.consumed_amount = 0
    AND c.status IN ('available', 'partial');
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.process_comp_off_register_change(
  p_employee_code text,
  p_register_date date,
  p_old_mark text,
  p_new_mark text,
  p_register_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_old text := indus_one.comp_off_normalize_mark(p_old_mark);
  v_new text := indus_one.comp_off_normalize_mark(p_new_mark);
  v_has_punch boolean := false;
BEGIN
  IF p_register_date IS NULL OR v_code = '' THEN RETURN; END IF;
  v_has_punch := indus_one.comp_off_employee_has_punch(v_code, p_register_date);

  -- Earn when Present / P(OD) / HD lands on WO, NH/PH, Sunday, or 3rd Saturday weekoff
  IF indus_one.comp_off_is_present_mark(v_new)
     AND indus_one.comp_off_is_earning_day(p_register_date, p_old_mark, v_code) THEN
    PERFORM indus_one.comp_off_try_earn_credit(
      v_code, p_register_date, p_register_id, v_new, p_old_mark
    );
  END IF;

  -- Punch still on WO / NH/PH cell (or calendar weekoff) counts as worked weekoff
  IF NOT indus_one.comp_off_is_present_mark(v_new)
     AND v_has_punch
     AND (
       v_new IN ('WO', 'NH/PH', 'NHPH')
       OR indus_one.comp_off_is_earning_day(p_register_date, NULL, v_code)
     ) THEN
    PERFORM indus_one.comp_off_try_earn_credit(
      v_code,
      p_register_date,
      p_register_id,
      'P',
      CASE WHEN v_new IN ('WO', 'NH/PH', 'NHPH') THEN v_new ELSE NULL END
    );
  END IF;

  -- Revoke only when present is cleared and the day is no longer a worked weekoff/holiday
  IF indus_one.comp_off_is_present_mark(v_old)
     AND NOT indus_one.comp_off_is_present_mark(v_new)
     AND indus_one.comp_off_is_earning_day(p_register_date, p_old_mark, v_code)
     AND NOT (
       v_has_punch
       AND (
         v_new IN ('WO', 'NH/PH', 'NHPH')
         OR indus_one.comp_off_is_earning_day(p_register_date, NULL, v_code)
       )
     ) THEN
    PERFORM indus_one.comp_off_try_revoke_credit(v_code, p_register_date);
  END IF;

  IF indus_one.comp_off_is_co_mark(v_new) AND NOT indus_one.comp_off_is_co_mark(v_old) THEN
    PERFORM indus_one.comp_off_deduct_for_co_mark(v_code, p_register_date, p_register_id);
  END IF;

  IF indus_one.comp_off_is_co_mark(v_old) AND NOT indus_one.comp_off_is_co_mark(v_new) THEN
    PERFORM indus_one.comp_off_restore_for_co_unmark(v_code, p_register_date, p_register_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.reconcile_comp_off_credits_from_register()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_cutoff date := indus_one.comp_off_cutoff_date();
  v_row record;
  v_count integer := 0;
  v_prior text;
  v_earn_mark text;
  v_code text;
  v_reg_id uuid;
BEGIN
  -- Pass 1: register rows (Present on weekoff/holiday, or WO/NH/PH with punch)
  FOR v_row IN
    SELECT
      r.id,
      r.employee_code,
      r.register_date,
      r.mark,
      indus_one.comp_off_normalize_mark(r.mark) AS mark_norm
    FROM public.admin_attendance_register r
    WHERE r.register_date >= v_cutoff
      AND coalesce(btrim(r.employee_code), '') <> ''
  LOOP
    v_code := indus_one.comp_off_norm_emp(v_row.employee_code);
    IF v_code = '' THEN CONTINUE; END IF;

    v_prior := NULL;
    v_earn_mark := NULL;

    IF indus_one.comp_off_is_present_mark(v_row.mark_norm)
       AND indus_one.comp_off_is_earning_day(v_row.register_date, NULL, v_code) THEN
      v_earn_mark := v_row.mark_norm;
      v_prior := NULL;
    ELSIF v_row.mark_norm IN ('WO', 'NH/PH', 'NHPH')
      AND indus_one.comp_off_employee_has_punch(v_code, v_row.register_date) THEN
      v_earn_mark := 'P';
      v_prior := v_row.mark_norm;
    END IF;

    IF v_earn_mark IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM indus_one.comp_off_try_earn_credit(
      v_code,
      v_row.register_date,
      v_row.id,
      v_earn_mark,
      v_prior
    );
    v_count := v_count + 1;
  END LOOP;

  -- Pass 2: punches on calendar weekoff / NH/PH days (covers missing register rows)
  FOR v_row IN
    SELECT DISTINCT
      indus_one.comp_off_norm_emp(p.employee_code) AS emp,
      p.punch_date AS punch_date
    FROM public.erp_attendance_punches p
    WHERE p.punch_date >= v_cutoff
      AND indus_one.comp_off_norm_emp(p.employee_code) <> ''
  LOOP
    IF NOT indus_one.comp_off_is_earning_day(v_row.punch_date, NULL, v_row.emp) THEN
      CONTINUE;
    END IF;

    SELECT r.id
    INTO v_reg_id
    FROM public.admin_attendance_register r
    WHERE r.register_date = v_row.punch_date
      AND indus_one.comp_off_codes_match(r.employee_code, v_row.emp)
    ORDER BY r.id DESC
    LIMIT 1;

    PERFORM indus_one.comp_off_try_earn_credit(
      v_row.emp,
      v_row.punch_date,
      v_reg_id,
      'P',
      NULL
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.reconcile_comp_off_credits_from_register() TO authenticated;

-- Summary fetch is read-only (no reconcile/expire on load — avoids timeout refresh loops).
-- Full definition also in 20260921150000_comp_off_balances_page_perf.sql
DROP FUNCTION IF EXISTS indus_one.fetch_comp_off_monthly_summary(integer);

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
  v_cutoff date := indus_one.comp_off_cutoff_date();
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_current_mk text := to_char(v_as_of, 'YYYY-MM');
BEGIN
  -- Read-only: do not reconcile or expire here (that caused statement timeouts + UI refresh loops).
  RETURN QUERY
  WITH earned_agg AS (
    SELECT
      indus_one.comp_off_norm_emp(c.employee_code) AS emp,
      to_char(c.earned_date, 'YYYY-MM') AS mk,
      sum(c.credit_amount)::numeric AS earned
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_cutoff
      AND extract(year FROM c.earned_date)::integer = p_year
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
      AND d.consumption_date >= v_cutoff
      AND extract(year FROM d.consumption_date)::integer = p_year
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
      AND c.earned_date >= v_cutoff
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
    WHERE c.earned_date >= v_cutoff
      AND extract(year FROM c.earned_date)::integer = p_year
      AND indus_one.comp_off_norm_emp(c.employee_code) <> ''
    GROUP BY 1, 2
  ),
  available_now AS (
    SELECT
      indus_one.comp_off_norm_emp(c.employee_code) AS emp,
      sum(c.remaining_amount)::numeric AS avail
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_cutoff
      AND c.status IN ('available', 'partial')
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

CREATE OR REPLACE FUNCTION indus_one.get_comp_off_available_balance(
  p_employee_code text,
  p_as_of date DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_code text := indus_one.comp_off_norm_emp(p_employee_code);
  v_total numeric := 0;
BEGIN
  IF v_code = '' THEN RETURN 0; END IF;
  SELECT coalesce(sum(c.remaining_amount), 0)
  INTO v_total
  FROM indus_one.comp_off_credits c
  WHERE indus_one.comp_off_norm_emp(c.employee_code) = v_code
    AND c.earned_date >= indus_one.comp_off_cutoff_date()
    AND c.status IN ('available', 'partial')
    AND c.remaining_amount > 0
    AND c.expiry_date >= v_as_of;
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.get_comp_off_available_balance(text, date) TO authenticated;

-- Reload PostgREST schema cache so RPCs are visible immediately
NOTIFY pgrst, 'reload schema';

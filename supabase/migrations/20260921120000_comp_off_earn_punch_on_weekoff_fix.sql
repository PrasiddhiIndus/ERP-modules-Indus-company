-- C/O earn fix: punch / P(OD) / HD on WO or NH/PH (and Sunday / 3rd Saturday weekoff) → +1.
-- Also reconciles missed credits from the register (e.g. P written before WO, or HD ignored).

-- Present marks that earn C/O (biometric punch may store HD on weekoff).
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

-- Production / R&M / M&M work 3rd Saturday — no auto weekoff / no C/O for that day alone.
CREATE OR REPLACE FUNCTION indus_one.comp_off_third_saturday_excluded_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_ifsp_employee_master m
    WHERE upper(btrim(coalesce(m.employee_code, ''))) = upper(btrim(coalesce(p_employee_code, '')))
      AND lower(btrim(coalesce(m.department, ''))) IN (
        'production',
        'r&m',
        'm&m'
      )
  );
$$;

-- Drop 2-arg overload so callers use the employee-aware version.
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
      -- Worked over an existing weekoff / holiday mark
      WHEN indus_one.comp_off_normalize_mark(p_prior_mark) IN ('WO', 'NH/PH', 'NHPH') THEN true
      -- Sunday always
      WHEN extract(dow FROM p_date) = 0 THEN true
      -- Configured NH/PH calendar day
      WHEN EXISTS (
        SELECT 1
        FROM public.admin_national_public_holidays h
        WHERE h.holiday_date = p_date
          AND h.holiday_type IN ('NH', 'PH')
      ) THEN true
      -- 3rd Saturday weekoff (except Production / R&M / M&M)
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
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
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
    status = CASE
      WHEN indus_one.comp_off_credits.status = 'revoked'
        AND indus_one.comp_off_credits.consumed_amount = 0
      THEN 'available'
      ELSE indus_one.comp_off_credits.status
    END,
    updated_at = now();
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
  v_old text := indus_one.comp_off_normalize_mark(p_old_mark);
  v_new text := indus_one.comp_off_normalize_mark(p_new_mark);
BEGIN
  IF p_register_date IS NULL THEN RETURN; END IF;

  -- Earn when Present / P(OD) / HD on WO, NH/PH, Sunday, or 3rd Saturday weekoff
  IF indus_one.comp_off_is_present_mark(v_new)
     AND indus_one.comp_off_is_earning_day(p_register_date, p_old_mark, p_employee_code) THEN
    PERFORM indus_one.comp_off_try_earn_credit(
      p_employee_code, p_register_date, p_register_id, v_new, p_old_mark
    );
  END IF;

  IF indus_one.comp_off_is_present_mark(v_old)
     AND NOT indus_one.comp_off_is_present_mark(v_new)
     AND indus_one.comp_off_is_earning_day(p_register_date, p_old_mark, p_employee_code) THEN
    PERFORM indus_one.comp_off_try_revoke_credit(p_employee_code, p_register_date);
  END IF;

  IF indus_one.comp_off_is_co_mark(v_new) AND NOT indus_one.comp_off_is_co_mark(v_old) THEN
    PERFORM indus_one.comp_off_deduct_for_co_mark(p_employee_code, p_register_date, p_register_id);
  END IF;

  IF indus_one.comp_off_is_co_mark(v_old) AND NOT indus_one.comp_off_is_co_mark(v_new) THEN
    PERFORM indus_one.comp_off_restore_for_co_unmark(p_employee_code, p_register_date, p_register_id);
  END IF;
END;
$$;

-- Repair missed C/O: present marks on earning calendar days, and punches still sitting on WO/NH/PH cells.
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
BEGIN
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
    v_prior := NULL;
    v_earn_mark := NULL;

    IF indus_one.comp_off_is_present_mark(v_row.mark_norm)
       AND indus_one.comp_off_is_earning_day(v_row.register_date, NULL, v_row.employee_code) THEN
      -- Present / HD / P(OD) on Sunday, NH/PH calendar, or 3rd Saturday weekoff
      v_earn_mark := v_row.mark_norm;
      v_prior := NULL;
    ELSIF v_row.mark_norm IN ('WO', 'NH/PH', 'NHPH')
      AND EXISTS (
        SELECT 1
        FROM public.erp_attendance_punches p
        WHERE p.punch_date = v_row.register_date
          AND (
            upper(btrim(p.employee_code)) = upper(btrim(v_row.employee_code))
            OR nullif(ltrim(btrim(p.employee_code), '0'), '')
              = nullif(ltrim(btrim(v_row.employee_code), '0'), '')
          )
      ) THEN
      -- Punch exists but cell still WO/NH/PH — count as worked weekoff
      v_earn_mark := 'P';
      v_prior := v_row.mark_norm;
    END IF;

    IF v_earn_mark IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM indus_one.comp_off_try_earn_credit(
      v_row.employee_code,
      v_row.register_date,
      v_row.id,
      v_earn_mark,
      v_prior
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.reconcile_comp_off_credits_from_register() TO authenticated;

-- Run once on migrate, and again whenever monthly summary is loaded.
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
VOLATILE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_cutoff date := indus_one.comp_off_cutoff_date();
  v_cutoff_year integer := extract(year FROM v_cutoff)::integer;
  v_cutoff_month integer := extract(month FROM v_cutoff)::integer;
  v_as_of date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM indus_one.reconcile_comp_off_credits_from_register();
  PERFORM indus_one.expire_comp_off_credits(v_as_of);

  RETURN QUERY
  WITH months AS (
    SELECT to_char(make_date(p_year, m, 1), 'YYYY-MM') AS mk, m AS mon
    FROM generate_series(1, 12) AS m
    WHERE p_year > v_cutoff_year OR (p_year = v_cutoff_year AND m >= v_cutoff_month)
  ),
  employees AS (
    SELECT DISTINCT upper(btrim(c.employee_code)) AS emp
    FROM indus_one.comp_off_credits c
    WHERE extract(year FROM c.earned_date)::integer = p_year
      AND c.earned_date >= v_cutoff
    UNION
    SELECT DISTINCT upper(btrim(d.employee_code)) AS emp
    FROM indus_one.comp_off_deductions d
    WHERE extract(year FROM d.consumption_date)::integer = p_year
      AND d.consumption_date >= v_cutoff
    UNION
    SELECT upper(btrim(m.employee_code)) AS emp
    FROM public.admin_ifsp_employee_master m
    WHERE coalesce(m.employee_code, '') <> ''
  ),
  grid AS (
    SELECT e.emp, mo.mk, mo.mon
    FROM employees e
    CROSS JOIN months mo
  ),
  earned_agg AS (
    SELECT
      upper(btrim(c.employee_code)) AS emp,
      to_char(c.earned_date, 'YYYY-MM') AS mk,
      sum(c.credit_amount)::numeric AS earned
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_cutoff
      AND extract(year FROM c.earned_date)::integer = p_year
      AND c.status <> 'revoked'
    GROUP BY 1, 2
  ),
  used_agg AS (
    SELECT
      upper(btrim(d.employee_code)) AS emp,
      to_char(d.consumption_date, 'YYYY-MM') AS mk,
      sum(d.amount)::numeric AS used
    FROM indus_one.comp_off_deductions d
    WHERE d.entry_type = 'deduct'
      AND d.consumption_date >= v_cutoff
      AND extract(year FROM d.consumption_date)::integer = p_year
    GROUP BY 1, 2
  ),
  expired_agg AS (
    SELECT
      upper(btrim(c.employee_code)) AS emp,
      to_char(c.expiry_date, 'YYYY-MM') AS mk,
      sum(c.remaining_amount)::numeric AS expired
    FROM indus_one.comp_off_credits c
    WHERE c.status = 'expired'
      AND c.earned_date >= v_cutoff
      AND extract(year FROM c.expiry_date)::integer = p_year
    GROUP BY 1, 2
  ),
  remaining_agg AS (
    SELECT
      upper(btrim(c.employee_code)) AS emp,
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
    GROUP BY 1, 2
  ),
  available_now AS (
    SELECT
      upper(btrim(c.employee_code)) AS emp,
      sum(c.remaining_amount)::numeric AS avail
    FROM indus_one.comp_off_credits c
    WHERE c.earned_date >= v_cutoff
      AND c.status IN ('available', 'partial')
      AND c.remaining_amount > 0
      AND c.expiry_date >= v_as_of
    GROUP BY 1
  )
  SELECT
    g.emp AS employee_code,
    g.mk AS month_key,
    coalesce(ea.earned, 0) AS earned,
    coalesce(ua.used, 0) AS used,
    coalesce(xa.expired, 0) AS expired,
    CASE
      WHEN g.mk = to_char(v_as_of, 'YYYY-MM') THEN coalesce(an.avail, 0)
      ELSE 0::numeric
    END AS available,
    coalesce(ra.remaining, 0) AS remaining
  FROM grid g
  LEFT JOIN earned_agg ea ON ea.emp = g.emp AND ea.mk = g.mk
  LEFT JOIN used_agg ua ON ua.emp = g.emp AND ua.mk = g.mk
  LEFT JOIN expired_agg xa ON xa.emp = g.emp AND xa.mk = g.mk
  LEFT JOIN remaining_agg ra ON ra.emp = g.emp AND ra.mk = g.mk
  LEFT JOIN available_now an ON an.emp = g.emp
  WHERE coalesce(ea.earned, 0) > 0
     OR coalesce(ua.used, 0) > 0
     OR coalesce(xa.expired, 0) > 0
     OR coalesce(ra.remaining, 0) > 0
     OR (g.mk = to_char(v_as_of, 'YYYY-MM') AND coalesce(an.avail, 0) > 0)
  ORDER BY g.emp, g.mk;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.fetch_comp_off_monthly_summary(integer) TO authenticated;

-- One-shot repair for environments that already have the ledger.
SELECT indus_one.reconcile_comp_off_credits_from_register();

-- Fix C/O: (1) restore after clearing CO must not insert dead register_id (FK 23503).
-- (2) monthly summary returns remaining-by-earned-month so marking CO reduces that month's value.

CREATE OR REPLACE FUNCTION indus_one.comp_off_restore_for_co_unmark(
  p_employee_code text,
  p_consumption_date date,
  p_register_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_deduct_key text;
  v_restore_key text;
  v_deduct indus_one.comp_off_deductions%ROWTYPE;
  v_reg_id uuid := p_register_id;
BEGIN
  IF v_code = '' OR p_consumption_date IS NULL THEN RETURN; END IF;
  IF p_consumption_date < indus_one.comp_off_cutoff_date() THEN RETURN; END IF;

  -- Lookup keys still use the original register id (even if the row was just deleted).
  v_deduct_key := coalesce(p_register_id::text, v_code || '|' || p_consumption_date::text) || ':deduct';
  v_restore_key := coalesce(p_register_id::text, v_code || '|' || p_consumption_date::text) || ':restore';

  IF EXISTS (SELECT 1 FROM indus_one.comp_off_deductions d WHERE d.idempotency_key = v_restore_key) THEN
    RETURN;
  END IF;

  SELECT * INTO v_deduct
  FROM indus_one.comp_off_deductions d
  WHERE d.idempotency_key = v_deduct_key
    AND d.entry_type = 'deduct'
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE indus_one.comp_off_credits
  SET consumed_amount = greatest(consumed_amount - v_deduct.amount, 0), updated_at = now()
  WHERE id = v_deduct.credit_id;

  -- Clearing CO deletes the register row (AFTER DELETE trigger). Inserting the
  -- restore row with that deleted id violates register_id FK (23503).
  IF v_reg_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.admin_attendance_register r WHERE r.id = v_reg_id
  ) THEN
    v_reg_id := NULL;
  END IF;

  INSERT INTO indus_one.comp_off_deductions (
    employee_code, consumption_date, register_id, credit_id, amount, entry_type, idempotency_key
  )
  VALUES (
    v_code, p_consumption_date, v_reg_id, v_deduct.credit_id, v_deduct.amount, 'restore', v_restore_key
  );

  PERFORM indus_one.comp_off_refresh_credit_status(v_deduct.credit_id);
END;
$$;

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
  -- Remaining usable amount of credits earned in that month (drops when CO consumes them).
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

GRANT EXECUTE ON FUNCTION indus_one.comp_off_restore_for_co_unmark(text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.fetch_comp_off_monthly_summary(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

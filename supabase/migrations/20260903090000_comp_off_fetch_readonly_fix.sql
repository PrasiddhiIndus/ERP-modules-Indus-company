-- Fix: fetch_comp_off_monthly_summary / get_comp_off_available_balance were STABLE
-- but called expire_comp_off_credits (UPDATE). PostgREST runs STABLE RPCs in a
-- read-only transaction → "cannot execute UPDATE in a read-only transaction" / 405.

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
  v_code text := upper(btrim(coalesce(p_employee_code, '')));
  v_total numeric := 0;
BEGIN
  -- Read-only: filter by expiry_date instead of UPDATE.
  IF v_code = '' THEN RETURN 0; END IF;
  SELECT coalesce(sum(c.remaining_amount), 0)
  INTO v_total
  FROM indus_one.comp_off_credits c
  WHERE upper(btrim(c.employee_code)) = v_code
    AND c.earned_date >= indus_one.comp_off_cutoff_date()
    AND c.status IN ('available', 'partial')
    AND c.remaining_amount > 0
    AND c.expiry_date >= v_as_of;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.fetch_comp_off_monthly_summary(p_year integer)
RETURNS TABLE (
  employee_code text,
  month_key text,
  earned numeric,
  used numeric,
  expired numeric,
  available numeric
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
    END AS available
  FROM grid g
  LEFT JOIN earned_agg ea ON ea.emp = g.emp AND ea.mk = g.mk
  LEFT JOIN used_agg ua ON ua.emp = g.emp AND ua.mk = g.mk
  LEFT JOIN expired_agg xa ON xa.emp = g.emp AND xa.mk = g.mk
  LEFT JOIN available_now an ON an.emp = g.emp
  WHERE coalesce(ea.earned, 0) > 0
     OR coalesce(ua.used, 0) > 0
     OR coalesce(xa.expired, 0) > 0
     OR (g.mk = to_char(v_as_of, 'YYYY-MM') AND coalesce(an.avail, 0) > 0)
  ORDER BY g.emp, g.mk;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.get_comp_off_available_balance(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.fetch_comp_off_monthly_summary(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

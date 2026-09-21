-- C/O Balances page perf: fetch must be read-only.
-- Calling reconcile/expire on every load wrote credits → realtime → reload → timeout loop.
-- No table data backfill. Function definitions only.

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

NOTIFY pgrst, 'reload schema';

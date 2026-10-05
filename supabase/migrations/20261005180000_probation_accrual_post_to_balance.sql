-- Probation monthly CL/SL accrual → actually credit the employee's leave balance.
--
-- Before: run_probation_leave_month_start_accrual() only wrote rows to
-- probation_leave_monthly_accruals; the yearly balance (opening − used) shown on every
-- leave screen and used by the Indus One app never changed.
--
-- Now each accrual row is posted once into employee_leave_balances_yearly:
--   opening_cl / opening_sl += amount, unused_* = opening − used.
-- posted_to_balance marks rows already credited, so re-runs never double-credit.
-- Existing unposted rows (e.g. October 2026) are posted when this migration runs.

ALTER TABLE indus_one.probation_leave_monthly_accruals
  ADD COLUMN IF NOT EXISTS posted_to_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_probation_leave_accruals_unposted
  ON indus_one.probation_leave_monthly_accruals (accrual_month)
  WHERE NOT posted_to_balance;

-- ---------------------------------------------------------------------------
-- Post every unposted accrual row into the yearly balance (idempotent).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.post_probation_leave_accruals_to_balance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  r record;
  v_year int;
  v_cl numeric;
  v_sl numeric;
  v_posted int := 0;
  v_updated int;
BEGIN
  FOR r IN
    SELECT
      a.employee_code,
      extract(year FROM a.accrual_month)::int AS yr,
      sum(a.amount) FILTER (WHERE a.leave_type = 'CL') AS cl,
      sum(a.amount) FILTER (WHERE a.leave_type = 'SL') AS sl,
      array_agg(a.id) AS ids
    FROM indus_one.probation_leave_monthly_accruals a
    WHERE NOT a.posted_to_balance
    GROUP BY a.employee_code, extract(year FROM a.accrual_month)
  LOOP
    v_year := r.yr;
    v_cl := coalesce(r.cl, 0);
    v_sl := coalesce(r.sl, 0);

    UPDATE indus_one.employee_leave_balances_yearly b
    SET opening_cl = coalesce(b.opening_cl, 0) + v_cl,
        opening_sl = coalesce(b.opening_sl, 0) + v_sl,
        unused_cl = GREATEST(0, coalesce(b.opening_cl, 0) + v_cl - coalesce(b.used_cl, 0)),
        unused_sl = GREATEST(0, coalesce(b.opening_sl, 0) + v_sl - coalesce(b.used_sl, 0)),
        processed_at = now()
    WHERE b.year = v_year
      AND public.norm_emp_code(b.employee_code) = public.norm_emp_code(r.employee_code);
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      INSERT INTO indus_one.employee_leave_balances_yearly (
        employee_code, year, opening_cl, opening_sl, unused_cl, unused_sl, processed_at
      )
      VALUES (r.employee_code, v_year, v_cl, v_sl, v_cl, v_sl, now())
      ON CONFLICT (employee_code, year) DO UPDATE SET
        opening_cl = coalesce(indus_one.employee_leave_balances_yearly.opening_cl, 0) + v_cl,
        opening_sl = coalesce(indus_one.employee_leave_balances_yearly.opening_sl, 0) + v_sl,
        unused_cl = GREATEST(0, coalesce(indus_one.employee_leave_balances_yearly.opening_cl, 0) + v_cl
          - coalesce(indus_one.employee_leave_balances_yearly.used_cl, 0)),
        unused_sl = GREATEST(0, coalesce(indus_one.employee_leave_balances_yearly.opening_sl, 0) + v_sl
          - coalesce(indus_one.employee_leave_balances_yearly.used_sl, 0)),
        processed_at = now();
    END IF;

    UPDATE indus_one.probation_leave_monthly_accruals
    SET posted_to_balance = true, posted_at = now()
    WHERE id = ANY (r.ids);

    v_posted := v_posted + cardinality(r.ids);
  END LOOP;

  RETURN v_posted;
END;
$$;

REVOKE ALL ON FUNCTION indus_one.post_probation_leave_accruals_to_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION indus_one.post_probation_leave_accruals_to_balance() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Month-start accrual: same eligibility as before, then post to balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.run_probation_leave_month_start_accrual(
  p_as_of date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
DECLARE
  v_as_of date := coalesce(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_month date := date_trunc('month', v_as_of)::date;
  v_cutoff date;
  v_inserted int := 0;
BEGIN
  SELECT s.first_eligible_month
  INTO v_cutoff
  FROM indus_one.probation_leave_accrual_settings s
  WHERE s.id = 1;

  IF v_cutoff IS NOT NULL AND v_month >= v_cutoff THEN
    INSERT INTO indus_one.probation_leave_monthly_accruals (
      employee_code, leave_type, accrual_month, amount, employment_type_snapshot
    )
    SELECT
      upper(btrim(m.employee_code)),
      lt.leave_type,
      v_month,
      1,
      m.employment_type
    FROM public.admin_ifsp_employee_master m
    CROSS JOIN (VALUES ('CL'::text), ('SL'::text)) AS lt(leave_type)
    WHERE coalesce(m.status, '') = 'Active'
      AND btrim(coalesce(m.employee_code, '')) <> ''
      AND indus_one.is_probation_employment_type(m.employment_type)
      AND (
        m.date_of_joining IS NULL
        OR date_trunc('month', m.date_of_joining)::date <= v_month
      )
    ON CONFLICT (employee_code, leave_type, accrual_month) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  PERFORM indus_one.post_probation_leave_accruals_to_balance();
  RETURN v_inserted;
END;
$$;

-- App adds only not-yet-posted accruals on top of the stored balance.
CREATE OR REPLACE FUNCTION indus_one.fetch_probation_leave_accruals(p_year integer)
RETURNS TABLE (
  employee_code text,
  leave_type text,
  accrual_month date,
  amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
AS $$
  SELECT
    a.employee_code,
    a.leave_type,
    a.accrual_month,
    a.amount
  FROM indus_one.probation_leave_monthly_accruals a
  WHERE extract(year FROM a.accrual_month)::integer = p_year
    AND NOT a.posted_to_balance
  ORDER BY a.employee_code, a.accrual_month, a.leave_type;
$$;

-- Credit rows already accrued (October 2026 onwards) right away.
SELECT indus_one.post_probation_leave_accruals_to_balance();

NOTIFY pgrst, 'reload schema';

-- Probation monthly leave accrual (CL + SL): accrue +1 each when a month starts.
-- Does not modify employee_leave_balances_yearly opening/used/entitlement/carry columns.
-- No backfill: only months on/after first_eligible_month (next calendar month at install).

-- ---------------------------------------------------------------------------
-- Settings (frozen cutoff — never accrue before this month)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indus_one.probation_leave_accrual_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  first_eligible_month date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO indus_one.probation_leave_accrual_settings (id, first_eligible_month)
VALUES (
  1,
  (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) + interval '1 month')::date
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE indus_one.probation_leave_accrual_settings IS
  'first_eligible_month = earliest month that may receive probation CL/SL accrual (no backfill).';

-- ---------------------------------------------------------------------------
-- Month-wise accrual ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indus_one.probation_leave_monthly_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('CL', 'SL')),
  accrual_month date NOT NULL,
  amount numeric(8, 2) NOT NULL DEFAULT 1 CHECK (amount > 0),
  employment_type_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT probation_leave_monthly_accruals_unique
    UNIQUE (employee_code, leave_type, accrual_month),
  CONSTRAINT probation_leave_monthly_accruals_month_first
    CHECK (accrual_month = date_trunc('month', accrual_month)::date)
);

CREATE INDEX IF NOT EXISTS idx_probation_leave_accruals_emp_month
  ON indus_one.probation_leave_monthly_accruals (employee_code, accrual_month);

CREATE INDEX IF NOT EXISTS idx_probation_leave_accruals_month
  ON indus_one.probation_leave_monthly_accruals (accrual_month);

COMMENT ON TABLE indus_one.probation_leave_monthly_accruals IS
  'Additive probation CL/SL credits by calendar month. Idempotent per employee/type/month.';

ALTER TABLE indus_one.probation_leave_monthly_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.probation_leave_accrual_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS probation_leave_accruals_select ON indus_one.probation_leave_monthly_accruals;
CREATE POLICY probation_leave_accruals_select ON indus_one.probation_leave_monthly_accruals
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_has_attendance_admin_access())
    OR upper(btrim(employee_code)) = upper(btrim(coalesce(public.current_user_employee_code(), '')))
  );

DROP POLICY IF EXISTS probation_leave_accrual_settings_select ON indus_one.probation_leave_accrual_settings;
CREATE POLICY probation_leave_accrual_settings_select ON indus_one.probation_leave_accrual_settings
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON indus_one.probation_leave_monthly_accruals TO authenticated;
GRANT SELECT ON indus_one.probation_leave_accrual_settings TO authenticated;
GRANT ALL ON indus_one.probation_leave_monthly_accruals TO service_role;
GRANT ALL ON indus_one.probation_leave_accrual_settings TO service_role;

-- ---------------------------------------------------------------------------
-- Accrue for the calendar month of p_as_of (month-start job). Idempotent.
-- Skips months before first_eligible_month. Only Active + Probation employees.
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
  v_n int;
BEGIN
  SELECT s.first_eligible_month
  INTO v_cutoff
  FROM indus_one.probation_leave_accrual_settings s
  WHERE s.id = 1;

  IF v_cutoff IS NULL THEN
    RETURN 0;
  END IF;

  -- Never backfill months before the configured first eligible month.
  IF v_month < v_cutoff THEN
    RETURN 0;
  END IF;

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

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_inserted := v_n;
  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fetch accruals for a year (for available-balance enrichment)
-- ---------------------------------------------------------------------------
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
  ORDER BY a.employee_code, a.accrual_month, a.leave_type;
$$;

GRANT EXECUTE ON FUNCTION indus_one.run_probation_leave_month_start_accrual(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.fetch_probation_leave_accruals(integer) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('probation-leave-month-start-accrual');
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    -- 00:00 UTC on the 1st ≈ 05:30 IST — accrues for that calendar month in Asia/Kolkata.
    PERFORM cron.schedule(
      'probation-leave-month-start-accrual',
      '0 0 1 * *',
      $cron$SELECT indus_one.run_probation_leave_month_start_accrual((now() AT TIME ZONE 'Asia/Kolkata')::date);$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'probation leave accrual cron skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE indus_one.probation_leave_monthly_accruals;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

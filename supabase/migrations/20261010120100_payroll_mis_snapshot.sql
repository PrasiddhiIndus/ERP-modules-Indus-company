-- =============================================================================
-- Payroll MIS reports — lock snapshot, statutory payments, report functions.
--
-- Additive only. The existing lock function, guards, lines and runs are not
-- changed. A new AFTER trigger on admin_salary_month_runs fires only when a
-- processed run goes from unlocked to locked. Its work runs inside its own
-- exception block: any failure is written to admin_payroll_mis_job_log and the
-- lock still succeeds. Re-locking replaces that month's snapshot and upserts
-- statutory payment rows on (wage_month, statute, state).
--
-- Employer-side proration (approved): f = paid days ÷ total days of the line,
-- 0 when total days is 0, never above 1.
--   er_pf             = f × employer PF monthly   (line CTC breakdown, else CTC record)
--   er_esi            = f × employer ESIC monthly (line CTC breakdown, else CTC record)
--   er_lwf            = 0 (payroll has no LWF yet)
--   gratuity_prov     = f × gratuity monthly
--   bonus_prov        = f × (ex-gratia + bonus + special performance bonus) monthly
--   leave_encash_prov = f × leave encashment monthly
--   insurance         = premium master for the month split equally across employees whose CTC
--                       record has a mediclaim amount (not prorated); otherwise f × mediclaim monthly
-- Statutory bonus and performance incentive are already inside gross and are not repeated.
--
-- Rollback: supabase/rollbacks/20261010120100_payroll_mis_snapshot_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Snapshot table (one row per employee line of a locked run)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_mis_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  month_key text NOT NULL,
  employee_master_id bigint NOT NULL,
  employee_code text,
  employee_name text,
  designation text,
  uan_no text,
  esic_no text,

  vertical_code text,
  department text,
  grade text,
  location text,
  cost_centre text,
  employment_type text,
  position_type text,
  work_state text,
  date_of_joining date,
  date_of_exit date,
  exit_reason text,

  paid_days numeric(8,2) NOT NULL DEFAULT 0,
  total_days numeric(8,2) NOT NULL DEFAULT 0,
  lop_days numeric(8,2) NOT NULL DEFAULT 0,
  proration_factor numeric(12,8) NOT NULL DEFAULT 0,

  gross numeric(14,2) NOT NULL DEFAULT 0,
  fixed_full numeric(14,2) NOT NULL DEFAULT 0,
  fixed_earned numeric(14,2) NOT NULL DEFAULT 0,
  incentive numeric(14,2) NOT NULL DEFAULT 0,
  ot_amount numeric(14,2) NOT NULL DEFAULT 0,
  arrears numeric(14,2) NOT NULL DEFAULT 0,

  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  emp_pf numeric(14,2) NOT NULL DEFAULT 0,
  emp_esic numeric(14,2) NOT NULL DEFAULT 0,
  pt numeric(14,2) NOT NULL DEFAULT 0,
  ee_lwf numeric(14,2) NOT NULL DEFAULT 0,
  tds numeric(14,2) NOT NULL DEFAULT 0,
  loan numeric(14,2) NOT NULL DEFAULT 0,
  salary_advance numeric(14,2) NOT NULL DEFAULT 0,
  unpaid_paid numeric(14,2) NOT NULL DEFAULT 0,
  pf_wage numeric(14,2) NOT NULL DEFAULT 0,
  esi_wage numeric(14,2) NOT NULL DEFAULT 0,

  er_pf numeric(14,2) NOT NULL DEFAULT 0,
  er_esi numeric(14,2) NOT NULL DEFAULT 0,
  er_lwf numeric(14,2) NOT NULL DEFAULT 0,
  gratuity_prov numeric(14,2) NOT NULL DEFAULT 0,
  bonus_prov numeric(14,2) NOT NULL DEFAULT 0,
  leave_encash_prov numeric(14,2) NOT NULL DEFAULT 0,
  insurance numeric(14,2) NOT NULL DEFAULT 0,
  insurance_source text NOT NULL DEFAULT 'ctc',
  ctc_mediclaim_monthly numeric(14,2) NOT NULL DEFAULT 0,
  ctc_monthly numeric(14,2),

  employer_statutory numeric(14,2) GENERATED ALWAYS AS (er_pf + er_esi + er_lwf) STORED,
  employer_cost numeric(14,2) GENERATED ALWAYS AS
    (er_pf + er_esi + er_lwf + gratuity_prov + bonus_prov + leave_encash_prov + insurance) STORED,
  total_ctc numeric(14,2) GENERATED ALWAYS AS
    (gross + er_pf + er_esi + er_lwf + gratuity_prov + bonus_prov + leave_encash_prov + insurance) STORED,

  ctc_revised_in_month boolean NOT NULL DEFAULT false,
  ctc_revision_type text,
  ctc_wef_date date,

  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_mis_snapshot_unique UNIQUE (month_key, employee_master_id)
);
CREATE INDEX IF NOT EXISTS admin_payroll_mis_snapshot_run ON public.admin_payroll_mis_snapshot (run_id);
CREATE INDEX IF NOT EXISTS admin_payroll_mis_snapshot_month ON public.admin_payroll_mis_snapshot (month_key);

-- ---------------------------------------------------------------------------
-- Statutory payments (Report 7)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_payroll_statutory_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wage_month text NOT NULL CHECK (wage_month ~ '^\d{4}-\d{2}$'),
  statute text NOT NULL CHECK (statute IN ('PF', 'ESI', 'PT', 'LWF', 'TDS')),
  state text NOT NULL DEFAULT 'ALL',
  run_id uuid,
  amount numeric(16,2) NOT NULL DEFAULT 0,
  due_date date,
  paid_on date,
  challan_ref text,
  interest numeric(14,2) NOT NULL DEFAULT 0,
  penalty numeric(14,2) NOT NULL DEFAULT 0,
  challan_path text,
  amount_changed_after_payment boolean NOT NULL DEFAULT false,
  note text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_payroll_statutory_payments_unique UNIQUE (wage_month, statute, state),
  CONSTRAINT admin_payroll_statutory_payments_paid_needs_challan
    CHECK (paid_on IS NULL OR nullif(btrim(coalesce(challan_ref, '')), '') IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- Due date from the compliance calendar (state row wins over 'ALL')
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_due_date(p_statute text, p_state text, p_wage_month text)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  v_wage date := to_date(p_wage_month || '-01', 'YYYY-MM-DD');
  v_month date;
  v_last integer;
BEGIN
  SELECT * INTO c
  FROM public.admin_payroll_compliance_calendar k
  WHERE k.statute = p_statute AND k.state IN (coalesce(p_state, 'ALL'), 'ALL')
  ORDER BY (k.state = 'ALL')
  LIMIT 1;
  IF c.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF c.months_applicable IS NOT NULL
     AND NOT (extract(month FROM v_wage)::int = ANY (c.months_applicable)) THEN
    RETURN NULL;
  END IF;
  v_month := (v_wage + make_interval(months => c.month_offset))::date;
  v_last := extract(day FROM (date_trunc('month', v_month) + interval '1 month - 1 day'))::int;
  RETURN make_date(extract(year FROM v_month)::int, extract(month FROM v_month)::int, least(c.day_of_month, v_last));
END;
$$;

-- ---------------------------------------------------------------------------
-- Statutory payment rows for a locked month (upsert; never duplicates)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_sync_statutory_payments(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text;
  v_count integer := 0;
BEGIN
  SELECT month_key INTO v_month FROM public.admin_salary_month_runs WHERE id = p_run_id;
  IF v_month IS NULL THEN
    RETURN 0;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _mis_deposit (statute text, state text, amount numeric) ON COMMIT DROP;
  TRUNCATE _mis_deposit;
  INSERT INTO _mis_deposit (statute, state, amount)
  SELECT v.statute, s.state, round(sum(v.amount), 2)
  FROM (
    SELECT coalesce(nullif(btrim(work_state), ''), 'ALL') AS state, emp_pf, er_pf, emp_esic, er_esi, pt, ee_lwf, er_lwf, tds
    FROM public.admin_payroll_mis_snapshot
    WHERE month_key = v_month
  ) s
  CROSS JOIN LATERAL (VALUES
    ('PF', s.emp_pf + s.er_pf),
    ('ESI', s.emp_esic + s.er_esi),
    ('PT', s.pt),
    ('LWF', s.ee_lwf + s.er_lwf),
    ('TDS', s.tds)
  ) AS v(statute, amount)
  GROUP BY v.statute, s.state;

  INSERT INTO public.admin_payroll_statutory_payments (wage_month, statute, state, run_id, amount, due_date)
  SELECT v_month, d.statute, d.state, p_run_id, d.amount, public.admin_payroll_mis_due_date(d.statute, d.state, v_month)
  FROM _mis_deposit d
  WHERE d.amount > 0
  ON CONFLICT (wage_month, statute, state) DO UPDATE SET
    run_id = EXCLUDED.run_id,
    amount_changed_after_payment = public.admin_payroll_statutory_payments.amount_changed_after_payment
      OR (public.admin_payroll_statutory_payments.paid_on IS NOT NULL
          AND public.admin_payroll_statutory_payments.amount <> EXCLUDED.amount),
    amount = EXCLUDED.amount,
    due_date = CASE WHEN public.admin_payroll_statutory_payments.paid_on IS NULL
                    THEN EXCLUDED.due_date ELSE public.admin_payroll_statutory_payments.due_date END,
    updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- A statute that no longer has an amount after re-lock: unpaid rows drop to 0, paid rows are flagged.
  UPDATE public.admin_payroll_statutory_payments p
  SET amount_changed_after_payment = p.amount_changed_after_payment OR (p.paid_on IS NOT NULL AND p.amount <> 0),
      amount = 0,
      updated_at = now()
  WHERE p.wage_month = v_month
    AND p.amount <> 0
    AND NOT EXISTS (
      SELECT 1 FROM _mis_deposit d WHERE d.statute = p.statute AND d.state = p.state AND d.amount > 0
    );

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Build the snapshot for a locked run (replaces that month's rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_build_snapshot(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.admin_salary_month_runs;
  v_count integer;
  v_month_start date;
  v_month_end date;
  v_default_state text;
  v_premium numeric := 0;
  v_covered integer;
  v_share numeric;
BEGIN
  SELECT * INTO r FROM public.admin_salary_month_runs WHERE id = p_run_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Salary month not found.';
  END IF;
  IF NOT coalesce(r.is_locked, false) OR r.status <> 'processed' THEN
    RAISE EXCEPTION 'Only a processed, locked salary month has a report snapshot.';
  END IF;

  v_month_start := make_date(r.pay_year, r.pay_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  SELECT nullif(btrim(value #>> '{}'), '') INTO v_default_state
  FROM public.admin_payroll_mis_settings WHERE key = 'default_state';

  DELETE FROM public.admin_payroll_mis_snapshot WHERE month_key = r.month_key OR run_id = r.id;

  INSERT INTO public.admin_payroll_mis_snapshot (
    run_id, month_key, employee_master_id, employee_code, employee_name, designation, uan_no, esic_no,
    vertical_code, department, grade, location, cost_centre, employment_type, position_type, work_state,
    date_of_joining, date_of_exit, exit_reason,
    paid_days, total_days, lop_days, proration_factor,
    gross, fixed_full, fixed_earned, incentive, ot_amount, arrears,
    total_deductions, net_pay, emp_pf, emp_esic, pt, ee_lwf, tds, loan, salary_advance, unpaid_paid,
    pf_wage, esi_wage,
    er_pf, er_esi, er_lwf, gratuity_prov, bonus_prov, leave_encash_prov, insurance, insurance_source,
    ctc_mediclaim_monthly, ctc_monthly, ctc_revised_in_month, ctc_revision_type, ctc_wef_date
  )
  SELECT
    r.id, r.month_key, l.employee_master_id,
    coalesce(nullif(btrim(l.employee_code), ''), m.employee_id),
    coalesce(nullif(btrim(l.employee_name), ''), m.full_name),
    coalesce(nullif(btrim(l.designation), ''), m.designation),
    coalesce(nullif(btrim(m.uan_no), ''), cj ->> 'uan_no'),
    coalesce(nullif(btrim(m.esic_no), ''), cj ->> 'esic_no'),
    coalesce(nullif(btrim(t.vertical_code), ''), nullif(btrim(d.vertical_code), '')),
    dept.name,
    nullif(btrim(t.grade), ''),
    nullif(btrim(m.location), ''),
    nullif(btrim(t.cost_centre), ''),
    nullif(btrim(m.employment_type), ''),
    t.position_type,
    coalesce(nullif(btrim(t.work_state), ''), v_default_state),
    coalesce(m.date_of_joining, l.date_of_joining),
    coalesce(m.date_of_relieving, m.date_of_leaving),
    coalesce(nullif(btrim(t.exit_reason), ''), nullif(btrim(m.status_reason), '')),
    coalesce(l.present_days, 0),
    coalesce(l.total_days, 0),
    greatest(coalesce(l.total_days, 0) - coalesce(l.present_days, 0), 0),
    f.v,
    coalesce(l.gross_wages, 0),
    coalesce(l.basic_full, 0) + coalesce(l.hra_full, 0) + coalesce(l.special_full, 0)
      + coalesce((ax ->> 'conveyance_full')::numeric, 0) + coalesce((ax ->> 'stat_bonus_full')::numeric, 0)
      + coalesce((ax ->> 'medical_full')::numeric, 0),
    coalesce(l.basic_earned, 0) + coalesce(l.hra_earned, 0) + coalesce(l.special_allowance, 0)
      + coalesce((cj ->> 'conveyance_earned')::numeric, 0) + coalesce((cj ->> 'stat_bonus_earned')::numeric, 0)
      + coalesce((cj ->> 'medical_earned')::numeric, 0),
    coalesce((cj ->> 'perf_incentive_earned')::numeric, 0)
      + coalesce((
          SELECT sum(coalesce((e ->> 'earned')::numeric, 0))
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cj -> 'extra_earnings') = 'array'
                                         THEN cj -> 'extra_earnings' ELSE '[]'::jsonb END) e
        ), 0),
    0, 0,
    coalesce(l.total_ded, 0),
    coalesce(l.net_salary, 0),
    coalesce(l.emp_pf, 0),
    coalesce(l.emp_esic, 0),
    coalesce(l.pt_amount, 0),
    0,
    coalesce(l.tds, 0),
    coalesce(l.loan, 0),
    coalesce(l.sal_adv, 0),
    coalesce(l.unpaid_paid, 0),
    CASE WHEN coalesce(l.emp_pf, 0) > 0 THEN coalesce(nullif(l.pf_earned_basic, 0), l.pf_basic, 0) ELSE 0 END,
    CASE WHEN coalesce(l.emp_esic, 0) > 0 THEN coalesce(l.gross_wages, 0) ELSE 0 END,
    round(f.v * CASE WHEN ax ? 'er_pf_full' THEN coalesce((ax ->> 'er_pf_full')::numeric, 0)
                     ELSE coalesce(s.er_pf_monthly, 0) END, 2),
    round(f.v * CASE WHEN ax ? 'er_esic_full' THEN coalesce((ax ->> 'er_esic_full')::numeric, 0)
                     ELSE coalesce(s.er_esic_monthly, 0) END, 2),
    0,
    round(f.v * coalesce(s.gratuity_monthly, 0), 2),
    round(f.v * (coalesce(s.ex_gratia_monthly, 0) + coalesce(s.bonus_monthly, 0)
                 + coalesce(s.special_perf_bonus_monthly, 0)), 2),
    round(f.v * coalesce(s.leave_encash_monthly, 0), 2),
    round(f.v * coalesce(s.mediclaim_monthly, 0), 2),
    'ctc',
    coalesce(s.mediclaim_monthly, 0),
    coalesce((cj ->> 'ctc_monthly')::numeric, s.ctc_monthly),
    (s.wef_date BETWEEN v_month_start AND v_month_end)
      AND coalesce(s.revision_type, '') NOT IN ('initial', 'correction'),
    s.revision_type,
    s.wef_date
  FROM public.admin_salary_month_lines l
  LEFT JOIN public.admin_ifsp_employee_master m ON m.id = l.employee_master_id
  LEFT JOIN public.admin_payroll_employee_tags t ON t.employee_master_id = l.employee_master_id
  LEFT JOIN public.admin_salary_structures s ON s.employee_master_id = l.employee_master_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN jsonb_typeof(l.computed_json) = 'object' THEN l.computed_json ELSE '{}'::jsonb END AS cj
  ) c
  CROSS JOIN LATERAL (
    SELECT coalesce(
      CASE WHEN jsonb_typeof(c.cj -> 'annexure') = 'object' THEN c.cj -> 'annexure' END,
      CASE WHEN jsonb_typeof(l.source_snapshot_json -> 'annexure') = 'object' THEN l.source_snapshot_json -> 'annexure' END,
      '{}'::jsonb
    ) AS ax
  ) a
  CROSS JOIN LATERAL (
    SELECT coalesce(nullif(btrim(m.department), ''), nullif(btrim(c.cj ->> 'department'), '')) AS name
  ) dept
  LEFT JOIN public.admin_payroll_departments d ON lower(btrim(d.department)) = lower(dept.name)
  CROSS JOIN LATERAL (
    SELECT CASE WHEN coalesce(l.total_days, 0) > 0
                THEN least(1, greatest(0, coalesce(l.present_days, 0)::numeric / l.total_days))
                ELSE 0 END AS v
  ) f
  WHERE l.run_id = r.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insurance premium master overrides CTC mediclaim for the month.
  SELECT coalesce(sum(
    CASE WHEN p.spread = 'twelve' THEN p.annual_premium / 12
         ELSE p.annual_premium / greatest(1,
           (extract(year FROM age(date_trunc('month', p.policy_end),
                                  date_trunc('month', coalesce(p.first_charge_month, p.policy_start)))) * 12
            + extract(month FROM age(date_trunc('month', p.policy_end),
                                     date_trunc('month', coalesce(p.first_charge_month, p.policy_start))))
            + 1)::numeric)
    END), 0)
  INTO v_premium
  FROM public.admin_payroll_insurance_premiums p
  WHERE v_month_start BETWEEN date_trunc('month', coalesce(p.first_charge_month, p.policy_start))::date
                          AND date_trunc('month', p.policy_end)::date;

  IF v_premium > 0 THEN
    SELECT count(*) INTO v_covered FROM public.admin_payroll_mis_snapshot
    WHERE month_key = r.month_key AND ctc_mediclaim_monthly > 0;
    UPDATE public.admin_payroll_mis_snapshot SET insurance = 0, insurance_source = 'premium'
    WHERE month_key = r.month_key;
    IF v_covered > 0 THEN
      v_share := round(v_premium / v_covered, 2);
      UPDATE public.admin_payroll_mis_snapshot SET insurance = v_share
      WHERE month_key = r.month_key AND ctc_mediclaim_monthly > 0;
      -- Rounding remainder on the first covered employee so the month total equals the premium share.
      UPDATE public.admin_payroll_mis_snapshot s SET insurance = s.insurance + (round(v_premium, 2) - v_share * v_covered)
      WHERE s.id = (
        SELECT id FROM public.admin_payroll_mis_snapshot
        WHERE month_key = r.month_key AND ctc_mediclaim_monthly > 0
        ORDER BY employee_code, employee_master_id LIMIT 1
      );
    END IF;
  END IF;

  PERFORM public.admin_payroll_mis_sync_statutory_payments(r.id);
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- After-lock trigger: never fails or rolls back the lock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_after_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_msg text;
  v_ctx text;
BEGIN
  BEGIN
    v_count := public.admin_payroll_mis_build_snapshot(NEW.id);
    INSERT INTO public.admin_payroll_mis_job_log (run_id, month_key, job, ok, message)
    VALUES (NEW.id, NEW.month_key, 'snapshot', true, v_count || ' employee rows');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_ctx = PG_EXCEPTION_CONTEXT;
    BEGIN
      INSERT INTO public.admin_payroll_mis_job_log (run_id, month_key, job, ok, message, detail)
      VALUES (NEW.id, NEW.month_key, 'snapshot', false, v_msg, v_ctx);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Payroll MIS snapshot failed for % and could not be logged: %', NEW.month_key, v_msg;
    END;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_payroll_mis_after_lock ON public.admin_salary_month_runs;
CREATE TRIGGER trg_admin_payroll_mis_after_lock
  AFTER UPDATE OF is_locked ON public.admin_salary_month_runs
  FOR EACH ROW
  WHEN (NEW.is_locked IS TRUE AND OLD.is_locked IS DISTINCT FROM TRUE AND NEW.status = 'processed')
  EXECUTE FUNCTION public.admin_payroll_mis_after_lock();

-- ---------------------------------------------------------------------------
-- Manual rebuild (Salary Admin users), e.g. after a failed snapshot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_rebuild_snapshot(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_month text;
BEGIN
  IF NOT public.admin_payroll_mis_full_access() THEN
    RAISE EXCEPTION 'You do not have access to Salary Admin.' USING ERRCODE = '42501';
  END IF;
  SELECT month_key INTO v_month FROM public.admin_salary_month_runs WHERE id = p_run_id;
  v_count := public.admin_payroll_mis_build_snapshot(p_run_id);
  INSERT INTO public.admin_payroll_mis_job_log (run_id, month_key, job, ok, message)
  VALUES (p_run_id, v_month, 'snapshot_rebuild', true, v_count || ' employee rows');
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Report reads (scoped)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_row_visible(
  p_vertical text, p_department text, p_employee_master_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_salary_user_has_access()
      OR EXISTS (
        SELECT 1
        FROM public.admin_payroll_mis_access a
        WHERE a.user_id = auth.uid()
          AND (
            lower(a.vertical_code) = lower(coalesce(p_vertical, ''))
            OR EXISTS (
              SELECT 1 FROM public.admin_payroll_cost_allocations c
              WHERE c.employee_master_id = p_employee_master_id
                AND lower(c.vertical_code) = lower(a.vertical_code)
            )
          )
          AND (a.department IS NULL OR lower(btrim(a.department)) = lower(btrim(coalesce(p_department, ''))))
      );
$$;

-- Locked months available to reports, newest first.
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_months()
RETURNS TABLE (
  month_key text, run_id uuid, pay_year integer, pay_month integer, locked_at timestamptz,
  line_count integer, snapshot_count integer, last_job_ok boolean, last_job_message text, last_job_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_payroll_mis_has_access() THEN
    RAISE EXCEPTION 'You do not have access to payroll reports.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.month_key, r.id, r.pay_year, r.pay_month, r.locked_at,
         (SELECT count(*)::int FROM public.admin_salary_month_lines l WHERE l.run_id = r.id),
         (SELECT count(*)::int FROM public.admin_payroll_mis_snapshot s WHERE s.run_id = r.id),
         j.ok, j.message, j.created_at
  FROM public.admin_salary_month_runs r
  LEFT JOIN LATERAL (
    SELECT g.ok, g.message, g.created_at FROM public.admin_payroll_mis_job_log g
    WHERE g.run_id = r.id ORDER BY g.created_at DESC, g.id DESC LIMIT 1
  ) j ON true
  WHERE coalesce(r.is_locked, false) AND r.status = 'processed'
  ORDER BY r.month_key DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_payroll_mis_rows(p_from text, p_to text)
RETURNS SETOF public.admin_payroll_mis_snapshot
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_payroll_mis_has_access() THEN
    RAISE EXCEPTION 'You do not have access to payroll reports.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.*
  FROM public.admin_payroll_mis_snapshot s
  JOIN public.admin_salary_month_runs r ON r.id = s.run_id
  WHERE coalesce(r.is_locked, false) AND r.status = 'processed'
    AND s.month_key BETWEEN p_from AND p_to
    AND public.admin_payroll_mis_row_visible(s.vertical_code, s.department, s.employee_master_id)
  ORDER BY s.month_key, s.employee_code;
END;
$$;

-- Salary register totals (sum of the run's own lines) and the stored run header.
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_register_totals(p_from text, p_to text)
RETURNS TABLE (
  month_key text, line_count integer, gross numeric, total_deductions numeric, net_pay numeric,
  header_gross numeric, header_deductions numeric, header_net numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_payroll_mis_full_access() THEN
    RAISE EXCEPTION 'You do not have access to Salary Admin.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.month_key,
         count(l.id)::int,
         coalesce(sum(l.gross_wages), 0), coalesce(sum(l.total_ded), 0), coalesce(sum(l.net_salary), 0),
         r.total_gross, r.total_deductions, r.total_net
  FROM public.admin_salary_month_runs r
  LEFT JOIN public.admin_salary_month_lines l ON l.run_id = r.id
  WHERE coalesce(r.is_locked, false) AND r.status = 'processed'
    AND r.month_key BETWEEN p_from AND p_to
  GROUP BY r.id, r.month_key, r.total_gross, r.total_deductions, r.total_net
  ORDER BY r.month_key;
END;
$$;

-- ---------------------------------------------------------------------------
-- Mark a statutory payment as paid (challan ref + paid on are mandatory)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_payroll_mis_mark_paid(
  p_id uuid,
  p_paid_on date,
  p_challan_ref text,
  p_interest numeric DEFAULT 0,
  p_penalty numeric DEFAULT 0,
  p_note text DEFAULT NULL
)
RETURNS public.admin_payroll_statutory_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_payroll_statutory_payments;
BEGIN
  IF NOT public.admin_payroll_mis_full_access() THEN
    RAISE EXCEPTION 'You do not have access to Salary Admin.' USING ERRCODE = '42501';
  END IF;
  IF p_paid_on IS NULL OR nullif(btrim(coalesce(p_challan_ref, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Enter the paid-on date and the challan reference to mark this payment as paid.'
      USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_interest, 0) < 0 OR coalesce(p_penalty, 0) < 0 THEN
    RAISE EXCEPTION 'Interest and penalty cannot be negative.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.admin_payroll_statutory_payments
  SET paid_on = p_paid_on,
      challan_ref = btrim(p_challan_ref),
      interest = coalesce(p_interest, 0),
      penalty = coalesce(p_penalty, 0),
      note = coalesce(p_note, note),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Payment row not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS, grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_payroll_mis_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_payroll_statutory_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_payroll_mis_snapshot TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_payroll_statutory_payments TO authenticated, service_role;

DROP POLICY IF EXISTS admin_payroll_mis_snapshot_read ON public.admin_payroll_mis_snapshot;
CREATE POLICY admin_payroll_mis_snapshot_read ON public.admin_payroll_mis_snapshot
  FOR SELECT TO authenticated USING (public.admin_payroll_mis_full_access());

DROP POLICY IF EXISTS admin_payroll_statutory_payments_full ON public.admin_payroll_statutory_payments;
CREATE POLICY admin_payroll_statutory_payments_full ON public.admin_payroll_statutory_payments
  FOR ALL TO authenticated
  USING (public.admin_payroll_mis_full_access())
  WITH CHECK (public.admin_payroll_mis_full_access());

-- Challan PDFs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-statutory-challans', 'payroll-statutory-challans', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS payroll_statutory_challans_select ON storage.objects;
CREATE POLICY payroll_statutory_challans_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payroll-statutory-challans' AND public.admin_payroll_mis_full_access());
DROP POLICY IF EXISTS payroll_statutory_challans_insert ON storage.objects;
CREATE POLICY payroll_statutory_challans_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payroll-statutory-challans' AND public.admin_payroll_mis_full_access());
DROP POLICY IF EXISTS payroll_statutory_challans_update ON storage.objects;
CREATE POLICY payroll_statutory_challans_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payroll-statutory-challans' AND public.admin_payroll_mis_full_access())
  WITH CHECK (bucket_id = 'payroll-statutory-challans' AND public.admin_payroll_mis_full_access());
DROP POLICY IF EXISTS payroll_statutory_challans_delete ON storage.objects;
CREATE POLICY payroll_statutory_challans_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payroll-statutory-challans' AND public.admin_payroll_mis_full_access());

REVOKE ALL ON FUNCTION public.admin_payroll_mis_due_date(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_sync_statutory_payments(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_build_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_after_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_row_visible(text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_rebuild_snapshot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_months() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_rows(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_register_totals(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_payroll_mis_mark_paid(uuid, date, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_row_visible(text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_rebuild_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_months() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_rows(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_register_totals(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_mark_paid(uuid, date, text, numeric, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_due_date(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_payroll_mis_build_snapshot(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- One-time: snapshots for months already locked (uses today's employee tags)
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  rr record;
  v_count integer;
  v_msg text;
BEGIN
  FOR rr IN
    SELECT id, month_key FROM public.admin_salary_month_runs
    WHERE coalesce(is_locked, false) AND status = 'processed'
    ORDER BY month_key
  LOOP
    BEGIN
      v_count := public.admin_payroll_mis_build_snapshot(rr.id);
      INSERT INTO public.admin_payroll_mis_job_log (run_id, month_key, job, ok, message)
      VALUES (rr.id, rr.month_key, 'snapshot_initial', true, v_count || ' employee rows (built from current employee tags)');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      INSERT INTO public.admin_payroll_mis_job_log (run_id, month_key, job, ok, message)
      VALUES (rr.id, rr.month_key, 'snapshot_initial', false, v_msg);
    END;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

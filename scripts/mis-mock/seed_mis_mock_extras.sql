-- =============================================================================
-- Payroll MIS — MOCK TEST DATA (optional extras). Run AFTER seed_mis_mock.sql, local / staging only.
--
--   1. One "Unassigned" employee (MOCK-E0999, no vertical tag, unmapped department) added to Sep 2026
--      by unlocking, adding the line and re-locking — tests the Unassigned row and the re-lock path.
--      NOTE: this changes the Sep 2026 sample totals (headcount 249, deposits up). Run cleanup + seed to restore.
--   2. Two statutory payment rows dated relative to today: one due in 2 days (Due soon) and one 2 days
--      past due (Overdue), to test the Report 7 colours, tiles and the daily alert job.
--
-- Removed by cleanup_mis_mock.sql. Running it twice does nothing the second time.
-- =============================================================================
-- SELECT set_config('mis_mock.confirm', 'not-production', false);

BEGIN;

DO $extras$
DECLARE
  v_run uuid;
  v_emp bigint;
  v_ok boolean;
  v_msg text;
  v_action text;
BEGIN
  IF coalesce(current_setting('mis_mock.confirm', true), '') <> 'not-production' THEN
    RAISE EXCEPTION 'Refusing to run: confirm the target is local/staging (SELECT set_config(''mis_mock.confirm'', ''not-production'', false);).';
  END IF;
  IF to_regclass('public.mis_mock_registry') IS NULL THEN
    RAISE EXCEPTION 'Run seed_mis_mock.sql first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mis_mock_registry WHERE table_name = '_extras') THEN
    RAISE NOTICE 'Extras already added. Nothing to do.';
    RETURN;
  END IF;
  INSERT INTO public.mis_mock_registry (table_name, row_key) VALUES ('_extras', 'added');

  -- 1. Unassigned employee in Sep 2026.
  INSERT INTO public.admin_ifsp_employee_master
    (employee_id, full_name, designation, department, location, employment_type, date_of_joining, status, uan_no, created_by)
  VALUES ('MOCK-E0999', 'Mock Employee 999', 'Field Technician', 'Mock Unmapped Team', 'Vadodara', 'permanent',
          DATE '2022-06-01', 'Active', '999900000999', 'mock_mis')
  RETURNING id INTO v_emp;
  INSERT INTO public.mis_mock_registry (table_name, row_key) VALUES ('admin_ifsp_employee_master', v_emp::text);
  -- State Gujarat like every mock employee, but no vertical → shows as Unassigned.
  INSERT INTO public.admin_payroll_employee_tags (employee_master_id, vertical_code, work_state) VALUES (v_emp, NULL, 'Gujarat');
  INSERT INTO public.mis_mock_registry (table_name, row_key) VALUES ('admin_payroll_employee_tags', v_emp::text);

  INSERT INTO public.admin_salary_structures
    (employee_master_id, declared, structure_version, salary_scheme, employee_status, revision_type, revision_reason, wef_date,
     date_of_joining, gross_monthly, basic_monthly, hra_monthly, special_allowance_monthly, emp_pf_monthly, pt_monthly,
     er_pf_monthly, gratuity_monthly, mediclaim_enabled, mediclaim_monthly, ex_gratia_monthly, total_b_monthly, ctc_monthly, ctc_annual)
  VALUES (v_emp, true, 'annexure_2026', 'old', 'confirmed', 'initial', 'MOCK data (mock_mis)', DATE '2022-06-01', DATE '2022-06-01',
          25000, 12500, 5000, 7500, 1500, 200, 1500, 375, false, 0, 250, 625, 25625, 307500);
  INSERT INTO public.mis_mock_registry (table_name, row_key)
  SELECT 'admin_salary_structures', id::text FROM public.admin_salary_structures WHERE employee_master_id = v_emp;

  SELECT id INTO v_run FROM public.admin_salary_month_runs WHERE month_key = '2026-09'
    AND id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_salary_month_runs');
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Mock Sep 2026 salary month not found.';
  END IF;

  FOREACH v_action IN ARRAY ARRAY['unlock', 'add', 'lock'] LOOP
    IF v_action = 'unlock' THEN
      BEGIN
        PERFORM public.admin_salary_unlock_month_run(v_run, 'MOCK: add unassigned employee');
      EXCEPTION WHEN insufficient_privilege THEN
        PERFORM set_config('admin_salary.lock_action', 'unlock', true);
        UPDATE public.admin_salary_month_runs
        SET is_locked = false, unlocked_at = now(), unlock_reason = 'MOCK: add unassigned employee',
            summary_json = jsonb_set(coalesce(summary_json, '{}'::jsonb), '{lock_history}',
              coalesce(summary_json -> 'lock_history', '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('action', 'unlock', 'by_email', 'mock_mis extras', 'at', now(),
                                                      'reason', 'MOCK: add unassigned employee')))
        WHERE id = v_run;
        PERFORM set_config('admin_salary.lock_action', '', true);
      END;
    ELSIF v_action = 'add' THEN
      INSERT INTO public.admin_salary_month_lines
        (run_id, employee_master_id, employee_code, employee_name, designation, date_of_joining, declared, salary_rate,
         present_days, total_days, pf_basic, pf_earned_basic, basic_full, basic_earned, hra_full, hra_earned, special_full,
         special_allowance, gross_wages, emp_pf, emp_esic, pt_amount, loan, tds, total_ded, net_salary, bank_amount, computed_json)
      VALUES (v_run, v_emp, 'MOCK-E0999', 'Mock Employee 999', 'Field Technician', DATE '2022-06-01', true, 25000,
              30, 30, 12500, 12500, 12500, 12500, 5000, 5000, 7500, 7500, 25000, 1500, 0, 200, 0, 0, 1700, 23300, 23300,
              jsonb_build_object('mock_mis', true, 'annexure', jsonb_build_object('er_pf_full', 1500, 'er_esic_full', 0)));
      UPDATE public.admin_salary_month_runs r
      SET employee_count = t.cnt, total_gross = t.gross, total_deductions = t.ded, total_net = t.net
      FROM (SELECT count(*) AS cnt, sum(gross_wages) AS gross, sum(total_ded) AS ded, sum(net_salary) AS net
            FROM public.admin_salary_month_lines WHERE run_id = v_run) t
      WHERE r.id = v_run;
    ELSE
      BEGIN
        PERFORM public.admin_salary_lock_month_run(v_run);
      EXCEPTION WHEN insufficient_privilege THEN
        PERFORM set_config('admin_salary.lock_action', 'lock', true);
        UPDATE public.admin_salary_month_runs
        SET is_locked = true, locked_at = now(),
            summary_json = jsonb_set(coalesce(summary_json, '{}'::jsonb), '{lock_history}',
              coalesce(summary_json -> 'lock_history', '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('action', 'lock', 'by_email', 'mock_mis extras', 'at', now())))
        WHERE id = v_run;
        PERFORM set_config('admin_salary.lock_action', '', true);
      END;
      SELECT ok, message INTO v_ok, v_msg FROM public.admin_payroll_mis_job_log
      WHERE run_id = v_run ORDER BY created_at DESC, id DESC LIMIT 1;
      IF NOT coalesce(v_ok, false) THEN
        RAISE EXCEPTION 'MIS snapshot for Sep 2026 failed after re-lock: %', coalesce(v_msg, 'no job log row');
      END IF;
      -- Same overtime / arrears / LWF copy as the main seed (the builder stores them as 0).
      UPDATE public.admin_payroll_mis_snapshot s
      SET ot_amount = coalesce((l.computed_json ->> 'mock_ot')::numeric, 0),
          arrears = coalesce((l.computed_json ->> 'mock_arrears')::numeric, 0),
          ee_lwf = coalesce((l.computed_json ->> 'mock_ee_lwf')::numeric, 0),
          er_lwf = coalesce((l.computed_json ->> 'mock_er_lwf')::numeric, 0)
      FROM public.admin_salary_month_lines l
      WHERE s.run_id = v_run AND l.run_id = v_run AND l.employee_master_id = s.employee_master_id
        AND (l.computed_json ->> 'mock_mis') = 'true';
      PERFORM public.admin_payroll_mis_sync_statutory_payments(v_run);
    END IF;
  END LOOP;

  -- 2. Due-soon and overdue deposits (wage month Oct 2026, dated from today).
  WITH ins AS (
    INSERT INTO public.admin_payroll_statutory_payments (wage_month, statute, state, amount, due_date, note)
    VALUES ('2026-10', 'TDS', 'Gujarat', 5000, current_date + 2, 'mock_mis — due soon test row'),
           ('2026-10', 'PF', 'Gujarat', 7000, current_date - 2, 'mock_mis — overdue test row')
    ON CONFLICT (wage_month, statute, state) DO NOTHING
    RETURNING id)
  INSERT INTO public.mis_mock_registry (table_name, row_key) SELECT 'admin_payroll_statutory_payments', id::text FROM ins;

  RAISE NOTICE 'Extras added: Unassigned employee MOCK-E0999 in Sep 2026, one due-soon and one overdue deposit.';
END
$extras$;

COMMIT;

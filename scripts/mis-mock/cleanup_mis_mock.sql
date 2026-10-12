-- =============================================================================
-- Payroll MIS — MOCK TEST DATA (cleanup)
--
-- Removes every row inserted by seed_mis_mock.sql / seed_mis_mock_extras.sql (listed in
-- public.mis_mock_registry), in dependency order, then drops the registry. Real rows are never touched.
-- Safe to run twice: with no registry it does nothing.
--
-- Run (psql):      psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f scripts/mis-mock/cleanup_mis_mock.sql
-- If a dummy challan PDF was uploaded, remove it first: node scripts/mis-mock/upload_mock_challan.mjs --remove
-- =============================================================================

SELECT current_database() AS target_database, inet_server_addr() AS target_host;

BEGIN;

DO $cleanup$
DECLARE
  v_runs uuid[];
  v_emps bigint[];
  v_payments uuid[];
  v_since timestamptz;
  v_n integer;
  v_t text;
BEGIN
  IF to_regclass('public.mis_mock_registry') IS NULL THEN
    RAISE NOTICE 'No Payroll MIS mock data found (public.mis_mock_registry does not exist). Nothing to clean.';
    RETURN;
  END IF;

  SELECT coalesce(array_agg(row_key::uuid), '{}') INTO v_runs FROM public.mis_mock_registry WHERE table_name = 'admin_salary_month_runs';
  SELECT coalesce(array_agg(row_key::bigint), '{}') INTO v_emps FROM public.mis_mock_registry WHERE table_name = 'admin_ifsp_employee_master';
  SELECT coalesce(array_agg(id), '{}') INTO v_payments FROM public.admin_payroll_statutory_payments
  WHERE run_id = ANY (v_runs)
     OR id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_statutory_payments');
  SELECT min(inserted_at) INTO v_since FROM public.mis_mock_registry;

  IF EXISTS (SELECT 1 FROM public.admin_payroll_statutory_payments WHERE id = ANY (v_payments) AND challan_path IS NOT NULL) THEN
    RAISE NOTICE 'A mock payment still has an uploaded challan file. Run: node scripts/mis-mock/upload_mock_challan.mjs --remove (the database row is removed now; the stored file stays until then).';
  END IF;

  -- 1. Alert log and statutory payments of mock months.
  DELETE FROM public.admin_payroll_mis_alert_log WHERE payment_id = ANY (v_payments);
  DELETE FROM public.admin_payroll_statutory_payments WHERE id = ANY (v_payments);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Statutory payment rows removed: %', v_n;

  -- 2. Report snapshot and job log of mock runs.
  DELETE FROM public.admin_payroll_mis_snapshot WHERE run_id = ANY (v_runs) OR employee_master_id = ANY (v_emps);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Snapshot rows removed: %', v_n;
  DELETE FROM public.admin_payroll_mis_job_log WHERE run_id = ANY (v_runs);

  -- 3. Unlock mock runs through the lock guard, then delete them (lines cascade).
  PERFORM set_config('admin_salary.lock_action', 'unlock', true);
  UPDATE public.admin_salary_month_runs SET is_locked = false WHERE id = ANY (v_runs) AND coalesce(is_locked, false);
  PERFORM set_config('admin_salary.lock_action', '', true);
  DELETE FROM public.admin_salary_month_lines WHERE run_id = ANY (v_runs);
  DELETE FROM public.admin_salary_month_runs WHERE id = ANY (v_runs);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Salary months removed: %', v_n;
  IF to_regclass('public.admin_salary_run_revisions') IS NOT NULL THEN
    DELETE FROM public.admin_salary_run_revisions WHERE run_id = ANY (v_runs);
  END IF;

  -- 4. MIS masters inserted by the seed (only the registered rows).
  DELETE FROM public.admin_payroll_budget WHERE id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_budget');
  DELETE FROM public.admin_payroll_mis_access WHERE id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_mis_access');
  DELETE FROM public.admin_payroll_mis_alert_recipients WHERE id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_mis_alert_recipients');
  DELETE FROM public.admin_payroll_insurance_premiums WHERE id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_insurance_premiums');
  DELETE FROM public.admin_payroll_statutory_rates WHERE id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_statutory_rates');
  DELETE FROM public.admin_payroll_compliance_calendar WHERE id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_compliance_calendar');
  DELETE FROM public.admin_payroll_cost_allocations WHERE id::text IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_cost_allocations')
     OR employee_master_id = ANY (v_emps);
  DELETE FROM public.admin_payroll_employee_tags WHERE employee_master_id = ANY (v_emps);
  DELETE FROM public.admin_payroll_departments WHERE department IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_departments');
  DELETE FROM public.admin_payroll_mis_settings WHERE key IN (SELECT row_key FROM public.mis_mock_registry WHERE table_name = 'admin_payroll_mis_settings');

  -- 5. Salary structures, then the CTC audit rows their insert / update / delete wrote.
  DELETE FROM public.admin_salary_structures WHERE employee_master_id = ANY (v_emps);
  DELETE FROM public.admin_salary_ctc_audit WHERE employee_master_id = ANY (v_emps);

  -- 6. Mock employees.
  DELETE FROM public.admin_ifsp_employee_master WHERE id = ANY (v_emps) AND employee_id ILIKE 'MOCK-%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Mock employees removed: %', v_n;

  -- 7. Report view / download log entries written while testing the mock data.
  IF coalesce(current_setting('mis_mock.keep_audit_log', true), '') <> 'on' AND v_since IS NOT NULL THEN
    DELETE FROM public.admin_payroll_mis_audit_log WHERE created_at >= v_since;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'Report view / download log rows since the seed removed: % (SET mis_mock.keep_audit_log = on to keep them).', v_n;
  END IF;

  SELECT string_agg(DISTINCT table_name, ', ') INTO v_t FROM public.mis_mock_registry
  WHERE table_name NOT IN ('_seed', '_extras', 'admin_salary_month_runs', 'admin_ifsp_employee_master', 'admin_payroll_statutory_payments',
    'admin_payroll_budget', 'admin_payroll_mis_access', 'admin_payroll_mis_alert_recipients', 'admin_payroll_insurance_premiums',
    'admin_payroll_statutory_rates', 'admin_payroll_compliance_calendar', 'admin_payroll_cost_allocations',
    'admin_payroll_employee_tags', 'admin_payroll_departments', 'admin_payroll_mis_settings', 'admin_salary_structures');
  IF v_t IS NOT NULL THEN
    RAISE EXCEPTION 'Cleanup does not know how to remove registered rows from: %', v_t;
  END IF;

  DROP TABLE public.mis_mock_registry;
  RAISE NOTICE 'Payroll MIS mock data removed.';
END
$cleanup$;

COMMIT;

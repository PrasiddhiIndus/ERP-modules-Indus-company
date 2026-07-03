-- =============================================================================
-- PRODUCTION — list ALL public schema tables (read-only)
-- Run on wbyzhknaqcjqqtwopupl, copy the output, then compare with staging.
-- =============================================================================

SELECT
  tablename AS public_table,
  pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Row counts for ERP / admin tables (informational)
SELECT '--- row counts (ERP / admin) ---' AS section;

DO $$
DECLARE
  t text;
  c bigint;
  tables text[] := ARRAY[
    'profiles', 'app_users', 'erp_app_access_config', 'erp_activity_log',
    'admin_ifsp_employee_master', 'admin_attendance_register',
    'erp_attendance_punches', 'erp_attendance_sync_state',
    'manpower_enquiries', 'software_subscriptions',
    'marketing_enquiries', 'marketing_quotations', 'marketing_clients',
    'tenders', 'costing_rows', 'costing_summary',
    'amc_customers', 'amc_contracts',
    'hr_payroll_sites', 'hr_payroll_runs',
    'operations_fire_tender_vehicle_master'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '% : TABLE MISSING', t;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO c;
      RAISE NOTICE '% : % rows', t, c;
    END IF;
  END LOOP;
END $$;

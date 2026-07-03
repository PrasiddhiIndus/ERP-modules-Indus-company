-- =============================================================================
-- STAGING VERIFY — run on xjzhlbpgnpcmbdlufhwo after full schema replication
-- All rows should show OK. MISSING = run the step noted in staging_replicate_production.sql
-- =============================================================================

WITH expected(module, qualified_name) AS (
  VALUES
    -- Core / auth
    ('core', 'public.profiles'),
    ('core', 'public.app_users'),
    ('core', 'public.erp_app_access_config'),
    ('core', 'public.erp_activity_log'),
    -- Marketing (you applied these already)
    ('marketing', 'public.marketing_enquiries'),
    ('marketing', 'public.marketing_quotations'),
    ('marketing', 'public.marketing_clients'),
    ('marketing', 'public.marketing_costing_sheets'),
    ('marketing', 'public.marketing_site_visits'),
    ('marketing', 'public.marketing_follow_ups'),
    -- Commercial
    ('commercial', 'public.manpower_enquiries'),
    -- Billing
    ('billing', 'billing.po_wo'),
    ('billing', 'billing.po_rate_category'),
    ('billing', 'billing.invoice'),
    ('billing', 'billing.invoice_line_item'),
    -- Finance
    ('finance', 'finance.settings'),
    ('finance', 'finance.sites'),
    ('finance', 'finance.period_entries'),
    ('finance', 'finance.budget_versions'),
    -- Admin / HR
    ('admin', 'public.admin_ifsp_employee_master'),
    ('admin', 'public.admin_attendance_register'),
    ('admin', 'public.erp_attendance_punches'),
    ('admin', 'indus_one.admin_leave_requests'),
    ('admin', 'indus_one.admin_leave_attendance_marks'),
    ('admin', 'indus_one.employee_leave_balances_yearly'),
    -- Fire Tender
    ('fire_tender', 'public.tenders'),
    ('fire_tender', 'public.tender_contacts'),
    ('fire_tender', 'public.costing_rows'),
    ('fire_tender', 'public.costing_summary'),
    ('fire_tender', 'public.main_components'),
    ('fire_tender', 'public.moc_prices'),
    -- Projects
    ('projects', 'projects.enquiries'),
    ('projects', 'projects.enquiry_field_definitions'),
    -- AMC
    ('amc', 'public.amc_customers'),
    ('amc', 'public.amc_contracts'),
    ('amc', 'public.amc_complaints'),
    -- HR Payroll
    ('hr_payroll', 'public.hr_payroll_sites'),
    ('hr_payroll', 'public.hr_payroll_runs'),
    -- IT / subscriptions
    ('it_is', 'public.software_subscriptions'),
    -- Fleet
    ('operations', 'public.operations_fire_tender_vehicle_trips'),
    ('operations', 'public.operations_fire_tender_vehicle_master')
)
SELECT
  e.module,
  e.qualified_name AS table_name,
  CASE
    WHEN to_regclass(e.qualified_name) IS NOT NULL THEN 'OK'
    ELSE 'MISSING'
  END AS status
FROM expected e
ORDER BY
  CASE WHEN to_regclass(e.qualified_name) IS NULL THEN 0 ELSE 1 END,
  e.module,
  e.qualified_name;

-- Schema exposure reminder (informational — configure in Dashboard, not SQL)
SELECT 'exposed_schemas_check' AS check_name,
  string_agg(nspname, ', ' ORDER BY nspname) AS schemas_in_db
FROM pg_namespace
WHERE nspname IN ('public', 'billing', 'finance', 'indus_one', 'projects');

-- Login / grants sanity (same as staging_fix_403)
SELECT 'anon read erp_app_access_config' AS check_name,
  CASE WHEN has_table_privilege('anon', 'public.erp_app_access_config', 'SELECT')
    THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'authenticated read profiles',
  CASE WHEN has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'billing schema exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'billing')
    THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'finance schema exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'finance')
    THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'indus_one schema exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'indus_one')
    THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'projects schema exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'projects')
    THEN 'OK' ELSE 'MISSING' END;

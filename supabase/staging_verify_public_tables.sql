-- =============================================================================
-- STAGING VERIFY — all public schema ERP + admin tables
-- Run on xjzhlbpgnpcmbdlufhwo after replication steps.
-- =============================================================================

-- 1) Every public table currently on staging
SELECT 'public_tables_on_staging' AS report, tablename AS name, 'EXISTS' AS status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2) Expected ERP / admin / module tables in public schema (must match production)
WITH expected(name) AS (
  VALUES
    -- Core auth / ERP
    ('profiles'),
    ('app_users'),
    ('erp_app_access_config'),
    ('erp_activity_log'),
    -- Admin / HR
    ('admin_ifsp_employee_master'),
    ('admin_attendance_register'),
    ('erp_attendance_punches'),
    ('erp_attendance_sync_state'),
    ('ifsp_employee_history'),
    ('ifsp_employees'),
    -- IT / IS
    ('software_subscriptions'),
    ('software_subscription_invoice_files'),
    -- Commercial
    ('manpower_enquiries'),
    -- Marketing (already on staging)
    ('marketing_enquiries'),
    ('marketing_quotations'),
    ('marketing_quotation_items'),
    ('marketing_quotation_revisions'),
    ('marketing_clients'),
    ('marketing_costing_sheets'),
    ('marketing_follow_ups'),
    ('marketing_notifications'),
    ('marketing_site_visits'),
    ('marketing_enquiry_documents'),
    ('marketing_mail_templates'),
    ('marketing_gst_documents'),
    ('marketing_products'),
    ('marketing_contracts'),
    ('marketing_expo_seminars'),
    ('marketing_expo_visitors'),
    -- Fire Tender
    ('tenders'),
    ('tender_contacts'),
    ('costing_rows'),
    ('costing_summary'),
    ('costing_accessories'),
    ('quotations'),
    ('approved_quotation_items'),
    ('quotation_templates'),
    ('main_components'),
    ('moc_prices'),
    ('price_master'),
    ('price_master_versions'),
    ('accessories'),
    ('audit_logs'),
    -- AMC
    ('amc_settings_masters'),
    ('amc_customers'),
    ('amc_contracts'),
    ('amc_contract_sites'),
    ('amc_assets'),
    ('amc_pm_schedules'),
    ('amc_complaints'),
    ('amc_service_visits'),
    ('amc_service_reports'),
    ('amc_technician_allocations'),
    ('amc_alerts'),
    ('amc_contract_renewals'),
    ('amc_activity_logs'),
    -- HR Payroll
    ('hr_payroll_sites'),
    ('hr_employee_payroll_profile'),
    ('hr_payroll_components_master'),
    ('hr_site_payroll_formula_sets'),
    ('hr_site_payroll_formula_components'),
    ('hr_payroll_runs'),
    ('hr_payroll_run_employees'),
    ('hr_payroll_employee_monthly_summary'),
    ('hr_payroll_employee_component_values'),
    ('hr_payroll_manual_inputs'),
    ('hr_payroll_pf_details'),
    ('hr_payroll_esic_details'),
    ('hr_payroll_pt_state_rules'),
    ('hr_payroll_pt_details'),
    ('hr_payroll_tds_rules'),
    ('hr_payroll_tds_details'),
    ('hr_payroll_loans'),
    ('hr_payroll_loan_recoveries'),
    ('hr_payroll_payslips'),
    ('hr_payroll_audit_logs'),
    -- Fleet / operations (public)
    ('operations_fire_tender_vehicle_master'),
    ('operations_fire_tender_vehicle_drivers'),
    ('operations_fire_tender_vehicle_trips'),
    ('operations_fire_tender_vehicle_documents'),
    ('operations_fire_tender_vehicle_maintenance'),
    ('vehicles_master'),
    ('vehicle_documents'),
    ('drivers')
)
SELECT
  e.name AS public_table,
  CASE WHEN to_regclass('public.' || e.name) IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM expected e
ORDER BY
  CASE WHEN to_regclass('public.' || e.name) IS NULL THEN 0 ELSE 1 END,
  e.name;

-- 3) Grants check on key admin tables
SELECT 'authenticated grant admin_ifsp_employee_master' AS check_name,
  CASE WHEN has_table_privilege('authenticated', 'public.admin_ifsp_employee_master', 'SELECT')
    THEN 'OK' ELSE 'MISSING — run staging_public_schema_all.sql' END AS status
UNION ALL
SELECT 'authenticated grant erp_attendance_punches',
  CASE WHEN has_table_privilege('authenticated', 'public.erp_attendance_punches', 'SELECT')
    THEN 'OK' ELSE 'MISSING — run staging_public_schema_all.sql' END
UNION ALL
SELECT 'public table count (informational)',
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public');

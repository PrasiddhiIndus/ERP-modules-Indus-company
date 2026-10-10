-- Rollback for 20261010120000_payroll_mis_foundation.sql
-- Run 20261010120100_payroll_mis_snapshot_down.sql first.
-- Removes every MIS master / log table and helper. Existing payroll data is untouched.

DROP FUNCTION IF EXISTS public.admin_payroll_mis_log(text, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.admin_payroll_mis_my_access();

DROP TABLE IF EXISTS public.admin_payroll_mis_alert_log;
DROP TABLE IF EXISTS public.admin_payroll_mis_alert_recipients;
DROP TABLE IF EXISTS public.admin_payroll_mis_job_log;
DROP TABLE IF EXISTS public.admin_payroll_mis_audit_log;
DROP TABLE IF EXISTS public.admin_payroll_budget;
DROP TABLE IF EXISTS public.admin_payroll_compliance_calendar;
DROP TABLE IF EXISTS public.admin_payroll_statutory_rates;
DROP TABLE IF EXISTS public.admin_payroll_insurance_premiums;
DROP TABLE IF EXISTS public.admin_payroll_cost_allocations;
DROP TABLE IF EXISTS public.admin_payroll_departments;
DROP TABLE IF EXISTS public.admin_payroll_employee_tags;
DROP TABLE IF EXISTS public.admin_payroll_mis_settings;

DROP FUNCTION IF EXISTS public.admin_payroll_mis_has_access();
DROP TABLE IF EXISTS public.admin_payroll_mis_access;
DROP FUNCTION IF EXISTS public.admin_payroll_mis_full_access();

NOTIFY pgrst, 'reload schema';

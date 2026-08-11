-- =============================================================================
-- Drop all Admin Salary tables, helpers, and legacy schema.
-- Feature is being fully rewired; prior salary structures / runs are discarded.
-- Does NOT touch hr_payroll_* or admin_ifsp_employee_master.
-- =============================================================================

-- Public (current / app-facing) tables — children first
DROP TABLE IF EXISTS public.admin_salary_processing_lines CASCADE;
DROP TABLE IF EXISTS public.admin_salary_structure_revisions CASCADE;
DROP TABLE IF EXISTS public.admin_salary_processing_runs CASCADE;
DROP TABLE IF EXISTS public.admin_salary_structures CASCADE;

DROP FUNCTION IF EXISTS public.admin_salary_user_has_access();
DROP FUNCTION IF EXISTS public.admin_salary_set_updated_at();

-- Legacy custom schema (structures, revisions, runs, lines + helpers)
DROP SCHEMA IF EXISTS admin_salary CASCADE;

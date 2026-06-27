-- Cross-schema performance indexes for Supabase resource exhaustion.
-- Safe to re-run: IF NOT EXISTS + table/column guards.
-- Complements 20260626120000_admin_leave_requests_date_range_indexes.sql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Helper: create index only when table exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._create_perf_index_if_exists(
  p_schema text,
  p_table text,
  p_index_name text,
  p_index_ddl text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('%I.%I', p_schema, p_table)) IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = p_schema AND indexname = p_index_name
  ) THEN
    RETURN;
  END IF;
  BEGIN
    EXECUTE p_index_ddl;
  EXCEPTION
    WHEN undefined_column OR undefined_table THEN
      NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- public — attendance (highest daily volume)
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'public', 'admin_attendance_register', 'idx_admin_attendance_register_date_employee',
  'CREATE INDEX idx_admin_attendance_register_date_employee
     ON public.admin_attendance_register (register_date, employee_code)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_attendance_register', 'idx_admin_attendance_register_leave_request',
  'CREATE INDEX idx_admin_attendance_register_leave_request
     ON public.admin_attendance_register (leave_request_id)
     WHERE leave_request_id IS NOT NULL'
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_attendance_register', 'idx_admin_attendance_register_tour_request',
  'CREATE INDEX idx_admin_attendance_register_tour_request
     ON public.admin_attendance_register (tour_request_id)
     WHERE tour_request_id IS NOT NULL'
);

SELECT public._create_perf_index_if_exists(
  'public', 'erp_attendance_punches', 'idx_erp_attendance_punches_date_employee',
  'CREATE INDEX idx_erp_attendance_punches_date_employee
     ON public.erp_attendance_punches (punch_date DESC, employee_code)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'erp_attendance_punches', 'idx_erp_attendance_punches_date_time',
  'CREATE INDEX idx_erp_attendance_punches_date_time
     ON public.erp_attendance_punches (punch_date DESC, punch_time DESC)'
);

-- ---------------------------------------------------------------------------
-- public — employee master (every module joins here; RLS on all rows)
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'public', 'admin_ifsp_employee_master', 'idx_employee_master_status',
  'CREATE INDEX idx_employee_master_status
     ON public.admin_ifsp_employee_master (status)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_ifsp_employee_master', 'idx_employee_master_status_code',
  'CREATE INDEX idx_employee_master_status_code
     ON public.admin_ifsp_employee_master (status, employee_code)
     WHERE employee_code IS NOT NULL AND btrim(employee_code) <> '''''
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_ifsp_employee_master', 'idx_employee_master_user_id',
  'CREATE INDEX idx_employee_master_user_id
     ON public.admin_ifsp_employee_master (user_id)
     WHERE user_id IS NOT NULL'
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_ifsp_employee_master', 'idx_employee_master_l1_manager',
  'CREATE INDEX idx_employee_master_l1_manager
     ON public.admin_ifsp_employee_master (l1_manager_code)
     WHERE l1_manager_code IS NOT NULL AND btrim(l1_manager_code) <> '''''
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_ifsp_employee_master', 'idx_employee_master_l2_manager',
  'CREATE INDEX idx_employee_master_l2_manager
     ON public.admin_ifsp_employee_master (l2_manager_code)
     WHERE l2_manager_code IS NOT NULL AND btrim(l2_manager_code) <> '''''
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_ifsp_employee_master', 'idx_employee_master_full_name_trgm',
  'CREATE INDEX idx_employee_master_full_name_trgm
     ON public.admin_ifsp_employee_master USING gin (full_name gin_trgm_ops)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'admin_ifsp_employee_master', 'idx_employee_master_employee_code_trgm',
  'CREATE INDEX idx_employee_master_employee_code_trgm
     ON public.admin_ifsp_employee_master USING gin (employee_code gin_trgm_ops)'
);

-- ---------------------------------------------------------------------------
-- public — profiles (RLS helper reads on every guarded table)
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'public', 'profiles', 'idx_profiles_role_team',
  'CREATE INDEX idx_profiles_role_team ON public.profiles (role, team)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'profiles', 'idx_profiles_email_trgm',
  'CREATE INDEX idx_profiles_email_trgm ON public.profiles USING gin (email gin_trgm_ops)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'profiles', 'idx_profiles_username_trgm',
  'CREATE INDEX idx_profiles_username_trgm ON public.profiles USING gin (username gin_trgm_ops)'
);

-- ---------------------------------------------------------------------------
-- indus_one — leave workflow (admin inbox + attendance register)
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'indus_one', 'admin_leave_requests', 'idx_admin_leave_requests_status_submitted',
  'CREATE INDEX idx_admin_leave_requests_status_submitted
     ON indus_one.admin_leave_requests (status, submitted_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'admin_leave_requests', 'idx_admin_leave_requests_dates',
  'CREATE INDEX idx_admin_leave_requests_dates
     ON indus_one.admin_leave_requests (from_date, to_date)'
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'admin_leave_requests', 'idx_admin_leave_requests_leave_type_submitted',
  'CREATE INDEX idx_admin_leave_requests_leave_type_submitted
     ON indus_one.admin_leave_requests (leave_type_code, submitted_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'admin_leave_requests', 'idx_admin_leave_requests_pending',
  'CREATE INDEX idx_admin_leave_requests_pending
     ON indus_one.admin_leave_requests (submitted_at DESC)
     WHERE status = ''pending'''
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'admin_leave_requests', 'idx_admin_leave_requests_approved',
  'CREATE INDEX idx_admin_leave_requests_approved
     ON indus_one.admin_leave_requests (submitted_at DESC)
     WHERE status = ''approved'''
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'leave_requests', 'idx_leave_requests_status_submitted',
  'CREATE INDEX idx_leave_requests_status_submitted
     ON indus_one.leave_requests (status, submitted_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'leave_requests', 'idx_leave_requests_dates',
  'CREATE INDEX idx_leave_requests_dates
     ON indus_one.leave_requests (from_date, to_date)'
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'admin_tour_requests', 'idx_admin_tour_requests_approved_dates',
  'CREATE INDEX idx_admin_tour_requests_approved_dates
     ON indus_one.admin_tour_requests (from_date, to_date)
     WHERE lower(btrim(coalesce(status, ''''))) = ''approved'''
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'tour_requests', 'idx_tour_requests_approved_dates',
  'CREATE INDEX idx_tour_requests_approved_dates
     ON indus_one.tour_requests (from_date, to_date)
     WHERE lower(btrim(coalesce(status, ''''))) = ''approved'''
);

SELECT public._create_perf_index_if_exists(
  'indus_one', 'admin_tour_attendance_marks', 'idx_admin_tour_attendance_marks_register',
  'CREATE INDEX idx_admin_tour_attendance_marks_register
     ON indus_one.admin_tour_attendance_marks (register_date, employee_code)
     WHERE coalesce(reverted, false) = false'
);

-- ---------------------------------------------------------------------------
-- public — fire tender / costing
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'public', 'main_components', 'idx_main_components_template',
  'CREATE INDEX idx_main_components_template ON public.main_components (template)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'price_master', 'idx_price_master_template',
  'CREATE INDEX idx_price_master_template ON public.price_master (template)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'costing_rows', 'idx_costing_rows_tender_id',
  'CREATE INDEX idx_costing_rows_tender_id ON public.costing_rows (tender_id)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'moc_prices', 'idx_moc_prices_tender_id',
  'CREATE INDEX idx_moc_prices_tender_id ON public.moc_prices (tender_id)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'approved_quotation_items', 'idx_approved_quotation_items_tender',
  'CREATE INDEX idx_approved_quotation_items_tender
     ON public.approved_quotation_items (tender_id)
     WHERE include = true'
);

SELECT public._create_perf_index_if_exists(
  'public', 'tenders', 'idx_tenders_created_at',
  'CREATE INDEX idx_tenders_created_at ON public.tenders (created_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'tenders', 'idx_tenders_status_created',
  'CREATE INDEX idx_tenders_status_created ON public.tenders (status, created_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'tender_contacts', 'idx_tender_contacts_tender_id',
  'CREATE INDEX idx_tender_contacts_tender_id ON public.tender_contacts (tender_id)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'quotations', 'idx_quotations_tender_id',
  'CREATE INDEX idx_quotations_tender_id ON public.quotations (tender_id)'
);

-- ---------------------------------------------------------------------------
-- public — marketing (no indexes in timestamped migrations; heavy list/report use)
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'public', 'marketing_enquiries', 'idx_marketing_enquiries_created_at',
  'CREATE INDEX idx_marketing_enquiries_created_at
     ON public.marketing_enquiries (created_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_enquiries', 'idx_marketing_enquiries_enquiry_date',
  'CREATE INDEX idx_marketing_enquiries_enquiry_date
     ON public.marketing_enquiries (enquiry_date DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_enquiries', 'idx_marketing_enquiries_client_id',
  'CREATE INDEX idx_marketing_enquiries_client_id
     ON public.marketing_enquiries (client_id)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_quotations', 'idx_marketing_quotations_created_at',
  'CREATE INDEX idx_marketing_quotations_created_at
     ON public.marketing_quotations (created_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_quotations', 'idx_marketing_quotations_status_created',
  'CREATE INDEX idx_marketing_quotations_status_created
     ON public.marketing_quotations (status, created_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_quotations', 'idx_marketing_quotations_enquiry_id',
  'CREATE INDEX idx_marketing_quotations_enquiry_id
     ON public.marketing_quotations (enquiry_id)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_quotations', 'idx_marketing_quotations_quotation_date',
  'CREATE INDEX idx_marketing_quotations_quotation_date
     ON public.marketing_quotations (quotation_date DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_costing_sheets', 'idx_marketing_costing_sheets_quotation',
  'CREATE INDEX idx_marketing_costing_sheets_quotation
     ON public.marketing_costing_sheets (quotation_id, created_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_follow_ups', 'idx_marketing_follow_ups_date',
  'CREATE INDEX idx_marketing_follow_ups_date
     ON public.marketing_follow_ups (follow_up_date DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_contracts', 'idx_marketing_contracts_po_date',
  'CREATE INDEX idx_marketing_contracts_po_date
     ON public.marketing_contracts (po_date DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'marketing_products', 'idx_marketing_products_active_name',
  'CREATE INDEX idx_marketing_products_active_name
     ON public.marketing_products (is_active, product_name)
     WHERE is_active = true'
);

-- ---------------------------------------------------------------------------
-- public — manpower + activity log
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'public', 'manpower_enquiries', 'idx_manpower_enquiries_status_created',
  'CREATE INDEX idx_manpower_enquiries_status_created
     ON public.manpower_enquiries (status, created_at DESC)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'manpower_enquiries', 'idx_manpower_enquiries_due_status',
  'CREATE INDEX idx_manpower_enquiries_due_status
     ON public.manpower_enquiries (due_date, status)'
);

SELECT public._create_perf_index_if_exists(
  'public', 'erp_activity_log', 'idx_erp_activity_log_created_at',
  'CREATE INDEX idx_erp_activity_log_created_at
     ON public.erp_activity_log (created_at DESC)'
);

-- ---------------------------------------------------------------------------
-- public — HR payroll child tables (payroll_run_id lookups)
-- ---------------------------------------------------------------------------
DO $payroll$
DECLARE
  t text;
  tables text[] := ARRAY[
    'hr_payroll_run_employees',
    'hr_payroll_employee_monthly_summary',
    'hr_payroll_employee_component_values',
    'hr_payroll_pf_details',
    'hr_payroll_esic_details',
    'hr_payroll_pt_details',
    'hr_payroll_tds_details',
    'hr_payroll_payslips',
    'hr_payroll_manual_inputs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    IF public._table_has_column('public', t, 'payroll_run_id') THEN
      PERFORM public._create_perf_index_if_exists(
        'public', t, 'idx_' || t || '_payroll_run',
        format(
          'CREATE INDEX idx_%I_payroll_run ON public.%I (payroll_run_id)',
          t, t
        )
      );
      IF public._table_has_column('public', t, 'employee_master_id') THEN
        PERFORM public._create_perf_index_if_exists(
          'public', t, 'idx_' || t || '_run_employee',
          format(
            'CREATE INDEX idx_%I_run_employee ON public.%I (payroll_run_id, employee_master_id)',
            t, t
          )
        );
      END IF;
    END IF;
  END LOOP;
END $payroll$;

-- ---------------------------------------------------------------------------
-- finance — site-scoped ledger loads
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'finance', 'period_entries', 'idx_finance_period_entries_site_period',
  'CREATE INDEX idx_finance_period_entries_site_period
     ON finance.period_entries (site_id, period_key)'
);

SELECT public._create_perf_index_if_exists(
  'finance', 'budget_revenue_lines', 'idx_finance_budget_revenue_lines_version',
  'CREATE INDEX idx_finance_budget_revenue_lines_version
     ON finance.budget_revenue_lines (budget_version_id)'
);

SELECT public._create_perf_index_if_exists(
  'finance', 'budget_expense_lines', 'idx_finance_budget_expense_lines_version',
  'CREATE INDEX idx_finance_budget_expense_lines_version
     ON finance.budget_expense_lines (budget_version_id)'
);

SELECT public._create_perf_index_if_exists(
  'finance', 'revenue_entry_lines', 'idx_finance_revenue_entry_lines_period',
  'CREATE INDEX idx_finance_revenue_entry_lines_period
     ON finance.revenue_entry_lines (period_entry_id)'
);

SELECT public._create_perf_index_if_exists(
  'finance', 'expense_entry_lines', 'idx_finance_expense_entry_lines_period',
  'CREATE INDEX idx_finance_expense_entry_lines_period
     ON finance.expense_entry_lines (period_entry_id)'
);

SELECT public._create_perf_index_if_exists(
  'finance', 'cost_allocations', 'idx_finance_cost_alloc_site_period',
  'CREATE INDEX idx_finance_cost_alloc_site_period
     ON finance.cost_allocations (site_id, start_period)'
);

-- ---------------------------------------------------------------------------
-- billing — invoice lists (invoice_date already indexed; add status composite)
-- ---------------------------------------------------------------------------
SELECT public._create_perf_index_if_exists(
  'billing', 'invoice', 'idx_billing_invoice_status_date',
  'CREATE INDEX idx_billing_invoice_status_date
     ON billing.invoice (pa_status, invoice_date DESC)'
);

SELECT public._create_perf_index_if_exists(
  'billing', 'po_wo', 'idx_billing_po_wo_status_start',
  'CREATE INDEX idx_billing_po_wo_status_start
     ON billing.po_wo (status, start_date DESC)'
);

-- ---------------------------------------------------------------------------
-- RLS helpers: avoid recursive profiles scans (finance module)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.current_user_has_finance_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR p.team = 'finance'
        OR (p.allowed_modules IS NOT NULL AND p.allowed_modules @> '"finance"'::jsonb)
      )
  ) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IS NULL
      AND p.team IS NULL
      AND (p.allowed_modules IS NULL OR p.allowed_modules = '[]'::jsonb)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- Update planner statistics on hot tables
-- ---------------------------------------------------------------------------
DO $analyze$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'public.admin_attendance_register',
      'public.erp_attendance_punches',
      'public.admin_ifsp_employee_master',
      'public.profiles',
      'public.tenders',
      'public.costing_rows',
      'public.marketing_enquiries',
      'public.marketing_quotations',
      'public.manpower_enquiries',
      'public.erp_activity_log',
      'indus_one.admin_leave_requests',
      'indus_one.admin_leave_attendance_marks',
      'finance.period_entries',
      'billing.invoice'
    ]) AS rel
  LOOP
    IF to_regclass(r.rel) IS NOT NULL THEN
      EXECUTE format('ANALYZE %s', r.rel);
    END IF;
  END LOOP;
END $analyze$;

DROP FUNCTION IF EXISTS public._create_perf_index_if_exists(text, text, text, text);

NOTIFY pgrst, 'reload schema';

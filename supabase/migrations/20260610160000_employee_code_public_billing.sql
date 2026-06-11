-- Denormalize employee_code across public + billing (NOT indus_one).
-- Canonical person key: admin_ifsp_employee_master.employee_code (= profiles.employee_code).
-- UUID columns (user_id, created_by, …) remain for auth/RLS; joins/reporting use employee_code.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_code_for_user(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT NULLIF(
    btrim(
      COALESCE(
        (SELECT p.employee_code FROM public.profiles p WHERE p.id = p_user_id),
        (SELECT m.employee_code FROM public.admin_ifsp_employee_master m WHERE m.user_id = p_user_id)
      )
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.employee_code_for_user(uuid) IS
  'Resolve ERP employee_code from auth user id (profiles first, then employee master).';

CREATE OR REPLACE FUNCTION public.employee_code_for_master(p_master_id bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT NULLIF(btrim(employee_code), '')
  FROM public.admin_ifsp_employee_master
  WHERE id = p_master_id;
$$;

COMMENT ON FUNCTION public.employee_code_for_master(bigint) IS
  'Resolve employee_code from admin_ifsp_employee_master.id.';

CREATE OR REPLACE FUNCTION public._table_has_column(
  p_schema text, p_table text, p_column text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = p_schema
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

CREATE OR REPLACE FUNCTION public._backfill_employee_code_from_user(
  p_schema text,
  p_table text,
  p_user_col text,
  p_code_col text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._table_has_column(p_schema, p_table, p_user_col)
     OR NOT public._table_has_column(p_schema, p_table, p_code_col) THEN
    RETURN;
  END IF;
  EXECUTE format(
    $q$
    UPDATE %I.%I t
    SET %I = public.employee_code_for_user(t.%I)
    WHERE t.%I IS NOT NULL
      AND (t.%I IS NULL OR btrim(t.%I) = '')
    $q$,
    p_schema, p_table, p_code_col, p_user_col, p_user_col, p_code_col, p_code_col
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._backfill_employee_code_from_master(
  p_schema text,
  p_table text,
  p_master_col text,
  p_code_col text DEFAULT 'employee_code'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public._table_has_column(p_schema, p_table, p_master_col)
     OR NOT public._table_has_column(p_schema, p_table, p_code_col) THEN
    RETURN;
  END IF;
  EXECUTE format(
    $q$
    UPDATE %I.%I t
    SET %I = public.employee_code_for_master(t.%I)
    WHERE t.%I IS NOT NULL
      AND (t.%I IS NULL OR btrim(t.%I) = '')
    $q$,
    p_schema, p_table, p_code_col, p_master_col, p_master_col, p_code_col, p_code_col
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- billing schema
-- ---------------------------------------------------------------------------
DO $billing$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'billing' AND table_name = 'invoice'
  ) THEN
    ALTER TABLE billing.invoice
      ADD COLUMN IF NOT EXISTS created_by_employee_code text;
    CREATE INDEX IF NOT EXISTS idx_billing_invoice_created_by_employee_code
      ON billing.invoice (lower(btrim(created_by_employee_code)))
      WHERE created_by_employee_code IS NOT NULL AND btrim(created_by_employee_code) <> '';
    PERFORM public._backfill_employee_code_from_user('billing', 'invoice', 'created_by', 'created_by_employee_code');
    COMMENT ON COLUMN billing.invoice.created_by_employee_code IS
      'Denormalized actor code; use for joins/reporting instead of created_by uuid.';
  END IF;
END $billing$;

-- ---------------------------------------------------------------------------
-- public — HR payroll (subject employee)
-- ---------------------------------------------------------------------------
DO $hr$
DECLARE
  t text;
  master_tables text[] := ARRAY[
    'hr_employee_payroll_profile',
    'hr_payroll_employee_monthly_summary',
    'hr_payroll_employee_component_values',
    'hr_payroll_manual_inputs',
    'hr_payroll_pf_details',
    'hr_payroll_esic_details',
    'hr_payroll_pt_details',
    'hr_payroll_tds_details',
    'hr_payroll_loans',
    'hr_payroll_payslips'
  ];
BEGIN
  FOREACH t IN ARRAY master_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS employee_code text', t);
      PERFORM public._backfill_employee_code_from_master('public', t, 'employee_master_id', 'employee_code');
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (lower(btrim(employee_code))) WHERE employee_code IS NOT NULL AND btrim(employee_code) <> %L',
        'idx_' || t || '_employee_code', t, ''
      );
    END IF;
  END LOOP;

  -- payroll audit actors
  IF public._table_has_column('public', 'hr_site_payroll_formula_sets', 'created_by') THEN
    ALTER TABLE public.hr_site_payroll_formula_sets ADD COLUMN IF NOT EXISTS created_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'hr_site_payroll_formula_sets', 'created_by', 'created_by_employee_code');
  END IF;

  IF public._table_has_column('public', 'hr_payroll_runs', 'created_by') THEN
    ALTER TABLE public.hr_payroll_runs ADD COLUMN IF NOT EXISTS created_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'hr_payroll_runs', 'created_by', 'created_by_employee_code');
  END IF;
  IF public._table_has_column('public', 'hr_payroll_runs', 'finalized_by') THEN
    ALTER TABLE public.hr_payroll_runs ADD COLUMN IF NOT EXISTS finalized_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'hr_payroll_runs', 'finalized_by', 'finalized_by_employee_code');
  END IF;

  IF public._table_has_column('public', 'hr_payroll_manual_inputs', 'created_by') THEN
    ALTER TABLE public.hr_payroll_manual_inputs ADD COLUMN IF NOT EXISTS created_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'hr_payroll_manual_inputs', 'created_by', 'created_by_employee_code');
  END IF;
  IF public._table_has_column('public', 'hr_payroll_manual_inputs', 'approved_by') THEN
    ALTER TABLE public.hr_payroll_manual_inputs ADD COLUMN IF NOT EXISTS approved_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'hr_payroll_manual_inputs', 'approved_by', 'approved_by_employee_code');
  END IF;

  IF public._table_has_column('public', 'hr_payroll_audit_logs', 'actor_id') THEN
    ALTER TABLE public.hr_payroll_audit_logs ADD COLUMN IF NOT EXISTS actor_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'hr_payroll_audit_logs', 'actor_id', 'actor_employee_code');
  END IF;
END $hr$;

-- ---------------------------------------------------------------------------
-- public — AMC
-- ---------------------------------------------------------------------------
DO $amc$
BEGIN
  IF public._table_has_column('public', 'amc_customers', 'created_by') THEN
    ALTER TABLE public.amc_customers ADD COLUMN IF NOT EXISTS created_by_employee_code text;
    ALTER TABLE public.amc_customers ADD COLUMN IF NOT EXISTS updated_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_customers', 'created_by', 'created_by_employee_code');
    PERFORM public._backfill_employee_code_from_user('public', 'amc_customers', 'updated_by', 'updated_by_employee_code');
  END IF;

  IF public._table_has_column('public', 'amc_contracts', 'coordinator_employee_id') THEN
    ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS coordinator_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_contracts', 'coordinator_employee_id', 'coordinator_employee_code');
  END IF;
  IF public._table_has_column('public', 'amc_contracts', 'created_by') THEN
    ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS created_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_contracts', 'created_by', 'created_by_employee_code');
  END IF;
  IF public._table_has_column('public', 'amc_contracts', 'updated_by') THEN
    ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS updated_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_contracts', 'updated_by', 'updated_by_employee_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amc_contract_sites') THEN
    ALTER TABLE public.amc_contract_sites ADD COLUMN IF NOT EXISTS assigned_engineer_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_contract_sites', 'assigned_engineer_id', 'assigned_engineer_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amc_pm_schedules') THEN
    ALTER TABLE public.amc_pm_schedules ADD COLUMN IF NOT EXISTS assigned_engineer_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_pm_schedules', 'assigned_engineer_id', 'assigned_engineer_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amc_complaints') THEN
    ALTER TABLE public.amc_complaints ADD COLUMN IF NOT EXISTS assigned_engineer_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_complaints', 'assigned_engineer_id', 'assigned_engineer_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amc_service_visits') THEN
    ALTER TABLE public.amc_service_visits ADD COLUMN IF NOT EXISTS engineer_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_service_visits', 'engineer_id', 'engineer_employee_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amc_technician_allocations') THEN
    ALTER TABLE public.amc_technician_allocations ADD COLUMN IF NOT EXISTS technician_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_technician_allocations', 'technician_id', 'technician_employee_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amc_alerts') THEN
    ALTER TABLE public.amc_alerts ADD COLUMN IF NOT EXISTS assigned_to_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_alerts', 'assigned_to', 'assigned_to_employee_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'amc_activity_logs') THEN
    ALTER TABLE public.amc_activity_logs ADD COLUMN IF NOT EXISTS actor_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'amc_activity_logs', 'actor_id', 'actor_employee_code');
  END IF;
END $amc$;

-- ---------------------------------------------------------------------------
-- public — operations fleet, manpower, software subscriptions
-- ---------------------------------------------------------------------------
DO $misc$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manpower_enquiries') THEN
    ALTER TABLE public.manpower_enquiries ADD COLUMN IF NOT EXISTS user_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'manpower_enquiries', 'user_id', 'user_employee_code');
  END IF;

  IF public._table_has_column('public', 'software_subscriptions', 'created_by') THEN
    ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS created_by_employee_code text;
    ALTER TABLE public.software_subscriptions ADD COLUMN IF NOT EXISTS updated_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'software_subscriptions', 'created_by', 'created_by_employee_code');
    PERFORM public._backfill_employee_code_from_user('public', 'software_subscriptions', 'updated_by', 'updated_by_employee_code');
  END IF;

  IF public._table_has_column('public', 'software_subscription_invoice_files', 'uploaded_by') THEN
    ALTER TABLE public.software_subscription_invoice_files ADD COLUMN IF NOT EXISTS uploaded_by_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'software_subscription_invoice_files', 'uploaded_by', 'uploaded_by_employee_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operations_fire_tender_vehicle_trips') THEN
    ALTER TABLE public.operations_fire_tender_vehicle_trips ADD COLUMN IF NOT EXISTS user_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'operations_fire_tender_vehicle_trips', 'user_id', 'user_employee_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operations_fire_tender_vehicle_documents') THEN
    ALTER TABLE public.operations_fire_tender_vehicle_documents ADD COLUMN IF NOT EXISTS user_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'operations_fire_tender_vehicle_documents', 'user_id', 'user_employee_code');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'operations_fire_tender_vehicle_maintenance') THEN
    ALTER TABLE public.operations_fire_tender_vehicle_maintenance ADD COLUMN IF NOT EXISTS user_employee_code text;
    PERFORM public._backfill_employee_code_from_user('public', 'operations_fire_tender_vehicle_maintenance', 'user_id', 'user_employee_code');
  END IF;
END $misc$;

-- ---------------------------------------------------------------------------
-- public — fire tender / marketing (legacy tables; skip if absent)
-- ---------------------------------------------------------------------------
DO $legacy$
DECLARE
  rec record;
  t text;
BEGIN
  FOR rec IN
    SELECT *
    FROM (VALUES
      ('main_components', 'user_id', 'user_employee_code'),
      ('price_master', 'user_id', 'user_employee_code'),
      ('tenders', 'user_id', 'user_employee_code'),
      ('quotations', 'user_id', 'user_employee_code'),
      ('costing_summary', 'user_id', 'user_employee_code'),
      ('costing_rows', 'user_id', 'user_employee_code'),
      ('approved_quotation_items', 'user_id', 'user_employee_code'),
      ('audit_logs', 'user_id', 'user_employee_code'),
      ('price_master_versions', 'user_id', 'user_employee_code'),
      ('accessories', 'user_id', 'user_employee_code'),
      ('costing_accessories', 'user_id', 'user_employee_code'),
      ('tender_contacts', 'user_id', 'user_employee_code'),
      ('marketing_enquiries', 'assigned_to', 'assigned_to_employee_code'),
      ('marketing_site_visits', 'created_by', 'created_by_employee_code'),
      ('marketing_quotation_revisions', 'created_by', 'created_by_employee_code'),
      ('marketing_notifications', 'created_by', 'created_by_employee_code'),
      ('marketing_mail_templates', 'created_by', 'created_by_employee_code')
    ) AS v(tbl, user_col, code_col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = rec.tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I text', rec.tbl, rec.code_col);
      PERFORM public._backfill_employee_code_from_user('public', rec.tbl, rec.user_col, rec.code_col);
    END IF;
  END LOOP;

  -- marketing tables with updated_by
  FOREACH t IN ARRAY ARRAY['marketing_site_visits', 'marketing_quotation_revisions', 'marketing_mail_templates'] LOOP
    IF public._table_has_column('public', t, 'updated_by') THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by_employee_code text', t);
      PERFORM public._backfill_employee_code_from_user('public', t, 'updated_by', 'updated_by_employee_code');
    END IF;
  END LOOP;
END $legacy$;

-- HR Payroll / Salary Management engine (v1)
-- Integrates with admin_ifsp_employee_master + attendance present days

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Payroll sites (HR operational sites — not AMC contract sites)
CREATE TABLE IF NOT EXISTS public.hr_payroll_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_code text NOT NULL,
  site_name text NOT NULL,
  state text,
  city text,
  payroll_applicable boolean NOT NULL DEFAULT true,
  constants_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rounding_json jsonb NOT NULL DEFAULT '{"mode":"round","decimals":0}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_code)
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_sites_active ON public.hr_payroll_sites (is_active, site_name);

-- Per-employee payroll profile (links People Master → site + salary base)
CREATE TABLE IF NOT EXISTS public.hr_employee_payroll_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  payroll_site_id uuid REFERENCES public.hr_payroll_sites(id) ON DELETE SET NULL,
  payroll_state text,
  gross_monthly numeric(14,2) NOT NULL DEFAULT 0,
  ctc_annual numeric(14,2) NOT NULL DEFAULT 0,
  pf_applicable boolean NOT NULL DEFAULT true,
  esic_applicable boolean NOT NULL DEFAULT true,
  pt_applicable boolean NOT NULL DEFAULT true,
  tds_applicable boolean NOT NULL DEFAULT true,
  tax_regime text NOT NULL DEFAULT 'new',
  pan text,
  uan text,
  esic_no text,
  pf_no text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_master_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_payroll_profile_site ON public.hr_employee_payroll_profile (payroll_site_id);

-- Salary component master
CREATE TABLE IF NOT EXISTS public.hr_payroll_components_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_code text NOT NULL UNIQUE,
  component_name text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('earning', 'deduction', 'contribution', 'employer_contribution')),
  sort_order integer NOT NULL DEFAULT 0,
  is_formula_driven boolean NOT NULL DEFAULT true,
  is_manual_allowed boolean NOT NULL DEFAULT false,
  include_in_pf_wages boolean NOT NULL DEFAULT false,
  include_in_esic_wages boolean NOT NULL DEFAULT false,
  include_in_pt_wages boolean NOT NULL DEFAULT false,
  include_in_taxable_income boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Site formula sets (versioned)
CREATE TABLE IF NOT EXISTS public.hr_site_payroll_formula_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_site_id uuid NOT NULL REFERENCES public.hr_payroll_sites(id) ON DELETE CASCADE,
  version_no integer NOT NULL DEFAULT 1,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_site_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_hr_site_formula_sets_site ON public.hr_site_payroll_formula_sets (payroll_site_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.hr_site_payroll_formula_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_set_id uuid NOT NULL REFERENCES public.hr_site_payroll_formula_sets(id) ON DELETE CASCADE,
  component_code text NOT NULL,
  formula_text text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formula_set_id, component_code)
);

-- Payroll runs
CREATE TABLE IF NOT EXISTS public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'preview', 'finalized', 'cancelled')),
  label text,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  finalized_by uuid REFERENCES auth.users(id),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_month, status) DEFERRABLE INITIALLY DEFERRED
);

-- Drop overly strict unique — allow one finalized per month via partial index
ALTER TABLE public.hr_payroll_runs DROP CONSTRAINT IF EXISTS hr_payroll_runs_payroll_month_status_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_payroll_runs_one_finalized_month
  ON public.hr_payroll_runs (payroll_month)
  WHERE status = 'finalized';

CREATE TABLE IF NOT EXISTS public.hr_payroll_run_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  payroll_site_id uuid REFERENCES public.hr_payroll_sites(id),
  employee_code text,
  present_days numeric(8,2) NOT NULL DEFAULT 0,
  month_days integer NOT NULL DEFAULT 0,
  paid_days numeric(8,2) NOT NULL DEFAULT 0,
  attendance_source text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'computed', 'exception', 'skipped')),
  exceptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_employee_monthly_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  payroll_month date NOT NULL,
  gross numeric(14,2) NOT NULL DEFAULT 0,
  total_earnings numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_pay numeric(14,2) NOT NULL DEFAULT 0,
  pf_employee numeric(14,2) NOT NULL DEFAULT 0,
  pf_employer numeric(14,2) NOT NULL DEFAULT 0,
  esic_employee numeric(14,2) NOT NULL DEFAULT 0,
  esic_employer numeric(14,2) NOT NULL DEFAULT 0,
  pt_amount numeric(14,2) NOT NULL DEFAULT 0,
  tds_amount numeric(14,2) NOT NULL DEFAULT 0,
  loan_recovery numeric(14,2) NOT NULL DEFAULT 0,
  manual_additions numeric(14,2) NOT NULL DEFAULT 0,
  manual_deductions numeric(14,2) NOT NULL DEFAULT 0,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_employee_component_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  component_code text NOT NULL,
  monthly_value numeric(14,2) NOT NULL DEFAULT 0,
  prorated_value numeric(14,2) NOT NULL DEFAULT 0,
  final_value numeric(14,2) NOT NULL DEFAULT 0,
  formula_text text,
  is_manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id, component_code)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_manual_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  payroll_month date NOT NULL,
  input_type text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  remarks text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_manual_inputs_month ON public.hr_payroll_manual_inputs (payroll_month, employee_master_id);

CREATE TABLE IF NOT EXISTS public.hr_payroll_pf_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  uan text,
  pf_wages numeric(14,2) NOT NULL DEFAULT 0,
  employee_contribution numeric(14,2) NOT NULL DEFAULT 0,
  employer_contribution numeric(14,2) NOT NULL DEFAULT 0,
  eps_contribution numeric(14,2) NOT NULL DEFAULT 0,
  is_capped boolean NOT NULL DEFAULT true,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_esic_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  esic_no text,
  esic_wages numeric(14,2) NOT NULL DEFAULT 0,
  employee_contribution numeric(14,2) NOT NULL DEFAULT 0,
  employer_contribution numeric(14,2) NOT NULL DEFAULT 0,
  threshold_applied numeric(14,2) NOT NULL DEFAULT 21000,
  is_eligible boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_pt_state_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,
  state_name text NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  slabs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_pt_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  state_code text,
  pt_wages numeric(14,2) NOT NULL DEFAULT 0,
  pt_amount numeric(14,2) NOT NULL DEFAULT 0,
  rule_id uuid REFERENCES public.hr_payroll_pt_state_rules(id),
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_tds_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regime text NOT NULL DEFAULT 'new',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  slabs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  cess_rate numeric(8,4) NOT NULL DEFAULT 0.04,
  standard_deduction numeric(14,2) NOT NULL DEFAULT 75000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_tds_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  pan text,
  taxable_income_annual numeric(14,2) NOT NULL DEFAULT 0,
  monthly_tds numeric(14,2) NOT NULL DEFAULT 0,
  regime text NOT NULL DEFAULT 'new',
  is_manual_override boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  loan_type text NOT NULL DEFAULT 'loan',
  principal numeric(14,2) NOT NULL DEFAULT 0,
  balance_outstanding numeric(14,2) NOT NULL DEFAULT 0,
  installment_amount numeric(14,2) NOT NULL DEFAULT 0,
  start_month date,
  end_month date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'hold')),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_loan_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.hr_payroll_loans(id) ON DELETE CASCADE,
  payroll_run_id uuid REFERENCES public.hr_payroll_runs(id) ON DELETE SET NULL,
  payroll_month date NOT NULL,
  recovery_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  payslip_number text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_master_id)
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default components
INSERT INTO public.hr_payroll_components_master (component_code, component_name, component_type, sort_order, include_in_pf_wages, include_in_esic_wages, include_in_pt_wages, include_in_taxable_income)
VALUES
  ('GROSS', 'Gross Wages', 'earning', 10, false, true, true, true),
  ('BASIC', 'Basic', 'earning', 20, true, true, true, true),
  ('HRA', 'HRA', 'earning', 30, false, true, true, true),
  ('SPECIAL_ALLOWANCE', 'Special Allowance', 'earning', 40, false, true, true, true),
  ('PF_EMP', 'PF (Employee)', 'deduction', 100, false, false, false, false),
  ('ESIC_EMP', 'ESIC (Employee)', 'deduction', 110, false, false, false, false),
  ('PT', 'Professional Tax', 'deduction', 120, false, false, false, false),
  ('TDS', 'TDS', 'deduction', 130, false, false, false, false),
  ('LOAN', 'Loan Recovery', 'deduction', 140, false, false, false, false),
  ('NET', 'Net Pay', 'earning', 200, false, false, false, false)
ON CONFLICT (component_code) DO NOTHING;

-- Default PT slab (Maharashtra-style placeholder — configurable)
INSERT INTO public.hr_payroll_pt_state_rules (state_code, state_name, slabs_json)
SELECT 'MH', 'Maharashtra', '[{"min":0,"max":7500,"amount":0},{"min":7501,"max":10000,"amount":175},{"min":10001,"max":null,"amount":200}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.hr_payroll_pt_state_rules WHERE state_code = 'MH');

-- Default TDS new regime slabs (FY placeholder)
INSERT INTO public.hr_payroll_tds_rules (regime, slabs_json, standard_deduction)
SELECT 'new', '[{"min":0,"max":300000,"rate":0},{"min":300001,"max":700000,"rate":0.05},{"min":700001,"max":1000000,"rate":0.10},{"min":1000001,"max":1200000,"rate":0.15},{"min":1200001,"max":1500000,"rate":0.20},{"min":1500001,"max":null,"rate":0.30}]'::jsonb, 75000
WHERE NOT EXISTS (SELECT 1 FROM public.hr_payroll_tds_rules WHERE regime = 'new' AND is_active = true);

-- RLS
ALTER TABLE public.hr_payroll_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employee_payroll_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_components_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_site_payroll_formula_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_site_payroll_formula_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_run_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_employee_monthly_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_employee_component_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_manual_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_pf_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_esic_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_pt_state_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_pt_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_tds_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_tds_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_loan_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_payroll_sites','hr_employee_payroll_profile','hr_payroll_components_master',
    'hr_site_payroll_formula_sets','hr_site_payroll_formula_components',
    'hr_payroll_runs','hr_payroll_run_employees','hr_payroll_employee_monthly_summary',
    'hr_payroll_employee_component_values','hr_payroll_manual_inputs',
    'hr_payroll_pf_details','hr_payroll_esic_details','hr_payroll_pt_state_rules',
    'hr_payroll_pt_details','hr_payroll_tds_rules','hr_payroll_tds_details',
    'hr_payroll_loans','hr_payroll_loan_recoveries','hr_payroll_payslips','hr_payroll_audit_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS hr_payroll_auth_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY hr_payroll_auth_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

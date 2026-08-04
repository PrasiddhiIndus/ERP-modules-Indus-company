-- =============================================================================
-- Admin Salary (Salary Master + Salary Processing)
-- Schema: admin_salary
--
-- Separate from hr_payroll_* (HR engine). Matches Admin Ops Salary Admin workflow:
--   1) Salary Master — Gross-master CTC per employee (current + revisions)
--   2) Salary Processing — monthly pay runs with per-employee lines
--
-- App access: supabase.schema('admin_salary').from('structures'|...)
-- Supabase Dashboard → Settings → API → Exposed schemas: add admin_salary
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS admin_salary;

COMMENT ON SCHEMA admin_salary IS
  'Admin Ops Salary Admin: CTC master (structures/revisions) and monthly processing runs/lines.';

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_salary.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Access helper — email allowlist only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_salary.current_user_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $salary_access$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(btrim(coalesce(p.email, ''))) IN (
        'rahul.ifspl@gmail.com',
        'bency@indusfire.com',
        'latha@indusfire.com'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) IN (
    'rahul.ifspl@gmail.com',
    'bency@indusfire.com',
    'latha@indusfire.com'
  );
$salary_access$;

COMMENT ON FUNCTION admin_salary.current_user_has_access() IS
  'Salary Admin allowlist: rahul.ifspl@gmail.com, bency@indusfire.com, latha@indusfire.com only.';

GRANT EXECUTE ON FUNCTION admin_salary.current_user_has_access() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) salary master — current CTC structure (one row per employee)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_salary.structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  -- UX / formula modes
  employee_level text NOT NULL DEFAULT 'office'
    CHECK (employee_level IN ('office', 'helper')),
  basic_mode text NOT NULL DEFAULT 'auto'
    CHECK (basic_mode IN ('auto', 'custom')),
  hra_mode text NOT NULL DEFAULT 'percent_40'
    CHECK (hra_mode IN ('percent_40', 'custom', 'auto')),
  emp_esic_mode text NOT NULL DEFAULT 'auto'
    CHECK (emp_esic_mode IN ('auto', 'custom')),
  er_esic_mode text NOT NULL DEFAULT 'auto'
    CHECK (er_esic_mode IN ('auto', 'custom')),

  -- Part A (monthly, whole rupees in app)
  gross_monthly numeric(14,2),
  basic_monthly numeric(14,2),
  hra_monthly numeric(14,2),
  special_allowance_monthly numeric(14,2),

  emp_pf_monthly numeric(14,2),
  pt_monthly numeric(14,2),
  emp_esic_monthly numeric(14,2),
  emp_esic_applicable boolean NOT NULL DEFAULT false,
  take_home_monthly numeric(14,2),

  -- ESIC settings (eligibility on full Gross)
  esic_enabled boolean NOT NULL DEFAULT true,
  esic_ceiling numeric(14,2) NOT NULL DEFAULT 41999,
  esic_emp_rate_pct numeric(8,4) NOT NULL DEFAULT 0.75,
  esic_er_rate_pct numeric(8,4) NOT NULL DEFAULT 3.25,
  esic_eligible boolean NOT NULL DEFAULT false,

  -- Part B
  er_pf_monthly numeric(14,2),
  er_esic_monthly numeric(14,2),
  er_esic_applicable boolean NOT NULL DEFAULT false,
  gratuity_monthly numeric(14,2),
  leave_encash_monthly numeric(14,2),
  mediclaim_enabled boolean NOT NULL DEFAULT false,
  mediclaim_monthly numeric(14,2),
  lic_enabled boolean NOT NULL DEFAULT false,
  lic_monthly numeric(14,2),
  bonus_monthly numeric(14,2),
  total_b_monthly numeric(14,2),

  -- CTC totals
  ctc_monthly numeric(14,2),
  ctc_annual numeric(14,2),

  -- Lifecycle
  declared boolean NOT NULL DEFAULT false,
  wef_date date,
  revision_reason text,
  revision_count integer NOT NULL DEFAULT 0,

  -- Optional employee snapshot at save (display / audit)
  date_of_birth date,
  date_of_joining date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT admin_salary_structures_employee_unique UNIQUE (employee_master_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_structures_declared
  ON admin_salary.structures (declared)
  WHERE declared = true;

CREATE INDEX IF NOT EXISTS idx_admin_salary_structures_wef
  ON admin_salary.structures (wef_date DESC NULLS LAST);

DROP TRIGGER IF EXISTS trg_admin_salary_structures_updated_at ON admin_salary.structures;
CREATE TRIGGER trg_admin_salary_structures_updated_at
  BEFORE UPDATE ON admin_salary.structures
  FOR EACH ROW EXECUTE FUNCTION admin_salary.set_updated_at();

COMMENT ON TABLE admin_salary.structures IS
  'Current salary master CTC per employee (Gross master → Basic / HRA / Special + Part B).';

-- ---------------------------------------------------------------------------
-- 2) salary master — archived revisions (newest first by revised_at)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_salary.structure_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL
    REFERENCES admin_salary.structures(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  revision_no integer NOT NULL,
  revised_at timestamptz NOT NULL DEFAULT now(),
  wef_date date,
  revision_reason text,
  superseded_wef date,

  -- Full snapshot of the superseded structure (same money / mode fields)
  employee_level text,
  basic_mode text,
  hra_mode text,
  emp_esic_mode text,
  er_esic_mode text,
  gross_monthly numeric(14,2),
  basic_monthly numeric(14,2),
  hra_monthly numeric(14,2),
  special_allowance_monthly numeric(14,2),
  emp_pf_monthly numeric(14,2),
  pt_monthly numeric(14,2),
  emp_esic_monthly numeric(14,2),
  emp_esic_applicable boolean,
  take_home_monthly numeric(14,2),
  esic_enabled boolean,
  esic_ceiling numeric(14,2),
  esic_emp_rate_pct numeric(8,4),
  esic_er_rate_pct numeric(8,4),
  esic_eligible boolean,
  er_pf_monthly numeric(14,2),
  er_esic_monthly numeric(14,2),
  er_esic_applicable boolean,
  gratuity_monthly numeric(14,2),
  leave_encash_monthly numeric(14,2),
  mediclaim_enabled boolean,
  mediclaim_monthly numeric(14,2),
  lic_enabled boolean,
  lic_monthly numeric(14,2),
  bonus_monthly numeric(14,2),
  total_b_monthly numeric(14,2),
  ctc_monthly numeric(14,2),
  ctc_annual numeric(14,2),
  declared boolean,
  date_of_birth date,
  date_of_joining date,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_structure_revisions_unique
    UNIQUE (employee_master_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_revisions_employee
  ON admin_salary.structure_revisions (employee_master_id, revised_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_salary_revisions_structure
  ON admin_salary.structure_revisions (structure_id, revision_no DESC);

COMMENT ON TABLE admin_salary.structure_revisions IS
  'Archived CTC snapshots when Salary Master is revised (W.E.F. history).';

-- ---------------------------------------------------------------------------
-- 3) salary processing — monthly run header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_salary.processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- First day of month (e.g. 2026-08-01); UI also uses month_key YYYY-MM
  pay_month date NOT NULL,
  month_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'cancelled')),
  label text,
  total_days integer NOT NULL DEFAULT 26,
  employee_count integer NOT NULL DEFAULT 0,
  declared_count integer NOT NULL DEFAULT 0,
  total_gross_wages numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,

  CONSTRAINT admin_salary_processing_runs_month_key_check
    CHECK (month_key ~ '^\d{4}-\d{2}$')
);

-- One draft per month; one finalized per month
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_salary_runs_one_draft_month
  ON admin_salary.processing_runs (month_key)
  WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_salary_runs_one_finalized_month
  ON admin_salary.processing_runs (month_key)
  WHERE status = 'finalized';

CREATE INDEX IF NOT EXISTS idx_admin_salary_runs_pay_month
  ON admin_salary.processing_runs (pay_month DESC);

DROP TRIGGER IF EXISTS trg_admin_salary_runs_updated_at ON admin_salary.processing_runs;
CREATE TRIGGER trg_admin_salary_runs_updated_at
  BEFORE UPDATE ON admin_salary.processing_runs
  FOR EACH ROW EXECUTE FUNCTION admin_salary.set_updated_at();

COMMENT ON TABLE admin_salary.processing_runs IS
  'Monthly salary processing run (draft → finalized) for Admin Salary Processing.';

-- ---------------------------------------------------------------------------
-- 4) salary processing — per-employee line (earnings + deductions + bank)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_salary.processing_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES admin_salary.processing_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  -- Denormalized identity / bank for export
  employee_code text,
  employee_name text,
  designation text,
  account_no text,
  ifsc text,
  confirmation_date date,

  -- CTC snapshot used for this line (do not re-derive Part A)
  structure_id uuid REFERENCES admin_salary.structures(id) ON DELETE SET NULL,
  declared boolean NOT NULL DEFAULT false,
  salary_rate numeric(14,2),
  basic_full numeric(14,2),
  hra_full numeric(14,2),
  special_full numeric(14,2),

  -- Attendance / inputs
  present_days numeric(8,2) NOT NULL DEFAULT 26,
  total_days integer NOT NULL DEFAULT 26,
  pf_basic numeric(14,2),
  pt_amount numeric(14,2),
  loan numeric(14,2) NOT NULL DEFAULT 0,
  sal_adv numeric(14,2) NOT NULL DEFAULT 0,
  unpaid_paid numeric(14,2) NOT NULL DEFAULT 0,
  tds numeric(14,2) NOT NULL DEFAULT 0,

  -- Computed earnings / deductions
  pf_earned_basic numeric(14,2),
  basic_earned numeric(14,2),
  hra_earned numeric(14,2),
  special_allowance numeric(14,2),
  gross_wages numeric(14,2),
  emp_pf numeric(14,2),
  emp_esic numeric(14,2),
  total_ded numeric(14,2),
  net_salary numeric(14,2),
  bank_amount numeric(14,2),

  line_status text NOT NULL DEFAULT 'open'
    CHECK (line_status IN ('open', 'locked', 'skipped')),
  overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_json jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_processing_lines_unique
    UNIQUE (run_id, employee_master_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_lines_run
  ON admin_salary.processing_lines (run_id);

CREATE INDEX IF NOT EXISTS idx_admin_salary_lines_employee
  ON admin_salary.processing_lines (employee_master_id, run_id);

CREATE INDEX IF NOT EXISTS idx_admin_salary_lines_code
  ON admin_salary.processing_lines (employee_code);

DROP TRIGGER IF EXISTS trg_admin_salary_lines_updated_at ON admin_salary.processing_lines;
CREATE TRIGGER trg_admin_salary_lines_updated_at
  BEFORE UPDATE ON admin_salary.processing_lines
  FOR EACH ROW EXECUTE FUNCTION admin_salary.set_updated_at();

COMMENT ON TABLE admin_salary.processing_lines IS
  'Per-employee monthly salary sheet line for a processing run.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA admin_salary TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA admin_salary
  TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA admin_salary
  TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA admin_salary
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA admin_salary
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE admin_salary.structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_salary.structure_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_salary.processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_salary.processing_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_structures_all ON admin_salary.structures;
CREATE POLICY admin_salary_structures_all ON admin_salary.structures
  FOR ALL TO authenticated
  USING (admin_salary.current_user_has_access())
  WITH CHECK (admin_salary.current_user_has_access());

DROP POLICY IF EXISTS admin_salary_revisions_all ON admin_salary.structure_revisions;
CREATE POLICY admin_salary_revisions_all ON admin_salary.structure_revisions
  FOR ALL TO authenticated
  USING (admin_salary.current_user_has_access())
  WITH CHECK (admin_salary.current_user_has_access());

DROP POLICY IF EXISTS admin_salary_runs_all ON admin_salary.processing_runs;
CREATE POLICY admin_salary_runs_all ON admin_salary.processing_runs
  FOR ALL TO authenticated
  USING (admin_salary.current_user_has_access())
  WITH CHECK (admin_salary.current_user_has_access());

DROP POLICY IF EXISTS admin_salary_lines_all ON admin_salary.processing_lines;
CREATE POLICY admin_salary_lines_all ON admin_salary.processing_lines
  FOR ALL TO authenticated
  USING (admin_salary.current_user_has_access())
  WITH CHECK (admin_salary.current_user_has_access());

-- service_role bypasses RLS by default; keep explicit grants above.

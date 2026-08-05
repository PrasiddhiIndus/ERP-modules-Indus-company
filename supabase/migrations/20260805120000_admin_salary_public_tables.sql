-- =============================================================================
-- Admin Salary — public tables (PostgREST-safe)
--
-- Custom schema `admin_salary` is often missing from Supabase "Exposed schemas",
-- which makes Salary Master CTC save fail with PGRST106 / schema errors.
-- These public.admin_salary_* tables are always reachable via the API.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_salary_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_salary_user_has_access()
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

COMMENT ON FUNCTION public.admin_salary_user_has_access() IS
  'Salary Admin allowlist: rahul.ifspl@gmail.com, bency@indusfire.com, latha@indusfire.com only.';

GRANT EXECUTE ON FUNCTION public.admin_salary_user_has_access() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Current CTC structure
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

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
  leave_encash_mode text NOT NULL DEFAULT 'auto'
    CHECK (leave_encash_mode IN ('auto', 'custom')),

  gross_monthly numeric(14,2),
  basic_monthly numeric(14,2),
  hra_monthly numeric(14,2),
  special_allowance_monthly numeric(14,2),

  emp_pf_monthly numeric(14,2),
  pt_monthly numeric(14,2),
  emp_esic_monthly numeric(14,2),
  emp_esic_applicable boolean NOT NULL DEFAULT false,
  take_home_monthly numeric(14,2),

  esic_enabled boolean NOT NULL DEFAULT true,
  esic_ceiling numeric(14,2) NOT NULL DEFAULT 41999,
  esic_emp_rate_pct numeric(8,4) NOT NULL DEFAULT 0.75,
  esic_er_rate_pct numeric(8,4) NOT NULL DEFAULT 3.25,
  esic_eligible boolean NOT NULL DEFAULT false,

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

  ctc_monthly numeric(14,2),
  ctc_annual numeric(14,2),

  declared boolean NOT NULL DEFAULT false,
  wef_date date,
  revision_reason text,
  revision_count integer NOT NULL DEFAULT 0,

  date_of_birth date,
  date_of_joining date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT admin_salary_structures_pub_employee_unique UNIQUE (employee_master_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_structures_pub_declared
  ON public.admin_salary_structures (declared)
  WHERE declared = true;

CREATE INDEX IF NOT EXISTS idx_admin_salary_structures_pub_wef
  ON public.admin_salary_structures (wef_date DESC NULLS LAST);

DROP TRIGGER IF EXISTS trg_admin_salary_structures_pub_updated_at ON public.admin_salary_structures;
CREATE TRIGGER trg_admin_salary_structures_pub_updated_at
  BEFORE UPDATE ON public.admin_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

COMMENT ON TABLE public.admin_salary_structures IS
  'Salary Master current CTC per employee (public API table).';

-- ---------------------------------------------------------------------------
-- 2) Revisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_structure_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL
    REFERENCES public.admin_salary_structures(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  revision_no integer NOT NULL,
  revised_at timestamptz NOT NULL DEFAULT now(),
  wef_date date,
  revision_reason text,
  superseded_wef date,

  employee_level text,
  basic_mode text,
  hra_mode text,
  emp_esic_mode text,
  er_esic_mode text,
  leave_encash_mode text,
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

  CONSTRAINT admin_salary_structure_revisions_pub_unique
    UNIQUE (employee_master_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_revisions_pub_employee
  ON public.admin_salary_structure_revisions (employee_master_id, revised_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_salary_revisions_pub_structure
  ON public.admin_salary_structure_revisions (structure_id, revision_no DESC);

-- ---------------------------------------------------------------------------
-- 3) Processing runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

  CONSTRAINT admin_salary_processing_runs_pub_month_key_check
    CHECK (month_key ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_salary_runs_pub_one_draft_month
  ON public.admin_salary_processing_runs (month_key)
  WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_salary_runs_pub_one_finalized_month
  ON public.admin_salary_processing_runs (month_key)
  WHERE status = 'finalized';

CREATE INDEX IF NOT EXISTS idx_admin_salary_runs_pub_pay_month
  ON public.admin_salary_processing_runs (pay_month DESC);

DROP TRIGGER IF EXISTS trg_admin_salary_runs_pub_updated_at ON public.admin_salary_processing_runs;
CREATE TRIGGER trg_admin_salary_runs_pub_updated_at
  BEFORE UPDATE ON public.admin_salary_processing_runs
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Processing lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_processing_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES public.admin_salary_processing_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  employee_code text,
  employee_name text,
  designation text,
  account_no text,
  ifsc text,
  confirmation_date date,

  structure_id uuid REFERENCES public.admin_salary_structures(id) ON DELETE SET NULL,
  declared boolean NOT NULL DEFAULT false,
  salary_rate numeric(14,2),
  basic_full numeric(14,2),
  hra_full numeric(14,2),
  special_full numeric(14,2),

  present_days numeric(8,2) NOT NULL DEFAULT 26,
  total_days integer NOT NULL DEFAULT 26,
  pf_basic numeric(14,2),
  pt_amount numeric(14,2),
  loan numeric(14,2) NOT NULL DEFAULT 0,
  sal_adv numeric(14,2) NOT NULL DEFAULT 0,
  unpaid_paid numeric(14,2) NOT NULL DEFAULT 0,
  tds numeric(14,2) NOT NULL DEFAULT 0,

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

  CONSTRAINT admin_salary_processing_lines_pub_unique
    UNIQUE (run_id, employee_master_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_lines_pub_run
  ON public.admin_salary_processing_lines (run_id);

CREATE INDEX IF NOT EXISTS idx_admin_salary_lines_pub_employee
  ON public.admin_salary_processing_lines (employee_master_id, run_id);

CREATE INDEX IF NOT EXISTS idx_admin_salary_lines_pub_code
  ON public.admin_salary_processing_lines (employee_code);

DROP TRIGGER IF EXISTS trg_admin_salary_lines_pub_updated_at ON public.admin_salary_processing_lines;
CREATE TRIGGER trg_admin_salary_lines_pub_updated_at
  BEFORE UPDATE ON public.admin_salary_processing_lines
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

-- ---------------------------------------------------------------------------
-- Copy any rows already saved under schema admin_salary (if present)
-- ---------------------------------------------------------------------------
DO $migrate_legacy$
BEGIN
  IF to_regclass('admin_salary.structures') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'admin_salary'
        AND table_name = 'structures'
        AND column_name = 'leave_encash_mode'
    ) THEN
      EXECUTE $q$
        INSERT INTO public.admin_salary_structures (
          id, employee_master_id, employee_level, basic_mode, hra_mode, emp_esic_mode, er_esic_mode,
          leave_encash_mode, gross_monthly, basic_monthly, hra_monthly, special_allowance_monthly,
          emp_pf_monthly, pt_monthly, emp_esic_monthly, emp_esic_applicable, take_home_monthly,
          esic_enabled, esic_ceiling, esic_emp_rate_pct, esic_er_rate_pct, esic_eligible,
          er_pf_monthly, er_esic_monthly, er_esic_applicable, gratuity_monthly, leave_encash_monthly,
          mediclaim_enabled, mediclaim_monthly, lic_enabled, lic_monthly, bonus_monthly, total_b_monthly,
          ctc_monthly, ctc_annual, declared, wef_date, revision_reason, revision_count,
          date_of_birth, date_of_joining, created_at, updated_at, created_by, updated_by
        )
        SELECT
          id, employee_master_id, employee_level, basic_mode, hra_mode, emp_esic_mode, er_esic_mode,
          coalesce(leave_encash_mode, 'auto'), gross_monthly, basic_monthly, hra_monthly, special_allowance_monthly,
          emp_pf_monthly, pt_monthly, emp_esic_monthly, emp_esic_applicable, take_home_monthly,
          esic_enabled, esic_ceiling, esic_emp_rate_pct, esic_er_rate_pct, esic_eligible,
          er_pf_monthly, er_esic_monthly, er_esic_applicable, gratuity_monthly, leave_encash_monthly,
          mediclaim_enabled, mediclaim_monthly, lic_enabled, lic_monthly, bonus_monthly, total_b_monthly,
          ctc_monthly, ctc_annual, declared, wef_date, revision_reason, revision_count,
          date_of_birth, date_of_joining, created_at, updated_at, created_by, updated_by
        FROM admin_salary.structures
        ON CONFLICT (employee_master_id) DO NOTHING
      $q$;
    ELSE
      EXECUTE $q$
        INSERT INTO public.admin_salary_structures (
          id, employee_master_id, employee_level, basic_mode, hra_mode, emp_esic_mode, er_esic_mode,
          leave_encash_mode, gross_monthly, basic_monthly, hra_monthly, special_allowance_monthly,
          emp_pf_monthly, pt_monthly, emp_esic_monthly, emp_esic_applicable, take_home_monthly,
          esic_enabled, esic_ceiling, esic_emp_rate_pct, esic_er_rate_pct, esic_eligible,
          er_pf_monthly, er_esic_monthly, er_esic_applicable, gratuity_monthly, leave_encash_monthly,
          mediclaim_enabled, mediclaim_monthly, lic_enabled, lic_monthly, bonus_monthly, total_b_monthly,
          ctc_monthly, ctc_annual, declared, wef_date, revision_reason, revision_count,
          date_of_birth, date_of_joining, created_at, updated_at, created_by, updated_by
        )
        SELECT
          id, employee_master_id, employee_level, basic_mode, hra_mode, emp_esic_mode, er_esic_mode,
          'auto', gross_monthly, basic_monthly, hra_monthly, special_allowance_monthly,
          emp_pf_monthly, pt_monthly, emp_esic_monthly, emp_esic_applicable, take_home_monthly,
          esic_enabled, esic_ceiling, esic_emp_rate_pct, esic_er_rate_pct, esic_eligible,
          er_pf_monthly, er_esic_monthly, er_esic_applicable, gratuity_monthly, leave_encash_monthly,
          mediclaim_enabled, mediclaim_monthly, lic_enabled, lic_monthly, bonus_monthly, total_b_monthly,
          ctc_monthly, ctc_annual, declared, wef_date, revision_reason, revision_count,
          date_of_birth, date_of_joining, created_at, updated_at, created_by, updated_by
        FROM admin_salary.structures
        ON CONFLICT (employee_master_id) DO NOTHING
      $q$;
    END IF;
  END IF;

  IF to_regclass('admin_salary.structure_revisions') IS NOT NULL THEN
    INSERT INTO public.admin_salary_structure_revisions (
      id, structure_id, employee_master_id, revision_no, revised_at, wef_date, revision_reason, superseded_wef,
      employee_level, basic_mode, hra_mode, emp_esic_mode, er_esic_mode, leave_encash_mode,
      gross_monthly, basic_monthly, hra_monthly, special_allowance_monthly, emp_pf_monthly, pt_monthly,
      emp_esic_monthly, emp_esic_applicable, take_home_monthly, esic_enabled, esic_ceiling,
      esic_emp_rate_pct, esic_er_rate_pct, esic_eligible, er_pf_monthly, er_esic_monthly, er_esic_applicable,
      gratuity_monthly, leave_encash_monthly, mediclaim_enabled, mediclaim_monthly, lic_enabled, lic_monthly,
      bonus_monthly, total_b_monthly, ctc_monthly, ctc_annual, declared, date_of_birth, date_of_joining,
      snapshot_json, created_at
    )
    SELECT
      r.id, r.structure_id, r.employee_master_id, r.revision_no, r.revised_at, r.wef_date, r.revision_reason, r.superseded_wef,
      r.employee_level, r.basic_mode, r.hra_mode, r.emp_esic_mode, r.er_esic_mode, r.leave_encash_mode,
      r.gross_monthly, r.basic_monthly, r.hra_monthly, r.special_allowance_monthly, r.emp_pf_monthly, r.pt_monthly,
      r.emp_esic_monthly, r.emp_esic_applicable, r.take_home_monthly, r.esic_enabled, r.esic_ceiling,
      r.esic_emp_rate_pct, r.esic_er_rate_pct, r.esic_eligible, r.er_pf_monthly, r.er_esic_monthly, r.er_esic_applicable,
      r.gratuity_monthly, r.leave_encash_monthly, r.mediclaim_enabled, r.mediclaim_monthly, r.lic_enabled, r.lic_monthly,
      r.bonus_monthly, r.total_b_monthly, r.ctc_monthly, r.ctc_annual, r.declared, r.date_of_birth, r.date_of_joining,
      coalesce(r.snapshot_json, '{}'::jsonb), r.created_at
    FROM admin_salary.structure_revisions r
    WHERE EXISTS (
      SELECT 1 FROM public.admin_salary_structures s WHERE s.id = r.structure_id
    )
    ON CONFLICT (employee_master_id, revision_no) DO NOTHING;
  END IF;

  IF to_regclass('admin_salary.processing_runs') IS NOT NULL THEN
    INSERT INTO public.admin_salary_processing_runs (
      id, pay_month, month_key, status, label, total_days, employee_count, declared_count,
      total_gross_wages, total_deductions, total_net, summary_json, notes,
      created_at, updated_at, created_by, updated_by, finalized_by, finalized_at
    )
    SELECT
      id, pay_month, month_key, status, label, total_days, employee_count, declared_count,
      total_gross_wages, total_deductions, total_net, coalesce(summary_json, '{}'::jsonb), notes,
      created_at, updated_at, created_by, updated_by, finalized_by, finalized_at
    FROM admin_salary.processing_runs
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('admin_salary.processing_lines') IS NOT NULL THEN
    INSERT INTO public.admin_salary_processing_lines (
      id, run_id, employee_master_id, employee_code, employee_name, designation, account_no, ifsc,
      confirmation_date, structure_id, declared, salary_rate, basic_full, hra_full, special_full,
      present_days, total_days, pf_basic, pt_amount, loan, sal_adv, unpaid_paid, tds,
      pf_earned_basic, basic_earned, hra_earned, special_allowance, gross_wages, emp_pf, emp_esic,
      total_ded, net_salary, bank_amount, line_status, overrides_json, computed_json, created_at, updated_at
    )
    SELECT
      l.id, l.run_id, l.employee_master_id, l.employee_code, l.employee_name, l.designation, l.account_no, l.ifsc,
      l.confirmation_date, l.structure_id, l.declared, l.salary_rate, l.basic_full, l.hra_full, l.special_full,
      l.present_days, l.total_days, l.pf_basic, l.pt_amount, l.loan, l.sal_adv, l.unpaid_paid, l.tds,
      l.pf_earned_basic, l.basic_earned, l.hra_earned, l.special_allowance, l.gross_wages, l.emp_pf, l.emp_esic,
      l.total_ded, l.net_salary, l.bank_amount, l.line_status,
      coalesce(l.overrides_json, '{}'::jsonb), coalesce(l.computed_json, '{}'::jsonb), l.created_at, l.updated_at
    FROM admin_salary.processing_lines l
    WHERE EXISTS (
      SELECT 1 FROM public.admin_salary_processing_runs r WHERE r.id = l.run_id
    )
    ON CONFLICT (run_id, employee_master_id) DO NOTHING;
  END IF;
END;
$migrate_legacy$;

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_structures TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_structure_revisions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_processing_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_processing_lines TO authenticated, service_role;

ALTER TABLE public.admin_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_structure_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_processing_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_structures_pub_all ON public.admin_salary_structures;
CREATE POLICY admin_salary_structures_pub_all ON public.admin_salary_structures
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_revisions_pub_all ON public.admin_salary_structure_revisions;
CREATE POLICY admin_salary_revisions_pub_all ON public.admin_salary_structure_revisions
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_runs_pub_all ON public.admin_salary_processing_runs;
CREATE POLICY admin_salary_runs_pub_all ON public.admin_salary_processing_runs
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_lines_pub_all ON public.admin_salary_processing_lines;
CREATE POLICY admin_salary_lines_pub_all ON public.admin_salary_processing_lines
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

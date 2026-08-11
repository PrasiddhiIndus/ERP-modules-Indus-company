-- =============================================================================
-- Admin Salary Processing rewire (month runs / lines / revisions / variances)
-- Sample-sheet workflow for Salary Admin → Salary Processing.
-- Does NOT recreate CTC structure tables (still soft/local until CTC rewire).
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

GRANT EXECUTE ON FUNCTION public.admin_salary_user_has_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_salary_set_updated_at() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Month runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_month_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_year integer NOT NULL CHECK (pay_year >= 2000 AND pay_year <= 2100),
  pay_month integer NOT NULL CHECK (pay_month >= 1 AND pay_month <= 12),
  month_key text NOT NULL,
  month_days integer NOT NULL DEFAULT 26 CHECK (month_days > 0 AND month_days <= 31),
  status text NOT NULL DEFAULT 'processed'
    CHECK (status IN ('draft', 'processed', 'superseded')),
  revision_no integer NOT NULL DEFAULT 1 CHECK (revision_no >= 1),
  employee_count integer NOT NULL DEFAULT 0,
  total_gross numeric(16,2) NOT NULL DEFAULT 0,
  total_deductions numeric(16,2) NOT NULL DEFAULT 0,
  total_net numeric(16,2) NOT NULL DEFAULT 0,
  include_without_ctc boolean NOT NULL DEFAULT false,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_salary_month_runs_month_key_unique UNIQUE (month_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_month_runs_ym
  ON public.admin_salary_month_runs (pay_year DESC, pay_month DESC);

DROP TRIGGER IF EXISTS trg_admin_salary_month_runs_updated_at ON public.admin_salary_month_runs;
CREATE TRIGGER trg_admin_salary_month_runs_updated_at
  BEFORE UPDATE ON public.admin_salary_month_runs
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

-- ---------------------------------------------------------------------------
-- Month lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_month_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES public.admin_salary_month_runs(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  employee_code text,
  employee_name text,
  designation text,
  date_of_joining date,
  account_no text,
  ifsc text,
  confirmation_date date,

  declared boolean NOT NULL DEFAULT false,
  salary_rate numeric(14,2),
  present_days numeric(8,2) NOT NULL DEFAULT 26,
  total_days integer NOT NULL DEFAULT 26,
  pf_basic numeric(14,2),
  pf_earned_basic numeric(14,2),
  basic_full numeric(14,2),
  basic_earned numeric(14,2),
  hra_full numeric(14,2),
  hra_earned numeric(14,2),
  special_full numeric(14,2),
  special_allowance numeric(14,2),
  gross_wages numeric(14,2),
  emp_pf numeric(14,2),
  emp_esic numeric(14,2),
  pt_amount numeric(14,2),
  loan numeric(14,2) NOT NULL DEFAULT 0,
  sal_adv numeric(14,2) NOT NULL DEFAULT 0,
  unpaid_paid numeric(14,2) NOT NULL DEFAULT 0,
  tds numeric(14,2) NOT NULL DEFAULT 0,
  total_ded numeric(14,2),
  net_salary numeric(14,2),
  bank_amount numeric(14,2),

  source_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  line_revision_no integer NOT NULL DEFAULT 1,
  has_master_variance boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_month_lines_unique UNIQUE (run_id, employee_master_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_month_lines_run
  ON public.admin_salary_month_lines (run_id);
CREATE INDEX IF NOT EXISTS idx_admin_salary_month_lines_emp
  ON public.admin_salary_month_lines (employee_master_id);

DROP TRIGGER IF EXISTS trg_admin_salary_month_lines_updated_at ON public.admin_salary_month_lines;
CREATE TRIGGER trg_admin_salary_month_lines_updated_at
  BEFORE UPDATE ON public.admin_salary_month_lines
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

-- ---------------------------------------------------------------------------
-- Run revisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_run_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES public.admin_salary_month_runs(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK (revision_no >= 1),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT admin_salary_run_revisions_unique UNIQUE (run_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_run_revisions_run
  ON public.admin_salary_run_revisions (run_id, revision_no DESC);

-- ---------------------------------------------------------------------------
-- Employee master variance flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_employee_salary_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,
  run_id uuid
    REFERENCES public.admin_salary_month_runs(id) ON DELETE SET NULL,
  month_key text NOT NULL,
  field_key text NOT NULL,
  master_value text,
  sheet_value text,
  revision_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_emp_salary_var_emp
  ON public.admin_employee_salary_variances (employee_master_id, status);
CREATE INDEX IF NOT EXISTS idx_admin_emp_salary_var_month
  ON public.admin_employee_salary_variances (month_key, status);

DROP TRIGGER IF EXISTS trg_admin_emp_salary_var_updated_at ON public.admin_employee_salary_variances;
CREATE TRIGGER trg_admin_emp_salary_var_updated_at
  BEFORE UPDATE ON public.admin_employee_salary_variances
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_salary_month_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_month_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_run_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_employee_salary_variances ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_salary_month_runs',
    'admin_salary_month_lines',
    'admin_salary_run_revisions',
    'admin_employee_salary_variances'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_salary_proc_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY admin_salary_proc_all ON public.%I FOR ALL TO authenticated USING (public.admin_salary_user_has_access()) WITH CHECK (public.admin_salary_user_has_access())',
      t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_month_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_month_lines TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_run_revisions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_employee_salary_variances TO authenticated, service_role;

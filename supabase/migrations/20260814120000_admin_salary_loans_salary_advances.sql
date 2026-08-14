-- =============================================================================
-- Admin Salary — Employee Loans + Salary Advances (with recovery history)
--
-- Public tables (PostgREST-safe), same access as other admin_salary_* tables.
-- Also mirrors into schema admin_salary when that schema exists.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure access helper exists (created by earlier salary migrations)
CREATE OR REPLACE FUNCTION public.admin_salary_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Loans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  principal numeric(14,2) NOT NULL CHECK (principal >= 0),
  balance_outstanding numeric(14,2) NOT NULL CHECK (balance_outstanding >= 0),
  installment_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (installment_amount >= 0),

  months integer NOT NULL DEFAULT 0 CHECK (months >= 0),
  months_remaining integer NOT NULL DEFAULT 0 CHECK (months_remaining >= 0),

  -- First pay month that deducts EMI (YYYY-MM)
  start_month text NOT NULL,
  end_month text,
  -- Calendar day the loan was entered / last plan saved
  entry_date date NOT NULL DEFAULT (CURRENT_DATE),

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hold', 'closed')),

  remarks text,
  held_at timestamptz,
  closed_at timestamptz,
  last_salary_month text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_loans_start_month_chk
    CHECK (start_month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT admin_salary_loans_end_month_chk
    CHECK (end_month IS NULL OR end_month ~ '^\d{4}-\d{2}$')
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_loans_employee
  ON public.admin_salary_loans (employee_master_id, status);

CREATE INDEX IF NOT EXISTS idx_admin_salary_loans_start
  ON public.admin_salary_loans (start_month);

DROP TRIGGER IF EXISTS trg_admin_salary_loans_updated_at ON public.admin_salary_loans;
CREATE TRIGGER trg_admin_salary_loans_updated_at
  BEFORE UPDATE ON public.admin_salary_loans
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

COMMENT ON TABLE public.admin_salary_loans IS
  'Employee loans for Admin Salary Processing EMI deductions (tenure / hold / close).';

-- ---------------------------------------------------------------------------
-- Loan recoveries (full history by day + pay month)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_loan_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL
    REFERENCES public.admin_salary_loans(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  -- Pay month this recovery applies to (YYYY-MM)
  month_key text NOT NULL,
  -- Calendar day recovery was recorded
  recovery_date date NOT NULL DEFAULT (CURRENT_DATE),

  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'salary_sheet', 'import')),
  remarks text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_loan_recoveries_month_chk
    CHECK (month_key ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_salary_loan_recoveries_sheet_month
  ON public.admin_salary_loan_recoveries (loan_id, month_key)
  WHERE source = 'salary_sheet';

CREATE INDEX IF NOT EXISTS idx_admin_salary_loan_recoveries_loan
  ON public.admin_salary_loan_recoveries (loan_id, recovery_date DESC);

CREATE INDEX IF NOT EXISTS idx_admin_salary_loan_recoveries_employee
  ON public.admin_salary_loan_recoveries (employee_master_id, recovery_date DESC);

COMMENT ON TABLE public.admin_salary_loan_recoveries IS
  'Loan recovery history (manual or from salary processing) by day and pay month.';

-- ---------------------------------------------------------------------------
-- Salary advances
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  balance_outstanding numeric(14,2) NOT NULL CHECK (balance_outstanding >= 0),
  recovery_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (recovery_amount >= 0),

  months integer NOT NULL DEFAULT 0 CHECK (months >= 0),
  months_remaining integer NOT NULL DEFAULT 0 CHECK (months_remaining >= 0),

  start_month text NOT NULL,
  end_month text,
  entry_date date NOT NULL DEFAULT (CURRENT_DATE),

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hold', 'closed')),

  remarks text,
  held_at timestamptz,
  closed_at timestamptz,
  last_salary_month text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_advances_start_month_chk
    CHECK (start_month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT admin_salary_advances_end_month_chk
    CHECK (end_month IS NULL OR end_month ~ '^\d{4}-\d{2}$')
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_advances_employee
  ON public.admin_salary_salary_advances (employee_master_id, status);

CREATE INDEX IF NOT EXISTS idx_admin_salary_advances_start
  ON public.admin_salary_salary_advances (start_month);

DROP TRIGGER IF EXISTS trg_admin_salary_advances_updated_at ON public.admin_salary_salary_advances;
CREATE TRIGGER trg_admin_salary_advances_updated_at
  BEFORE UPDATE ON public.admin_salary_salary_advances
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

COMMENT ON TABLE public.admin_salary_salary_advances IS
  'Employee salary advances for Admin Salary Processing recovery deductions.';

-- ---------------------------------------------------------------------------
-- Salary advance recoveries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_salary_salary_advance_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL
    REFERENCES public.admin_salary_salary_advances(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  month_key text NOT NULL,
  recovery_date date NOT NULL DEFAULT (CURRENT_DATE),

  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'salary_sheet', 'import')),
  remarks text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_adv_recoveries_month_chk
    CHECK (month_key ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_salary_adv_recoveries_sheet_month
  ON public.admin_salary_salary_advance_recoveries (advance_id, month_key)
  WHERE source = 'salary_sheet';

CREATE INDEX IF NOT EXISTS idx_admin_salary_adv_recoveries_advance
  ON public.admin_salary_salary_advance_recoveries (advance_id, recovery_date DESC);

CREATE INDEX IF NOT EXISTS idx_admin_salary_adv_recoveries_employee
  ON public.admin_salary_salary_advance_recoveries (employee_master_id, recovery_date DESC);

COMMENT ON TABLE public.admin_salary_salary_advance_recoveries IS
  'Salary advance recovery history by day and pay month.';

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_loans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_loan_recoveries TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_salary_advances TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_salary_advance_recoveries TO authenticated, service_role;

ALTER TABLE public.admin_salary_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_loan_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_salary_advance_recoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_loans_all ON public.admin_salary_loans;
CREATE POLICY admin_salary_loans_all ON public.admin_salary_loans
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_loan_recoveries_all ON public.admin_salary_loan_recoveries;
CREATE POLICY admin_salary_loan_recoveries_all ON public.admin_salary_loan_recoveries
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_salary_advances_all ON public.admin_salary_salary_advances;
CREATE POLICY admin_salary_salary_advances_all ON public.admin_salary_salary_advances
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_salary_advance_recoveries_all ON public.admin_salary_salary_advance_recoveries;
CREATE POLICY admin_salary_salary_advance_recoveries_all ON public.admin_salary_salary_advance_recoveries
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

-- ---------------------------------------------------------------------------
-- Mirror views into admin_salary schema when present
-- ---------------------------------------------------------------------------
DO $mirror$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'admin_salary') THEN
    EXECUTE 'CREATE OR REPLACE VIEW admin_salary.v_loans AS SELECT * FROM public.admin_salary_loans';
    EXECUTE 'CREATE OR REPLACE VIEW admin_salary.v_loan_recoveries AS SELECT * FROM public.admin_salary_loan_recoveries';
    EXECUTE 'CREATE OR REPLACE VIEW admin_salary.v_salary_advances AS SELECT * FROM public.admin_salary_salary_advances';
    EXECUTE 'CREATE OR REPLACE VIEW admin_salary.v_salary_advance_recoveries AS SELECT * FROM public.admin_salary_salary_advance_recoveries';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'admin_salary schema mirrors skipped: %', SQLERRM;
END
$mirror$;

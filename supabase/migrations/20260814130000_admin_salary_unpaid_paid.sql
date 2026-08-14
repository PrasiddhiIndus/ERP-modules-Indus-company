-- =============================================================================
-- Admin Salary — Unpaid / Paid salary adjustments (company owes ↔ employee owes)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_salary_unpaid_paid (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  -- company_owes = company owes employee (credit / pays out)
  -- employee_owes = employee owes company (deduct from salary)
  kind text NOT NULL DEFAULT 'company_owes'
    CHECK (kind IN ('company_owes', 'employee_owes', 'unpaid', 'paid')),

  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  balance_outstanding numeric(14,2) NOT NULL CHECK (balance_outstanding >= 0),
  monthly_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),

  months integer NOT NULL DEFAULT 1 CHECK (months >= 0),
  months_remaining integer NOT NULL DEFAULT 1 CHECK (months_remaining >= 0),

  start_month text NOT NULL,
  end_month text,
  entry_date date NOT NULL DEFAULT (CURRENT_DATE),

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'hold', 'closed', 'active')),

  remarks text,
  held_at timestamptz,
  closed_at timestamptz,
  last_salary_month text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_unpaid_paid_start_chk
    CHECK (start_month ~ '^\d{4}-\d{2}$'),
  CONSTRAINT admin_salary_unpaid_paid_end_chk
    CHECK (end_month IS NULL OR end_month ~ '^\d{4}-\d{2}$')
);

CREATE INDEX IF NOT EXISTS idx_admin_salary_unpaid_paid_employee
  ON public.admin_salary_unpaid_paid (employee_master_id, status);

CREATE INDEX IF NOT EXISTS idx_admin_salary_unpaid_paid_start
  ON public.admin_salary_unpaid_paid (start_month);

DROP TRIGGER IF EXISTS trg_admin_salary_unpaid_paid_updated_at ON public.admin_salary_unpaid_paid;
CREATE TRIGGER trg_admin_salary_unpaid_paid_updated_at
  BEFORE UPDATE ON public.admin_salary_unpaid_paid
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

COMMENT ON TABLE public.admin_salary_unpaid_paid IS
  'Unpaid/paid salary adjustments: company owes employee or employee owes company; feeds Salary Processing.';

CREATE TABLE IF NOT EXISTS public.admin_salary_unpaid_paid_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unpaid_paid_id uuid NOT NULL
    REFERENCES public.admin_salary_unpaid_paid(id) ON DELETE CASCADE,
  employee_master_id bigint NOT NULL
    REFERENCES public.admin_ifsp_employee_master(id) ON DELETE CASCADE,

  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  month_key text NOT NULL,
  settlement_date date NOT NULL DEFAULT (CURRENT_DATE),

  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'salary_sheet', 'import')),
  remarks text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_salary_ups_settlements_month_chk
    CHECK (month_key ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_salary_ups_settlements_sheet_month
  ON public.admin_salary_unpaid_paid_settlements (unpaid_paid_id, month_key)
  WHERE source = 'salary_sheet';

CREATE INDEX IF NOT EXISTS idx_admin_salary_ups_settlements_parent
  ON public.admin_salary_unpaid_paid_settlements (unpaid_paid_id, settlement_date DESC);

CREATE INDEX IF NOT EXISTS idx_admin_salary_ups_settlements_employee
  ON public.admin_salary_unpaid_paid_settlements (employee_master_id, settlement_date DESC);

COMMENT ON TABLE public.admin_salary_unpaid_paid_settlements IS
  'Settlement history for unpaid/paid adjustments by day and pay month.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_unpaid_paid TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_salary_unpaid_paid_settlements TO authenticated, service_role;

ALTER TABLE public.admin_salary_unpaid_paid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_salary_unpaid_paid_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_unpaid_paid_all ON public.admin_salary_unpaid_paid;
CREATE POLICY admin_salary_unpaid_paid_all ON public.admin_salary_unpaid_paid
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DROP POLICY IF EXISTS admin_salary_unpaid_paid_settlements_all ON public.admin_salary_unpaid_paid_settlements;
CREATE POLICY admin_salary_unpaid_paid_settlements_all ON public.admin_salary_unpaid_paid_settlements
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

DO $mirror$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'admin_salary') THEN
    EXECUTE 'CREATE OR REPLACE VIEW admin_salary.v_unpaid_paid AS SELECT * FROM public.admin_salary_unpaid_paid';
    EXECUTE 'CREATE OR REPLACE VIEW admin_salary.v_unpaid_paid_settlements AS SELECT * FROM public.admin_salary_unpaid_paid_settlements';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'admin_salary unpaid/paid mirrors skipped: %', SQLERRM;
END
$mirror$;

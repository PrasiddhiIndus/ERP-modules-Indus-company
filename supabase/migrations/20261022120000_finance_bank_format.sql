-- Finance bank payment format sheets (Axis upload) — one sheet per processed salary month.
-- Rows are filled from admin_salary_month_lines; edits persist here for download.

CREATE TABLE IF NOT EXISTS finance.bank_format_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL,
  pay_year integer NOT NULL CHECK (pay_year >= 2000 AND pay_year <= 2100),
  pay_month integer NOT NULL CHECK (pay_month >= 1 AND pay_month <= 12),
  salary_run_id uuid,
  debit_account_no text NOT NULL DEFAULT '920030061304640',
  default_account_type text NOT NULL DEFAULT '10',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT finance_bank_format_sheets_month_unique UNIQUE (month_key)
);

CREATE INDEX IF NOT EXISTS idx_finance_bank_format_sheets_ym
  ON finance.bank_format_sheets (pay_year DESC, pay_month DESC);

CREATE TABLE IF NOT EXISTS finance.bank_format_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES finance.bank_format_sheets(id) ON DELETE CASCADE,
  salary_line_id uuid,
  employee_master_id text,
  employee_code text,
  payment_method text NOT NULL DEFAULT 'N',
  payment_amount numeric(14, 2) NOT NULL DEFAULT 0,
  activation_date text,
  beneficiary_name text,
  beneficiary_account_no text,
  blank text,
  email_body text,
  debit_account_no text,
  crn_no text,
  receiver_ifsc text,
  receiver_account_type text NOT NULL DEFAULT '10',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_bank_format_lines_sheet
  ON finance.bank_format_lines (sheet_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_bank_format_lines_sheet_emp
  ON finance.bank_format_lines (sheet_id, employee_master_id)
  WHERE employee_master_id IS NOT NULL AND employee_master_id <> '';

DROP TRIGGER IF EXISTS trg_finance_bank_format_sheets_updated_at ON finance.bank_format_sheets;
CREATE TRIGGER trg_finance_bank_format_sheets_updated_at
  BEFORE UPDATE ON finance.bank_format_sheets
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

DROP TRIGGER IF EXISTS trg_finance_bank_format_lines_updated_at ON finance.bank_format_lines;
CREATE TRIGGER trg_finance_bank_format_lines_updated_at
  BEFORE UPDATE ON finance.bank_format_lines
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

ALTER TABLE finance.bank_format_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bank_format_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_bank_format_sheets_all ON finance.bank_format_sheets;
CREATE POLICY finance_bank_format_sheets_all ON finance.bank_format_sheets
  FOR ALL TO authenticated
  USING (finance.current_user_has_finance_admin())
  WITH CHECK (finance.current_user_has_finance_admin());

DROP POLICY IF EXISTS finance_bank_format_lines_all ON finance.bank_format_lines;
CREATE POLICY finance_bank_format_lines_all ON finance.bank_format_lines
  FOR ALL TO authenticated
  USING (finance.current_user_has_finance_admin())
  WITH CHECK (finance.current_user_has_finance_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON finance.bank_format_sheets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.bank_format_lines TO authenticated, service_role;

COMMENT ON TABLE finance.bank_format_sheets IS
  'Axis bank payment upload sheet header per salary month (debit account + defaults).';
COMMENT ON TABLE finance.bank_format_lines IS
  'Bank payment rows for a month — sourced from processed salary, editable before Excel download.';

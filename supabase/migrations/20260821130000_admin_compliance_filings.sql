-- Payroll compliance filings: month snapshot of PF/EPF + ESIC review rows
-- and the UAN / ESIC IP map filled from an uploaded workbook.

CREATE TABLE IF NOT EXISTS public.admin_compliance_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL,
  pay_year integer NOT NULL CHECK (pay_year >= 2000 AND pay_year <= 2100),
  pay_month integer NOT NULL CHECK (pay_month >= 1 AND pay_month <= 12),
  run_id uuid REFERENCES public.admin_salary_month_runs(id) ON DELETE SET NULL,
  source_file_name text,
  id_map_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  epf_rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  esic_rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_compliance_filings_month_unique UNIQUE (month_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_compliance_filings_month
  ON public.admin_compliance_filings (month_key);
CREATE INDEX IF NOT EXISTS idx_admin_compliance_filings_run
  ON public.admin_compliance_filings (run_id);

DROP TRIGGER IF EXISTS trg_admin_compliance_filings_updated_at ON public.admin_compliance_filings;
CREATE TRIGGER trg_admin_compliance_filings_updated_at
  BEFORE UPDATE ON public.admin_compliance_filings
  FOR EACH ROW EXECUTE FUNCTION public.admin_salary_set_updated_at();

ALTER TABLE public.admin_compliance_filings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_salary_proc_all ON public.admin_compliance_filings;
CREATE POLICY admin_salary_proc_all ON public.admin_compliance_filings
  FOR ALL TO authenticated
  USING (public.admin_salary_user_has_access())
  WITH CHECK (public.admin_salary_user_has_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_compliance_filings TO authenticated, service_role;

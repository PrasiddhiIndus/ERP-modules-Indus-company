-- Performance Incentive: optional Part A line on the Annexure-I CTC record.
-- Entered per employee ("Enter each component"); counts in Gross / CTC / payroll only when enabled.
-- Archived revisions keep it inside snapshot_json, so no column is needed on the revisions table.

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS perf_incentive_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perf_incentive_monthly numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.admin_salary_structures.perf_incentive_enabled IS
  'Performance Incentive is part of this CTC (Part A). When false the amount is ignored everywhere.';
COMMENT ON COLUMN public.admin_salary_structures.perf_incentive_monthly IS
  'Monthly Performance Incentive (Part A). Included in gross_monthly when perf_incentive_enabled.';

NOTIFY pgrst, 'reload schema';

-- Employee-specific additional CTC components (Annexure-I), per CTC record.
-- Each item: { id, part: 'A' | 'D' | 'B', label, monthly }.
--   A = Part A earning (in gross_monthly / take_home_monthly / ctc_monthly)
--   D = deduction (reduces take_home_monthly)
--   B = Part B employer cost (in total_b_monthly / ctc_monthly)
-- Archived revisions keep the list inside snapshot_json.

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS extra_components_json jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.admin_salary_structures.extra_components_json IS
  'Additional components for this employee only: [{id, part (A|D|B), label, monthly}]. Totals already include them.';

NOTIFY pgrst, 'reload schema';

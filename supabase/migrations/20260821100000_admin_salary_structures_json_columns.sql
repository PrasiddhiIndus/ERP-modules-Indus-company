-- Ensure CTC JSON columns exist on public.admin_salary_structures.
-- Safe to re-run. Older production DBs may have missed 20260813 / 20260814.

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS pa_overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS custom_component_amounts_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.admin_salary_structures.pa_overrides_json IS
  'Optional per-line P.A. overrides keyed by component (e.g. gross, basic, ctc). Empty = auto monthly × 12.';

COMMENT ON COLUMN public.admin_salary_structures.custom_component_amounts_json IS
  'Manual monthly amounts for person custom CTC components, keyed by component code.';

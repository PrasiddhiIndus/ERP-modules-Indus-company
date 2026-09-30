-- Per-employee CTC formula text. Amount columns are not changed by this migration.

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS formula_overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.admin_salary_structures.formula_overrides_json IS
  'Optional per-employee CTC formula text keyed by component code. Empty = company standard formulas.';

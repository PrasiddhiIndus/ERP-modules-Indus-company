-- Manual P.A. overrides for CTC sheet (saved only on Save CTC / Revise).
-- Monthly formulas stay unchanged; this JSON stores optional annual overrides.

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS pa_overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.admin_salary_structures.pa_overrides_json IS
  'Optional per-line P.A. overrides keyed by component (e.g. gross, basic, ctc). Empty = auto monthly × 12.';

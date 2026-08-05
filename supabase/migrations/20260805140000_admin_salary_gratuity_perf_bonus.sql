-- Gratuity Auto/Custom + optional Special Performance bonus (Salary Master CTC)

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS gratuity_mode text NOT NULL DEFAULT 'auto';

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS special_perf_bonus_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS special_perf_bonus_monthly numeric(14,2);

DO $grat_mode$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_salary_structures_gratuity_mode_check'
  ) THEN
    ALTER TABLE public.admin_salary_structures
      ADD CONSTRAINT admin_salary_structures_gratuity_mode_check
      CHECK (gratuity_mode IN ('auto', 'custom'));
  END IF;
END;
$grat_mode$;

ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS gratuity_mode text;

ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS special_perf_bonus_enabled boolean;

ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS special_perf_bonus_monthly numeric(14,2);

-- Legacy schema (if still present)
DO $legacy$
BEGIN
  IF to_regclass('admin_salary.structures') IS NOT NULL THEN
    ALTER TABLE admin_salary.structures
      ADD COLUMN IF NOT EXISTS gratuity_mode text NOT NULL DEFAULT 'auto';
    ALTER TABLE admin_salary.structures
      ADD COLUMN IF NOT EXISTS special_perf_bonus_enabled boolean NOT NULL DEFAULT false;
    ALTER TABLE admin_salary.structures
      ADD COLUMN IF NOT EXISTS special_perf_bonus_monthly numeric(14,2);
  END IF;
  IF to_regclass('admin_salary.structure_revisions') IS NOT NULL THEN
    ALTER TABLE admin_salary.structure_revisions
      ADD COLUMN IF NOT EXISTS gratuity_mode text;
    ALTER TABLE admin_salary.structure_revisions
      ADD COLUMN IF NOT EXISTS special_perf_bonus_enabled boolean;
    ALTER TABLE admin_salary.structure_revisions
      ADD COLUMN IF NOT EXISTS special_perf_bonus_monthly numeric(14,2);
  END IF;
END;
$legacy$;

COMMENT ON COLUMN public.admin_salary_structures.gratuity_mode IS
  'Gratuity entry mode: auto (Basic × 4.81% Govt.) or custom (manual).';

COMMENT ON COLUMN public.admin_salary_structures.special_perf_bonus_enabled IS
  'When true, Special Performance bonus (variable-annually) is included in Part B / CTC.';

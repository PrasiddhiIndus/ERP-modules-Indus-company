-- Consultant CTC: paid-day threshold. Salary is reduced only when present
-- days are below this number. Values above 31 are allowed.

ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS consultant_p_days numeric;

COMMENT ON COLUMN public.admin_salary_structures.consultant_p_days IS
  'Consultant CTC: paid-day threshold. Salary is reduced only when present days are below this number. Values above 31 are allowed.';

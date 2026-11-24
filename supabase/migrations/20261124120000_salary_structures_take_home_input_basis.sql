-- Allow Take Home (voucher / consultant / apprentice) on admin_salary_structures.
-- App stores input_basis = 'take_home' via takeHomeToStructurePayload; the old check
-- only permitted 'gross' | 'ctc' and blocked New revision → Take Home → Save.

ALTER TABLE public.admin_salary_structures
  DROP CONSTRAINT IF EXISTS admin_salary_structures_annexure_values_chk;

ALTER TABLE public.admin_salary_structures
  ADD CONSTRAINT admin_salary_structures_annexure_values_chk CHECK (
    (skill_category IS NULL OR skill_category IN ('skilled', 'semi_skilled'))
    AND (salary_scheme IS NULL OR salary_scheme IN ('old', 'new'))
    AND (employee_status IS NULL OR employee_status IN ('probation', 'confirmed'))
    AND (input_basis IS NULL OR input_basis IN ('gross', 'ctc', 'take_home'))
    AND (revision_type IS NULL OR revision_type IN
      ('initial', 'increment', 'confirmation', 'scheme_change', 'correction', 'custom'))
  );

COMMENT ON CONSTRAINT admin_salary_structures_annexure_values_chk ON public.admin_salary_structures IS
  'Annexure enums plus take_home input_basis for Net Salary–only structures.';

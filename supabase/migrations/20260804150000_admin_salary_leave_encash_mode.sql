-- Leave Encashment Auto / Custom mode on Salary Master CTC

ALTER TABLE admin_salary.structures
  ADD COLUMN IF NOT EXISTS leave_encash_mode text NOT NULL DEFAULT 'auto';

DO $salary_leave$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_salary_structures_leave_encash_mode_check'
  ) THEN
    ALTER TABLE admin_salary.structures
      ADD CONSTRAINT admin_salary_structures_leave_encash_mode_check
      CHECK (leave_encash_mode IN ('auto', 'custom'));
  END IF;
END;
$salary_leave$;

ALTER TABLE admin_salary.structure_revisions
  ADD COLUMN IF NOT EXISTS leave_encash_mode text;

COMMENT ON COLUMN admin_salary.structures.leave_encash_mode IS
  'Leave Encashment entry mode: auto (policy formula from Basic) or custom (manual).';

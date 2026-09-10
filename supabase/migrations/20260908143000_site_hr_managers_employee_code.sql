-- Site Attendance: assign Employee Master HR staff to sites (not the old hr_managers login table).
-- employee_code is the canonical person key. hr_manager_id stays for older rows.

DO $$
BEGIN
  IF to_regclass('public.site_hr_managers') IS NULL THEN
    RAISE NOTICE 'Skipping — public.site_hr_managers does not exist.';
    RETURN;
  END IF;

  ALTER TABLE public.site_hr_managers
    ADD COLUMN IF NOT EXISTS employee_code text;

  BEGIN
    ALTER TABLE public.site_hr_managers
      ALTER COLUMN hr_manager_id DROP NOT NULL;
  EXCEPTION
    WHEN others THEN
      RAISE NOTICE 'Could not drop NOT NULL on site_hr_managers.hr_manager_id: %', SQLERRM;
  END;

  CREATE INDEX IF NOT EXISTS site_hr_managers_employee_code_idx
    ON public.site_hr_managers (employee_code);
END $$;

DO $$
BEGIN
  IF to_regclass('public.sites') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.sites DROP COLUMN IF EXISTS customized_duty_hours;
END $$;

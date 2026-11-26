-- Per-site flag: allow free-form numeric duty values on the attendance grid.
-- Default unchecked (false) for every site — existing and new.

DO $$
BEGIN
  IF to_regclass('public.sites') IS NULL THEN
    RAISE NOTICE 'Skipping customized_duty_hours — public.sites does not exist.';
    RETURN;
  END IF;

  ALTER TABLE public.sites
    ADD COLUMN IF NOT EXISTS customized_duty_hours boolean;

  -- Ensure default is unchecked for new rows.
  ALTER TABLE public.sites
    ALTER COLUMN customized_duty_hours SET DEFAULT false;

  -- Force every existing site to unchecked.
  UPDATE public.sites
  SET customized_duty_hours = false
  WHERE customized_duty_hours IS DISTINCT FROM false;

  ALTER TABLE public.sites
    ALTER COLUMN customized_duty_hours SET NOT NULL;

  COMMENT ON COLUMN public.sites.customized_duty_hours IS
    'When true, Site Attendance cells accept custom numeric duty values (e.g. 0.5, 0.75, 4, 8) in addition to letter codes. Default false (unchecked) for all sites.';
END $$;

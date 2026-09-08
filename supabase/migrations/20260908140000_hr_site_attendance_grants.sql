-- INDUS Att.Mod tables already live in public (created by the standalone HR app).
-- Site Attendance in ERP uses the same tables via the user JWT.
-- Grant authenticated + service_role explicitly so ERP login can read/write them.
-- Does not drop existing USING (true) policies used by the standalone app.

DO $$
DECLARE
  t text;
  seq_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sites',
    'people',
    'site_assignments',
    'attendance',
    'designation_master',
    'site_designations',
    'site_supervisors',
    'hr_managers',
    'site_hr_managers',
    'summary_remarks',
    'site_grid_placements'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'Skipping grant — public.% does not exist.', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      t
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      t
    );

    seq_name := t || '_id_seq';
    IF to_regclass(format('public.%I', seq_name)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated, service_role',
        seq_name
      );
    END IF;
  END LOOP;
END $$;

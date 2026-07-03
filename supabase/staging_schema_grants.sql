-- =============================================================================
-- STAGING — grants + RLS on billing, finance, indus_one, projects schemas
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY
--
-- Run AFTER staging_public_schema_all.sql (public schema is handled there).
-- Safe to re-run.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS indus_one;
CREATE SCHEMA IF NOT EXISTS projects;

DO $$
DECLARE
  s text;
  t text;
  schemas text[] := ARRAY['billing', 'finance', 'indus_one', 'projects'];
BEGIN
  FOREACH s IN ARRAY schemas
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated, service_role', s);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated',
      s
    );
    EXECUTE format(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO authenticated',
      s
    );

    FOR t IN
      SELECT tablename FROM pg_tables WHERE schemaname = s ORDER BY tablename
    LOOP
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t);

      EXECUTE format('DROP POLICY IF EXISTS staging_%s_select_%s ON %I.%I', s, t, s, t);
      EXECUTE format(
        'CREATE POLICY staging_%s_select_%s ON %I.%I FOR SELECT TO authenticated USING (true)',
        s, t, s, t
      );

      EXECUTE format('DROP POLICY IF EXISTS staging_%s_insert_%s ON %I.%I', s, t, s, t);
      EXECUTE format(
        'CREATE POLICY staging_%s_insert_%s ON %I.%I FOR INSERT TO authenticated WITH CHECK (true)',
        s, t, s, t
      );

      EXECUTE format('DROP POLICY IF EXISTS staging_%s_update_%s ON %I.%I', s, t, s, t);
      EXECUTE format(
        'CREATE POLICY staging_%s_update_%s ON %I.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
        s, t, s, t
      );

      EXECUTE format('DROP POLICY IF EXISTS staging_%s_delete_%s ON %I.%I', s, t, s, t);
      EXECUTE format(
        'CREATE POLICY staging_%s_delete_%s ON %I.%I FOR DELETE TO authenticated USING (true)',
        s, t, s, t
      );
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'staging_schema_grants.sql complete' AS status;

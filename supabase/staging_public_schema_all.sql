-- =============================================================================
-- STAGING — grants + RLS on EVERY public schema table
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY (staging / QA)
-- NEVER run on production: wbyzhknaqcjqqtwopupl
--
-- Run AFTER:
--   staging_bootstrap.sql → sql (fire tender base) → all_migrations.sql → staging_fix_403.sql
--
-- This applies to ALL tables currently in public schema (admin, ERP, marketing,
-- fire tender, AMC, HR payroll, fleet, etc.) — not only a fixed list.
-- Skips: profiles (keeps signup/login RLS from staging_fix_403.sql)
-- Safe to re-run.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- Permissive RLS on every public table except profiles
DO $$
DECLARE
  t text;
  skip_tables text[] := ARRAY['profiles'];
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> ALL (skip_tables)
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS staging_public_select_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY staging_public_select_%I ON public.%I FOR SELECT TO authenticated USING (true)',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS staging_public_insert_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY staging_public_insert_%I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS staging_public_update_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY staging_public_update_%I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS staging_public_delete_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY staging_public_delete_%I ON public.%I FOR DELETE TO authenticated USING (true)',
      t, t
    );

    RAISE NOTICE 'RLS applied: public.%', t;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Summary: how many public tables exist on staging
SELECT
  count(*)::text AS public_table_count,
  string_agg(tablename, ', ' ORDER BY tablename) AS public_tables
FROM pg_tables
WHERE schemaname = 'public';

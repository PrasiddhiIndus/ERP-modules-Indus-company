-- =============================================================================
-- PRODUCTION HEALTH CHECK — run on wbyzhknaqcjqqtwopupl ONLY (read-only)
-- All rows should show OK. profile_rows should match your user count (~29).
-- =============================================================================

SELECT 'anon read erp_app_access_config' AS check_name,
  CASE WHEN has_table_privilege('anon', 'public.erp_app_access_config', 'SELECT')
    THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'authenticated read profiles',
  CASE WHEN has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'default app access config row',
  CASE WHEN EXISTS (SELECT 1 FROM public.erp_app_access_config WHERE id = 'default')
    THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'profile rows (informational)',
  (SELECT count(*)::text FROM public.profiles);

-- Optional: list profiles RLS policies (should be 5 policies from production migrations)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- If any check is MISSING or login broke, run on PRODUCTION only:
--   supabase/migrations/20260609180000_profiles_rls_definitive_fix.sql

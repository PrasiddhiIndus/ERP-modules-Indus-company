-- =============================================================================
-- STAGING FIX 403 — run in Supabase SQL Editor
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY (staging / QA)
-- NEVER run on production: wbyzhknaqcjqqtwopupl
--
-- Fixes: 401/403 on erp_app_access_config, profiles, erp_activity_log
-- If tables are missing, run staging_bootstrap.sql first, then re-run this file.
-- Safe to re-run.
-- =============================================================================

-- 1) Schema + table privileges (most common 403 cause on new Supabase projects)
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

-- 2) erp_app_access_config — both anon (register) AND authenticated (logged-in)
ALTER TABLE public.erp_app_access_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read app access config" ON public.erp_app_access_config;
DROP POLICY IF EXISTS "read app access config" ON public.erp_app_access_config;

CREATE POLICY "anon read app access config"
  ON public.erp_app_access_config FOR SELECT TO anon
  USING (true);

CREATE POLICY "read app access config"
  ON public.erp_app_access_config FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.erp_app_access_config TO anon, authenticated;

-- Ensure default row exists
INSERT INTO public.erp_app_access_config (id, teams, modules, module_path_prefixes)
VALUES ('default', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3) profiles — RLS for signup + login
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'super_admin_pro', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 4) Backfill missing profile rows for existing auth users
INSERT INTO public.profiles (id, email, username, team, role, allowed_modules)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'username',
    u.raw_user_meta_data->>'full_name',
    split_part(COALESCE(u.email, 'user@local'), '@', 1)
  ),
  NULLIF(btrim(u.raw_user_meta_data->>'team'), ''),
  COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'role'), ''), 'executive'),
  COALESCE(u.raw_user_meta_data->'allowed_modules', '[]'::jsonb)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 5) erp_activity_log (dashboard activity — stops 403 noise after login)
CREATE TABLE IF NOT EXISTS public.erp_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NULL,
  user_email text NULL,
  action text NOT NULL,
  entity text NULL,
  route text NULL,
  success boolean NOT NULL DEFAULT true,
  status_code int NULL,
  details jsonb NULL
);

CREATE INDEX IF NOT EXISTS erp_activity_log_created_at_idx ON public.erp_activity_log (created_at DESC);

ALTER TABLE public.erp_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_activity_log_select ON public.erp_activity_log;
DROP POLICY IF EXISTS erp_activity_log_insert ON public.erp_activity_log;

CREATE POLICY erp_activity_log_select ON public.erp_activity_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY erp_activity_log_insert ON public.erp_activity_log
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT, INSERT ON public.erp_activity_log TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 6) Verify (should show OK for all rows — if MISSING GRANT, re-run this script)
SELECT 'anon can read erp_app_access_config' AS check_name,
  CASE WHEN has_table_privilege('anon', 'public.erp_app_access_config', 'SELECT')
    THEN 'OK' ELSE 'MISSING — re-run this script' END AS status
UNION ALL
SELECT 'authenticated can read profiles',
  CASE WHEN has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    THEN 'OK' ELSE 'MISSING — run staging_bootstrap.sql then this script' END
UNION ALL
SELECT 'default config row exists',
  CASE WHEN EXISTS (SELECT 1 FROM public.erp_app_access_config WHERE id = 'default')
    THEN 'OK' ELSE 'MISSING — run staging_bootstrap.sql' END;

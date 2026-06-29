-- =============================================================================
-- STAGING BOOTSTRAP — run once in Supabase SQL Editor
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY (staging / QA)
-- NEVER run on production: wbyzhknaqcjqqtwopupl (company data)
--
-- After this file: run staging_fix_403.sql (grants + verify — all 3 checks must be OK)
-- =============================================================================

-- ── Helpers ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'super_admin_pro', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  username text,
  team text,
  role text,
  allowed_modules jsonb DEFAULT '[]'::jsonb,
  employee_code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_code text;

DROP INDEX IF EXISTS public.profiles_employee_code_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_code_unique_idx
  ON public.profiles (lower(btrim(employee_code)))
  WHERE employee_code IS NOT NULL AND btrim(employee_code) <> '';

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, team, role, allowed_modules, employee_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
      split_part(COALESCE(NEW.email, 'user@local'), '@', 1)
    ),
    NULLIF(btrim(NEW.raw_user_meta_data->>'team'), ''),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'role'), ''), 'executive'),
    COALESCE(NEW.raw_user_meta_data->'allowed_modules', '[]'::jsonb),
    NULLIF(btrim(NEW.raw_user_meta_data->>'employee_code'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user skipped profile insert for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── app_users (legacy sync) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text
);

CREATE OR REPLACE FUNCTION public.trg_sync_app_users_from_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.app_users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.username, split_part(COALESCE(NEW.email, 'user@local'), '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_app_users_from_profiles ON public.profiles;
CREATE TRIGGER sync_app_users_from_profiles
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_app_users_from_profiles();

-- ── erp_app_access_config (teams/modules on register page) ────────────────────
CREATE TABLE IF NOT EXISTS public.erp_app_access_config (
  id text PRIMARY KEY DEFAULT 'default',
  updated_at timestamptz NOT NULL DEFAULT now(),
  teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  module_path_prefixes jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.erp_app_access_config (id, teams, modules, module_path_prefixes)
VALUES (
  'default',
  '[
    {"value":"hr","label":"HR"},
    {"value":"compliance","label":"Compliance"},
    {"value":"admin","label":"Admin"},
    {"value":"marketing","label":"Marketing"},
    {"value":"commercialMt","label":"Commercial — Manpower / Training"},
    {"value":"commercialRm","label":"Commercial — R&M / M&M / AMC / IEV"},
    {"value":"billing","label":"Billing"},
    {"value":"operations","label":"Operations"},
    {"value":"projects","label":"Projects"},
    {"value":"procurement","label":"Procurement"},
    {"value":"amc","label":"AMC"},
    {"value":"finance","label":"Finance/Accounts"},
    {"value":"fireTender","label":"Fire Tender"},
    {"value":"itIs","label":"IT/IS"}
  ]'::jsonb,
  '[
    {"value":"hr","label":"HR"},
    {"value":"compliance","label":"Compliance"},
    {"value":"admin","label":"Admin"},
    {"value":"marketing","label":"Marketing"},
    {"value":"commercialMt","label":"Commercial — Manpower / Training"},
    {"value":"commercialRm","label":"Commercial — R&M / M&M / AMC / IEV"},
    {"value":"billing","label":"Billing"},
    {"value":"tracking","label":"Tracking"},
    {"value":"operations","label":"Operations"},
    {"value":"projects","label":"Projects"},
    {"value":"procurement","label":"Procurement"},
    {"value":"amc","label":"AMC"},
    {"value":"finance","label":"Finance/Accounts"},
    {"value":"fireTender","label":"Fire Tender"},
    {"value":"itIs","label":"IT/IS"},
    {"value":"settings","label":"Settings"}
  ]'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.erp_app_access_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read app access config" ON public.erp_app_access_config;
DROP POLICY IF EXISTS "anon read app access config" ON public.erp_app_access_config;

-- Register/login pages load config before sign-in (anon role)
CREATE POLICY "anon read app access config"
  ON public.erp_app_access_config FOR SELECT TO anon
  USING (true);

CREATE POLICY "read app access config"
  ON public.erp_app_access_config FOR SELECT TO authenticated
  USING (true);

-- ── Grants (403 = missing privileges for anon/authenticated) ─────────────────
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

GRANT SELECT ON public.erp_app_access_config TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_users TO authenticated;

-- ── Backfill profiles for users already in auth.users ─────────────────────────
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

-- Optional: promote first staging admin (uncomment and set email)
-- UPDATE public.profiles SET role = 'super_admin_pro', team = 'admin',
--   allowed_modules = '["marketing","admin","billing","settings","hr"]'::jsonb
-- WHERE email = 'your-admin@company.com';

NOTIFY pgrst, 'reload schema';

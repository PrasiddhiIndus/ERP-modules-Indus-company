-- Definitive fix: profiles RLS "stack depth limit exceeded"
--
-- Root cause: policies on public.profiles that read public.profiles again
-- (inline EXISTS subquery or is_current_user_admin() without row_security off)
-- re-enter RLS → infinite recursion.
--
-- This migration:
-- 1. Recreates helper functions with SET row_security = off
-- 2. Drops ALL profiles RLS policies and recreates a non-recursive set
-- 3. Recreates admin_save_profile / admin_upsert_profile / get_profile_role
-- 4. Hardens sync_app_users trigger (no profiles reads)

-- ── Helper: super admin check (must NOT evaluate RLS on profiles) ─────────────
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
      AND role IN ('super_admin', 'super_admin_pro')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_profile_role(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role FROM public.profiles WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.get_profile_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_role(uuid) TO authenticated;

-- ── Service-role saves (User Management / edge functions) ─────────────────────
CREATE OR REPLACE FUNCTION public.admin_save_profile(
  p_id uuid,
  p_team text,
  p_role text,
  p_allowed_modules jsonb,
  p_employee_code text DEFAULT NULL,
  p_set_employee_code boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.profiles%ROWTYPE;
  code text;
  taken_email text;
BEGIN
  IF p_set_employee_code THEN
    code := NULLIF(btrim(p_employee_code), '');
    IF code IS NOT NULL THEN
      SELECT email INTO taken_email
      FROM public.profiles
      WHERE lower(btrim(employee_code)) = lower(code)
        AND id <> p_id
      LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION 'Employee code "%" is already assigned to %.', code, COALESCE(taken_email, p_id::text)
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    team = p_team,
    role = p_role,
    allowed_modules = p_allowed_modules,
    employee_code = CASE WHEN p_set_employee_code THEN code ELSE employee_code END,
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO r;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(r);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_profile(uuid, text, text, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_profile(uuid, text, text, jsonb, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_upsert_profile(
  p_id uuid,
  p_email text,
  p_username text,
  p_team text,
  p_role text,
  p_allowed_modules jsonb,
  p_employee_code text DEFAULT NULL,
  p_set_employee_code boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  r public.profiles%ROWTYPE;
  code text;
BEGIN
  IF p_set_employee_code THEN
    code := NULLIF(btrim(p_employee_code), '');
  END IF;

  INSERT INTO public.profiles (id, email, username, team, role, allowed_modules, employee_code)
  VALUES (
    p_id,
    p_email,
    p_username,
    p_team,
    p_role,
    p_allowed_modules,
    CASE WHEN p_set_employee_code THEN code ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    username = EXCLUDED.username,
    team = EXCLUDED.team,
    role = EXCLUDED.role,
    allowed_modules = EXCLUDED.allowed_modules,
    employee_code = CASE WHEN p_set_employee_code THEN EXCLUDED.employee_code ELSE public.profiles.employee_code END,
    updated_at = now()
  RETURNING * INTO r;

  RETURN to_jsonb(r);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean) TO service_role;

-- ── Drop every profiles policy (removes legacy inline-recursive policies) ─────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_current_user_admin());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ── app_users sync trigger: never read profiles (writes app_users only) ───────
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
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_code text;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Signup / missing-profile must never copy Auth metadata role, modules, team,
-- or employee_code. The browser may send a name and email only.
--
-- User Management (admin JWT + service_role) is the only path that grants
-- admin / modules. Existing profile rows are not rewritten.
--
-- DATA SAFETY: function/trigger metadata only — no UPDATE of existing people.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username,
    team,
    role,
    allowed_modules,
    allowed_sub_modules,
    employee_code,
    module_access_pending
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
      split_part(COALESCE(NEW.email, 'user@local'), '@', 1)
    ),
    NULL,
    'executive',
    '[]'::jsonb,
    '[]'::jsonb,
    NULL,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    INSERT INTO public.profiles (id, email, username, team, role, allowed_modules)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
        split_part(COALESCE(NEW.email, 'user@local'), '@', 1)
      ),
      NULL,
      'executive',
      '[]'::jsonb
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user skipped profile insert for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth signup stub only: executive, empty modules, module_access_pending. Never copies metadata role/team/code.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.current_user_may_set_profile_privileges()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'admin', 'hod', 'super_admin', 'superadmin',
          'super_admin_pro', 'superadmin_pro'
        )
    );
$$;

COMMENT ON FUNCTION public.current_user_may_set_profile_privileges() IS
  'True for service_role or an existing admin/super_admin profile. Used so self-signup cannot set role/modules.';

GRANT EXECUTE ON FUNCTION public.current_user_may_set_profile_privileges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_may_set_profile_privileges() TO service_role;

CREATE OR REPLACE FUNCTION public.profiles_protect_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF public.current_user_may_set_profile_privileges() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'executive';
    NEW.team := NULL;
    NEW.allowed_modules := '[]'::jsonb;
    NEW.allowed_sub_modules := '[]'::jsonb;
    NEW.employee_code := NULL;
    NEW.module_access_pending := true;
    RETURN NEW;
  END IF;

  -- Self-service UPDATE: keep privilege columns from the existing row.
  NEW.role := OLD.role;
  NEW.team := OLD.team;
  NEW.allowed_modules := OLD.allowed_modules;
  NEW.allowed_sub_modules := OLD.allowed_sub_modules;
  NEW.employee_code := OLD.employee_code;
  NEW.module_access_pending := OLD.module_access_pending;
  NEW.is_active := OLD.is_active;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileges ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_privilege_columns();

NOTIFY pgrst, 'reload schema';

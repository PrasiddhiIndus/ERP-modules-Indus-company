-- =============================================================================
-- Lock employee_code (and related privilege columns) on self-UPDATE.
--
-- Payslips allow SELECT when current_user_employee_code() matches.
-- Changing your own profiles.employee_code to someone else's code
-- would open their slips. This trigger stops that.
--
-- Who can still change codes
--   User Management / admin APIs using service_role (auth.uid() <> OLD.id
--   or no end-user JWT). Super Admin self-edit via is_current_user_admin().
--
-- DATA SAFETY
--   Replaces trigger function only. No UPDATE/DELETE of profiles,
--   payslips, or employee master. Existing codes stay as they are.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  -- service_role / admin APIs are not "self" (no matching end-user uid).
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;

  IF public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'You cannot change your own role.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.allowed_modules IS DISTINCT FROM OLD.allowed_modules THEN
    RAISE EXCEPTION 'You cannot change your own module access.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.team IS DISTINCT FROM OLD.team THEN
    RAISE EXCEPTION 'You cannot change your own team.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
    RAISE EXCEPTION 'You cannot change your own employee code.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.allowed_sub_modules IS DISTINCT FROM OLD.allowed_sub_modules THEN
    RAISE EXCEPTION 'You cannot change your own module access.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'You cannot change your own account status.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profiles_self_update() IS
  'Blocks a non-admin from changing their own role, team, modules, sub-modules, employee_code, or is_active. User Management (service role) is unaffected.';

DROP TRIGGER IF EXISTS trg_guard_profiles_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profiles_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_self_update();

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Employee Master "Inactive" was failing with:
--   You cannot change your own account status.
--
-- Cause: status change syncs to profiles.is_active, then
-- guard_profiles_self_update blocked the cascaded UPDATE when the linked
-- profile belonged to the signed-in admin (or a soft-match hit their row).
--
-- Fix:
-- 1) Allow is_active changes that come from nested triggers (Employee Master
--    sync), while still blocking direct self-edits of account status.
-- 2) Tighten profile matching: prefer user_id; match employee_code only;
--    stop matching employee_id::text against profiles.employee_code.
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
  -- Cascaded from Employee Master (or other system triggers): allow.
  -- Direct profile PATCH of own is_active remains blocked for non–super admins.
  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'You cannot change your own account status.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profiles_self_update() IS
  'Blocks a non-admin from directly changing their own role, team, modules, '
  'sub-modules, employee_code, or is_active. Cascaded is_active sync from '
  'Employee Master (nested triggers) is allowed.';

CREATE OR REPLACE FUNCTION public.sync_profile_is_active_from_employee_master()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  want_active boolean;
  code text;
BEGIN
  want_active := lower(btrim(coalesce(NEW.status, 'Active'))) <> 'inactive';
  code := public.norm_emp_code(NEW.employee_code);

  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles p
    SET
      is_active = want_active,
      updated_at = now()
    WHERE p.id = NEW.user_id;
  ELSIF code <> '' THEN
    UPDATE public.profiles p
    SET
      is_active = want_active,
      updated_at = now()
    WHERE public.norm_emp_code(p.employee_code) = code;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_is_active_from_employee_master() IS
  'Mirrors admin_ifsp_employee_master.status onto profiles.is_active '
  '(user_id first, else exact employee_code).';

NOTIFY pgrst, 'reload schema';

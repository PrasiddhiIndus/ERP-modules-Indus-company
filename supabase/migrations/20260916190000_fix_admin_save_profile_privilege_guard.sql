-- =============================================================================
-- User Management: team / allowed_modules must persist via admin_save_profile.
--
-- Bug: trg_profiles_protect_privileges could treat service_role RPC updates as
-- "self service" when auth.jwt()->>'role' was empty, silently restoring OLD
-- team / modules / module_access_pending. Saves looked OK but assignments did
-- not stick.
--
-- Fix:
--   1) Recognize service_role via auth.role() as well as JWT claim.
--   2) Allow a request-local GUC bypass set by admin_save_profile.
--   3) Recreate admin_save_profile to set that GUC before UPDATE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_may_set_profile_privileges()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    coalesce(current_setting('erp.bypass_profile_privilege_guard', true), '') = 'on'
    OR coalesce(auth.role(), '') = 'service_role'
    OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
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
  'True for service_role, admin_save_profile bypass GUC, or an admin/super_admin profile.';

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

DROP FUNCTION IF EXISTS public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb, boolean);
DROP FUNCTION IF EXISTS public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb);
DROP FUNCTION IF EXISTS public.admin_save_profile(uuid, text, text, jsonb, text, boolean);

CREATE OR REPLACE FUNCTION public.admin_save_profile(
  p_id uuid,
  p_team text,
  p_role text,
  p_allowed_modules jsonb,
  p_employee_code text DEFAULT NULL,
  p_set_employee_code boolean DEFAULT false,
  p_allowed_sub_modules jsonb DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
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
  -- Ensure privilege-protect trigger allows this admin write for the request.
  PERFORM set_config('erp.bypass_profile_privilege_guard', 'on', true);

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
    allowed_modules = COALESCE(p_allowed_modules, '[]'::jsonb),
    allowed_sub_modules = COALESCE(p_allowed_sub_modules, '[]'::jsonb),
    module_access_pending = false,
    is_active = COALESCE(p_is_active, is_active),
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

REVOKE ALL ON FUNCTION public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

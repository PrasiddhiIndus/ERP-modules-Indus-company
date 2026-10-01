-- =============================================================================
-- Site employee logins: HR can create the login from People Management.
--
-- The create itself runs on the server / edge function (auth users need the
-- service key). This check runs first, with the caller's own token, so the
-- same rules as the link in site_employee_login_links() decide whether the new
-- account will really belong to this site person:
--   - caller can manage site logins
--   - person exists, is active and has an employee code
--   - code is not an IFSPL employee code (Employee Master)
--   - no login already uses the code
--
-- DATA SAFETY: additive only (one read-only function).
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.current_user_can_manage_site_logins()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20260930180000_site_employee_logins.sql first.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.site_login_create_precheck(p_person_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_person record;
  v_code text;
  v_taken text;
BEGIN
  IF NOT public.current_user_can_manage_site_logins() THEN
    RAISE EXCEPTION 'Only HR can create site employee logins.' USING ERRCODE = '42501';
  END IF;

  SELECT id, unique_code::text AS unique_code, full_name::text AS full_name, is_active
  INTO v_person
  FROM public.people
  WHERE id = p_person_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site employee not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_person.is_active IS FALSE THEN
    RAISE EXCEPTION 'This site employee is inactive. Reactivate them before creating a login.' USING ERRCODE = '22023';
  END IF;

  v_code := btrim(coalesce(v_person.unique_code, ''));
  IF coalesce(public.norm_emp_code(v_code), '') = '' THEN
    RAISE EXCEPTION 'This site employee has no employee code yet.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master em
    WHERE public.norm_emp_code(em.employee_code) = public.norm_emp_code(v_code)
  ) THEN
    RAISE EXCEPTION 'Employee code % belongs to an IFSPL employee. Create this login from IFSPL Employees instead.', v_code
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(p.email, p.id::text) INTO v_taken
  FROM public.profiles p
  WHERE public.norm_emp_code(p.employee_code) = public.norm_emp_code(v_code)
  LIMIT 1;

  IF v_taken IS NOT NULL THEN
    RAISE EXCEPTION 'A login already uses employee code % (%).', v_code, v_taken USING ERRCODE = '23505';
  END IF;

  RETURN jsonb_build_object(
    'person_id', v_person.id,
    'employee_code', v_code,
    'full_name', v_person.full_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.site_login_create_precheck(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_login_create_precheck(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

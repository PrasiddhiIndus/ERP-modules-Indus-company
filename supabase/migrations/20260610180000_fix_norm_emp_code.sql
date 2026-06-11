-- Fix profiles.employee_code → employee_master sync (norm_emp_code was referenced but never created).
-- Also adds profile_employee_code_taken for normalized duplicate checks during user create.

-- Do not DROP norm_emp_code — idx_profiles_employee_code_unique depends on it (2BP01).
-- CREATE OR REPLACE is safe when the parameter name stays p_code.
CREATE OR REPLACE FUNCTION public.norm_emp_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_attendance_employee_code(p_code);
$$;

COMMENT ON FUNCTION public.norm_emp_code(text) IS
  'Alias for normalize_attendance_employee_code — used by profile/employee_master sync triggers.';

CREATE OR REPLACE FUNCTION public.profile_employee_code_taken(
  p_code text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT p.id, p.email
  FROM public.profiles p
  WHERE public.norm_emp_code(p.employee_code) = public.norm_emp_code(p_code)
    AND public.norm_emp_code(p_code) <> ''
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.profile_employee_code_taken(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_employee_code_taken(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_employee_master_from_profile_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.admin_ifsp_employee_master m
  SET user_id = NEW.id
  WHERE coalesce(m.status, 'Active') ILIKE 'Active'
    AND (
      public.norm_emp_code(m.employee_code) = public.norm_emp_code(NEW.employee_code)
      OR public.norm_emp_code(m.employee_id::text) = public.norm_emp_code(NEW.employee_code)
    )
    AND (m.user_id IS NULL OR m.user_id = NEW.id);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_employee_master_from_profile_employee_code failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

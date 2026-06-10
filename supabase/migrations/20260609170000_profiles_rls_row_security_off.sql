-- Break profiles RLS recursion ("stack depth limit exceeded") for admin checks and edge saves.
-- SECURITY DEFINER alone still evaluates RLS on profiles; SET row_security = off fixes the loop.

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
    employee_code = CASE WHEN p_set_employee_code THEN code ELSE employee_code END
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
    employee_code = CASE WHEN p_set_employee_code THEN EXCLUDED.employee_code ELSE public.profiles.employee_code END
  RETURNING * INTO r;

  RETURN to_jsonb(r);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
  
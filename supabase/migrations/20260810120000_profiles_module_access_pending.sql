-- Persist pending/no-module-access on profiles so login paths that skip auth
-- metadata cannot silently restore broad module visibility.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS module_access_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.module_access_pending IS
  'True when the account was created without team/module grants; UI access is Settings-only until an admin assigns scope.';

-- Recreate admin_upsert_profile with pending flag support (same signature + new optional arg).
DROP FUNCTION IF EXISTS public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean);

CREATE OR REPLACE FUNCTION public.admin_upsert_profile(
  p_id uuid,
  p_email text,
  p_username text,
  p_team text,
  p_role text,
  p_allowed_modules jsonb,
  p_employee_code text DEFAULT NULL,
  p_set_employee_code boolean DEFAULT false,
  -- NULL = omit / preserve existing pending on conflict; explicit true/false still wins.
  p_module_access_pending boolean DEFAULT NULL
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

  INSERT INTO public.profiles (
    id,
    email,
    username,
    team,
    role,
    allowed_modules,
    employee_code,
    module_access_pending
  )
  VALUES (
    p_id,
    p_email,
    p_username,
    p_team,
    p_role,
    p_allowed_modules,
    CASE WHEN p_set_employee_code THEN code ELSE NULL END,
    COALESCE(p_module_access_pending, false)
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    username = EXCLUDED.username,
    team = EXCLUDED.team,
    role = EXCLUDED.role,
    allowed_modules = EXCLUDED.allowed_modules,
    employee_code = CASE
      WHEN p_set_employee_code THEN EXCLUDED.employee_code
      ELSE public.profiles.employee_code
    END,
    -- Omitted/NULL arg preserves existing lock; explicit true/false updates it.
    module_access_pending = COALESCE(p_module_access_pending, public.profiles.module_access_pending),
    updated_at = now()
  RETURNING * INTO r;

  RETURN to_jsonb(r);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean, boolean) TO service_role;

-- admin_save_profile: clear pending whenever an admin saves team/role/modules.
DROP FUNCTION IF EXISTS public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb);

CREATE OR REPLACE FUNCTION public.admin_save_profile(
  p_id uuid,
  p_team text,
  p_role text,
  p_allowed_modules jsonb,
  p_employee_code text DEFAULT NULL,
  p_set_employee_code boolean DEFAULT false,
  p_allowed_sub_modules jsonb DEFAULT NULL
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
    allowed_sub_modules = COALESCE(p_allowed_sub_modules, '[]'::jsonb),
    module_access_pending = false,
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

REVOKE ALL ON FUNCTION public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb) TO service_role;

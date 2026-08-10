-- Account active flag: Employee Master Inactive (or User Management toggle) revokes ERP login.
-- Ban/unban is mirrored onto auth.users.banned_until so GoTrue rejects password + refresh grants.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS
  'When false, ERP login/session is revoked (synced from admin_ifsp_employee_master.status or User Management). Orthogonal to module_access_pending.';

-- Backfill from Employee Master soft-match on employee_code / user_id.
UPDATE public.profiles p
SET is_active = false
WHERE p.is_active IS DISTINCT FROM false
  AND EXISTS (
    SELECT 1
    FROM public.admin_ifsp_employee_master m
    WHERE lower(btrim(coalesce(m.status, ''))) = 'inactive'
      AND (
        (m.user_id IS NOT NULL AND m.user_id = p.id)
        OR (
          public.norm_emp_code(p.employee_code) <> ''
          AND (
            public.norm_emp_code(m.employee_code) = public.norm_emp_code(p.employee_code)
            OR public.norm_emp_code(m.employee_id::text) = public.norm_emp_code(p.employee_code)
          )
        )
      )
  );

-- Master status -> profiles.is_active
CREATE OR REPLACE FUNCTION public.sync_profile_is_active_from_employee_master()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  want_active boolean;
BEGIN
  want_active := lower(btrim(coalesce(NEW.status, 'Active'))) <> 'inactive';

  UPDATE public.profiles p
  SET
    is_active = want_active,
    updated_at = now()
  WHERE
    (NEW.user_id IS NOT NULL AND p.id = NEW.user_id)
    OR (
      public.norm_emp_code(p.employee_code) <> ''
      AND (
        public.norm_emp_code(NEW.employee_code) = public.norm_emp_code(p.employee_code)
        OR public.norm_emp_code(NEW.employee_id::text) = public.norm_emp_code(p.employee_code)
      )
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_is_active_from_employee_master ON public.admin_ifsp_employee_master;
CREATE TRIGGER trg_sync_profile_is_active_from_employee_master
  AFTER INSERT OR UPDATE OF status, employee_code, user_id, employee_id
  ON public.admin_ifsp_employee_master
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_is_active_from_employee_master();

-- profiles.is_active -> auth.users.banned_until (true pre-token / refresh rejection at GoTrue)
CREATE OR REPLACE FUNCTION public.sync_auth_ban_from_profile_is_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  IF NEW.is_active = false THEN
    -- Prefer a far-future ban over 'infinity' — GoTrue can return
    -- "Database error querying schema" for infinity banned_until on some versions.
    UPDATE auth.users
    SET banned_until = '9999-12-31 23:59:59+00'::timestamptz
    WHERE id = NEW.id;
  ELSE
    UPDATE auth.users
    SET banned_until = NULL
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_auth_ban_from_profile_is_active ON public.profiles;
CREATE TRIGGER trg_sync_auth_ban_from_profile_is_active
  AFTER INSERT OR UPDATE OF is_active
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_ban_from_profile_is_active();

-- Align auth ban with current profiles.is_active (idempotent).
UPDATE auth.users u
SET banned_until = '9999-12-31 23:59:59+00'::timestamptz
FROM public.profiles p
WHERE p.id = u.id
  AND p.is_active = false
  AND (u.banned_until IS NULL OR u.banned_until < '9999-12-31 23:59:59+00'::timestamptz);

UPDATE auth.users u
SET banned_until = NULL
FROM public.profiles p
WHERE p.id = u.id
  AND p.is_active = true
  AND u.banned_until IS NOT NULL;

-- Recreate admin_upsert_profile: pending + is_active use omit-means-unchanged on conflict.
DROP FUNCTION IF EXISTS public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.admin_upsert_profile(
  p_id uuid,
  p_email text,
  p_username text,
  p_team text,
  p_role text,
  p_allowed_modules jsonb,
  p_employee_code text DEFAULT NULL,
  p_set_employee_code boolean DEFAULT false,
  p_module_access_pending boolean DEFAULT NULL,
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
    module_access_pending,
    is_active
  )
  VALUES (
    p_id,
    p_email,
    p_username,
    p_team,
    p_role,
    p_allowed_modules,
    CASE WHEN p_set_employee_code THEN code ELSE NULL END,
    COALESCE(p_module_access_pending, false),
    COALESCE(p_is_active, true)
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
    module_access_pending = COALESCE(p_module_access_pending, public.profiles.module_access_pending),
    is_active = COALESCE(p_is_active, public.profiles.is_active),
    updated_at = now()
  RETURNING * INTO r;

  RETURN to_jsonb(r);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, text, jsonb, text, boolean, boolean, boolean) TO service_role;

-- admin_save_profile: optional is_active (NULL = unchanged); still clears module_access_pending on save.
DROP FUNCTION IF EXISTS public.admin_save_profile(uuid, text, text, jsonb, text, boolean, jsonb);

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

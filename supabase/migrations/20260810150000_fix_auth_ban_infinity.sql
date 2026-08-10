-- Fix GoTrue "Database error querying schema" for inactive/banned users.
-- Cause: banned_until = 'infinity' (from 20260810140000) can break Auth's user scan
-- on some GoTrue versions, so BOTH ERP and Indus One (shared auth) show that opaque error.
-- Fix: use a finite far-future timestamp instead. No Indus One app changes required.

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
    UPDATE auth.users
    SET banned_until = timestamptz '9999-12-31 23:59:59+00'
    WHERE id = NEW.id;
  ELSE
    UPDATE auth.users
    SET banned_until = NULL
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Rewrite every inactive profile's ban to a finite timestamp (covers infinity and nulls).
UPDATE auth.users u
SET banned_until = timestamptz '9999-12-31 23:59:59+00'
FROM public.profiles p
WHERE p.id = u.id
  AND p.is_active = false;

-- Safety net: any remaining infinity bans (even without a matching inactive profile).
UPDATE auth.users
SET banned_until = timestamptz '9999-12-31 23:59:59+00'
WHERE banned_until = 'infinity'::timestamptz;

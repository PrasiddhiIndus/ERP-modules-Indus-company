-- Keep legacy public.app_users in sync with public.profiles (if app_users exists).

CREATE OR REPLACE FUNCTION public.trg_sync_app_users_from_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.app_users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.username, split_part(COALESCE(NEW.email, 'user@local'), '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_app_users_from_profiles ON public.profiles;
CREATE TRIGGER sync_app_users_from_profiles
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_app_users_from_profiles();

-- Backfill existing profiles into app_users
DO $$
BEGIN
  IF to_regclass('public.app_users') IS NOT NULL THEN
    INSERT INTO public.app_users (id, email, full_name)
    SELECT
      p.id,
      p.email,
      COALESCE(p.username, split_part(COALESCE(p.email, 'user@local'), '@', 1))
    FROM public.profiles p
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name;
  END IF;
EXCEPTION
  WHEN undefined_column THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END;
$$;

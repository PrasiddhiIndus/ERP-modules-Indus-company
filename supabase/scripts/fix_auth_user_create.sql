-- Run in Supabase Dashboard → SQL Editor if creating users fails with:
--   "Database error creating new user"
--
-- Root cause: a trigger on auth.users inserts into public.profiles without SECURITY DEFINER / row_security off,
-- or the insert error aborts the auth transaction.

-- Copy of supabase/migrations/20260609190000_fix_auth_user_created_trigger.sql

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, team, role, allowed_modules, employee_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
      split_part(COALESCE(NEW.email, 'user@local'), '@', 1)
    ),
    NULLIF(btrim(NEW.raw_user_meta_data->>'team'), ''),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'role'), ''), 'executive'),
    COALESCE(NEW.raw_user_meta_data->'allowed_modules', '[]'::jsonb),
    NULLIF(btrim(NEW.raw_user_meta_data->>'employee_code'), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user skipped profile insert for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

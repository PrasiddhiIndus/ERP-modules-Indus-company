-- Run in Supabase Dashboard → SQL Editor if creating users fails with:
--   "Database error creating new user"
--
-- Signup stub only: executive, empty modules. Never copies metadata role.
-- Prefer supabase/migrations/20260901130000_profiles_no_self_assign_role.sql

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, username, team, role, allowed_modules, allowed_sub_modules, employee_code, module_access_pending
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'username'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
      split_part(COALESCE(NEW.email, 'user@local'), '@', 1)
    ),
    NULL,
    'executive',
    '[]'::jsonb,
    '[]'::jsonb,
    NULL,
    true
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

-- Backfill public.profiles for auth users that exist but have no profile row.
-- Run in Supabase SQL Editor if needed before/after deploying access-check fix.

INSERT INTO public.profiles (id, email, username, team, role, allowed_modules)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'username',
    split_part(u.email, '@', 1)
  ),
  u.raw_user_meta_data->>'team',
  COALESCE(u.raw_user_meta_data->>'role', 'executive'),
  COALESCE(u.raw_user_meta_data->'allowed_modules', '[]'::jsonb)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- PRODUCTION LOGIN FIX — run on wbyzhknaqcjqqtwopupl ONLY (Supabase SQL Editor)
--
-- Use when: correct password spins forever, or "Could not load profile" after login.
-- Login uses TWO places:
--   1) auth.users — email + password (Supabase Authentication → Users)
--   2) public.profiles — role, team, allowed_modules (ERP access after login)
--
-- Wrong password → HTTP 400 on /auth/v1/token (normal).
-- Correct password but hang → usually profiles row missing or RLS blocking SELECT.
-- =============================================================================

-- Step 1: Health checks (all should be OK)
SELECT 'authenticated read profiles' AS check_name,
  CASE WHEN has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    THEN 'OK' ELSE 'MISSING — run profiles RLS migration below' END AS status
UNION ALL
SELECT 'auth users without profile row',
  (SELECT count(*)::text
   FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id))
UNION ALL
SELECT 'total profiles rows',
  (SELECT count(*)::text FROM public.profiles);

-- Step 2: Backfill profiles for every auth user missing a row
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

-- Step 3: List users still missing profiles (should be 0 rows)
SELECT u.id, u.email, u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Step 4: If Step 1 shows MISSING or login still fails with RLS / stack depth errors,
-- run this migration file in SQL Editor (production only, once):
--   supabase/migrations/20260609180000_profiles_rls_definitive_fix.sql
--
-- Step 5: Deploy edge function (from project root, with production Supabase CLI linked):
--   supabase functions deploy login-check --no-verify-jwt
--
-- Step 6: In Supabase Dashboard → Authentication → Users:
--   - Each login email must exist
--   - "Email confirmed" should be ON (or disable email confirmation in Auth settings)
--   - Reset password if unsure

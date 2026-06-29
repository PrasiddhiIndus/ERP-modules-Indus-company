-- =============================================================================
-- STAGING — create rahul.ifspl@gmail.com as Super Admin Pro (full access)
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY — never run on production
--
-- PREREQUISITES: staging_bootstrap.sql + staging_fix_403.sql (3× OK)
--
-- ── STEP A — Auth user (pick ONE method) ─────────────────────────────────────
--
-- METHOD 1 (Dashboard — easiest):
--   Authentication → Providers → Email → turn OFF "Confirm email" (save)
--   Authentication → Users → Add user
--     Email: rahul.ifspl@gmail.com
--     Password: 123456
--     ✓ Auto Confirm User  ← required
--
-- METHOD 2 (user already exists but login fails):
--   Authentication → Users → rahul.ifspl@gmail.com
--     → Confirm user / mark email confirmed
--     → OR delete user and re-add with Auto Confirm ON
--
-- METHOD 3 (CLI — needs staging service_role key from Dashboard → API):
--   set STAGING_SUPABASE_SERVICE_ROLE_KEY=your_staging_service_role_key
--   npm run staging:create-rahul-admin
--
-- ── STEP B — Run this SQL ────────────────────────────────────────────────────
-- =============================================================================

INSERT INTO public.profiles (id, email, username, team, role, allowed_modules)
SELECT
  u.id,
  u.email,
  COALESCE(
    NULLIF(btrim(u.raw_user_meta_data->>'username'), ''),
    NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
    'rahul'
  ),
  'admin',
  'super_admin_pro',
  '["marketing","admin","billing","settings","hr","operations","projects","commercialMt","commercialRm","finance","procurement","amc","compliance","fireTender","itIs","tracking"]'::jsonb
FROM auth.users u
WHERE lower(u.email) = lower('rahul.ifspl@gmail.com')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  username = EXCLUDED.username,
  team = EXCLUDED.team,
  role = EXCLUDED.role,
  allowed_modules = EXCLUDED.allowed_modules,
  updated_at = now();

-- Verify — must return 1 row with role super_admin_pro:
SELECT id, email, role, team, allowed_modules
FROM public.profiles
WHERE lower(email) = lower('rahul.ifspl@gmail.com');

-- If STEP A user does not exist, the SELECT above returns 0 rows.
-- If login still says "Invalid login credentials", reset password in Dashboard:
--   Authentication → Users → rahul.ifspl@gmail.com → Send password recovery
--   OR delete user and re-add with Auto Confirm ON.

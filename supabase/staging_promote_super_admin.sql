-- =============================================================================
-- STAGING — promote any user to super_admin_pro (ALL modules + dashboard)
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY
--
-- Replace email, run in SQL Editor, then sign out and sign in again.
-- =============================================================================

UPDATE public.profiles
SET
  role = 'super_admin_pro',
  team = 'admin',
  allowed_modules = '["marketing","admin","billing","settings","hr","operations","projects","commercialMt","commercialRm","finance","procurement","amc","compliance","fireTender","itIs","tracking"]'::jsonb,
  updated_at = now()
WHERE lower(email) = lower('prasiddhidixena.ifspl@gmail.com');

-- Verify (must return 1 row, role = super_admin_pro):
SELECT id, email, username, role, team, allowed_modules
FROM public.profiles
WHERE lower(email) = lower('prasiddhidixena.ifspl@gmail.com');

-- If 0 rows: user exists in Auth but not profiles — run:
-- INSERT INTO public.profiles (id, email, username, team, role, allowed_modules)
-- SELECT id, email, COALESCE(raw_user_meta_data->>'username', split_part(email,'@',1)),
--   'admin', 'super_admin_pro',
--   '["marketing","admin","billing","settings","hr","operations","projects"]'::jsonb
-- FROM auth.users WHERE lower(email) = lower('prasiddhidixena.ifspl@gmail.com')
-- ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, team = EXCLUDED.team, allowed_modules = EXCLUDED.allowed_modules;

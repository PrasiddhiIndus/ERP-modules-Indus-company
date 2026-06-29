-- Create first staging admin (run AFTER staging_bootstrap.sql + staging_fix_403.sql)
--
-- EASIER STAGING LOGIN (recommended):
--   Dashboard → Authentication → Providers → Email → disable "Confirm email"
--   Then register/login works without clicking email links.
--
-- Email link must open your app URL (not localhost:3000):
--   Authentication → URL Configuration → Site URL http://localhost:5173 (local)
--   Redirect URLs: http://localhost:5173/**  and  http://139.59.58.167:3001/**
--
-- 1) Dashboard → Authentication → Users → Add user (password + Auto Confirm ON)
-- 2) Replace email below and run:

UPDATE public.profiles
SET
  role = 'super_admin_pro',
  team = 'admin',
  allowed_modules = '["marketing","admin","billing","settings","hr","operations","projects"]'::jsonb,
  updated_at = now()
WHERE email = 'admin@yourcompany.com';

-- Employees: fix module access on staging (replace email):
-- UPDATE public.profiles SET team = 'marketing', role = 'executive',
--   allowed_modules = '[]'::jsonb WHERE email = 'you@example.com';
--
-- Full admin access for testing (all modules in sidebar):
-- UPDATE public.profiles SET role = 'super_admin_pro', team = 'admin',
--   allowed_modules = '["marketing","admin","billing","settings","hr","operations","projects"]'::jsonb
-- WHERE email = 'you@example.com';

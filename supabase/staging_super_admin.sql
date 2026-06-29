-- =============================================================================
-- STAGING — full module access (super_admin_pro) like production
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY
--
-- Prerequisites: staging_bootstrap.sql + staging_fix_403.sql already run.
-- Replace email below, run, then sign out and sign in on staging.
-- =============================================================================

UPDATE public.profiles
SET
  role = 'super_admin_pro',
  team = 'admin',
  allowed_modules = '["marketing","admin","billing","settings","hr","operations","projects","commercialMt","commercialRm","finance","procurement","amc","compliance","fireTender","itIs","tracking"]'::jsonb,
  updated_at = now()
WHERE email = 'YOUR_EMAIL@example.com';

-- Verify (should show super_admin_pro):
SELECT id, email, role, team, allowed_modules
FROM public.profiles
WHERE email = 'YOUR_EMAIL@example.com';

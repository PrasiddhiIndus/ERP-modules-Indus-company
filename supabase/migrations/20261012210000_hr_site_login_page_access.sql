-- HR People Management: whoever can open the page can create / manage site employee logins.
-- Run after 20260930180000_site_employee_logins.sql and 20260930190000_site_login_create.sql.
--
-- The app opens People Management for admin roles, HR team, the full HR module, or the
-- "People Management" screen. The database also refused HR users whose own employee code
-- is in the site people list (treated as a site-employee login), so they could open the
-- page but not create a login. That extra condition is removed.
-- Still safe: HR cannot grant the People Management screen to a site login
-- (is_site_login_grantable_screen), so only an administrator can give this page.
-- Only this helper changes; every login function already calls it.

CREATE OR REPLACE FUNCTION public.current_user_can_manage_site_logins()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND auth.uid() IS NOT NULL
      AND (
        public.normalize_erp_role(p.role) IN ('admin', 'super_admin', 'super_admin_pro')
        OR public.normalize_erp_module_key(p.team) = 'hr'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(p) -> 'allowed_modules')) m(value)
          WHERE public.normalize_erp_module_key(m.value) = 'hr'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(public.jsonb_text_array(to_jsonb(p) -> 'allowed_sub_modules')) s(value)
          WHERE lower(btrim(s.value)) = 'hr.people-management'
        )
      )
  )
$$;

COMMENT ON FUNCTION public.current_user_can_manage_site_logins() IS
  'Anyone who can open HR People Management: admin roles, HR team, full HR module, or the People Management screen.';

GRANT EXECUTE ON FUNCTION public.current_user_can_manage_site_logins() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

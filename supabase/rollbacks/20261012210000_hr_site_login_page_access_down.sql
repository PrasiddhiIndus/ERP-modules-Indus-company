-- Rollback for 20261012210000_hr_site_login_page_access.sql
-- Restores the check from 20260930180000 (site-employee logins excluded).

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
        OR (
          NOT public.current_user_is_site_employee_login()
          AND (
            public.normalize_erp_module_key(p.team) = 'hr'
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
      )
  )
$$;

COMMENT ON FUNCTION public.current_user_can_manage_site_logins() IS
  'Admin roles, or HR staff (team / full HR module / People Management screen) who are not site-employee logins themselves.';

GRANT EXECUTE ON FUNCTION public.current_user_can_manage_site_logins() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

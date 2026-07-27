-- Admin module users (role admin, team admin, allowed_modules admin) must see all
-- leave balances — same access as employee master and leave inbox.
-- Previously `current_user_has_attendance_admin_access()` only matched role admin
-- or jsonb @> checks on allowed_modules, which missed many admin-module logins.

CREATE OR REPLACE FUNCTION public.current_user_has_attendance_admin_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.current_user_has_admin_module_access()
    OR public.current_user_can_access_module('hr')
    OR public.current_user_can_access_module('payroll')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.team, '')) IN ('hr', 'admin')
    );
$$;

COMMENT ON FUNCTION public.current_user_has_attendance_admin_access() IS
  'HR/attendance admin: admin module access, HR/payroll modules, or HR/admin team.';

GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;

NOTIFY pgrst, 'reload schema';

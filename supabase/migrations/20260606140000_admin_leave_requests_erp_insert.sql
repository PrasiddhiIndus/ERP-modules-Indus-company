-- ERP admins may insert mirror rows on admin_leave_requests (LMS apply may only create leave_requests).

DROP POLICY IF EXISTS admin_leave_requests_insert_erp ON indus_one.admin_leave_requests;
CREATE POLICY admin_leave_requests_insert_erp ON indus_one.admin_leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

NOTIFY pgrst, 'reload schema';

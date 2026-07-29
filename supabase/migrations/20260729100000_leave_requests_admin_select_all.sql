-- Leave inbox: admin-module users must see ALL leave requests (not only their own).
-- Policies previously relied only on current_user_can_access_module('admin'), which
-- misses some admin-module logins that current_user_has_admin_module_access() covers
-- (same helper as Employee Master).
-- Also grant service_role SELECT — ERP Node API uses service_role; table privileges
-- are separate from RLS (permission denied without these GRANTs).

GRANT USAGE ON SCHEMA indus_one TO authenticated, service_role;

GRANT SELECT, UPDATE ON indus_one.leave_requests TO authenticated;
GRANT SELECT ON indus_one.leave_requests TO service_role;

GRANT SELECT, INSERT, UPDATE ON indus_one.admin_leave_requests TO authenticated;
GRANT SELECT ON indus_one.admin_leave_requests TO service_role;

DROP POLICY IF EXISTS admin_leave_requests_select_own ON indus_one.admin_leave_requests;
CREATE POLICY admin_leave_requests_select_own ON indus_one.admin_leave_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_admin_module_access()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

DROP POLICY IF EXISTS admin_leave_requests_update ON indus_one.admin_leave_requests;
CREATE POLICY admin_leave_requests_update ON indus_one.admin_leave_requests
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_admin_module_access()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_has_admin_module_access()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

DROP POLICY IF EXISTS leave_requests_select_erp ON indus_one.leave_requests;
CREATE POLICY leave_requests_select_erp ON indus_one.leave_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_admin_module_access()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

DROP POLICY IF EXISTS leave_requests_update_erp ON indus_one.leave_requests;
CREATE POLICY leave_requests_update_erp ON indus_one.leave_requests
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_has_admin_module_access()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_has_admin_module_access()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

NOTIFY pgrst, 'reload schema';

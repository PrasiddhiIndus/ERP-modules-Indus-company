-- ERP admin read/update on LMS leave_requests table (Indus One apply).
-- Safe if policies already exist from LMS — uses DROP IF EXISTS + recreate.

ALTER TABLE indus_one.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_requests_select_erp ON indus_one.leave_requests;
CREATE POLICY leave_requests_select_erp ON indus_one.leave_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (
      SELECT coalesce(indus_one.current_user_is_manager(), false)
    )
  );

DROP POLICY IF EXISTS leave_requests_update_erp ON indus_one.leave_requests;
CREATE POLICY leave_requests_update_erp ON indus_one.leave_requests
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (
      SELECT coalesce(indus_one.current_user_is_manager(), false)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (
      SELECT coalesce(indus_one.current_user_is_manager(), false)
    )
  );

GRANT SELECT, UPDATE ON indus_one.leave_requests TO authenticated;

NOTIFY pgrst, 'reload schema';

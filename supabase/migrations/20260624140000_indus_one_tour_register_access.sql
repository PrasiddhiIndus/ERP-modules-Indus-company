-- Daily Attendance Register: read approved tours from indus_one (T + location/reason comments).

ALTER TABLE public.admin_attendance_register
  ADD COLUMN IF NOT EXISTS tour_request_id uuid;

GRANT USAGE ON SCHEMA indus_one TO authenticated, service_role;

GRANT SELECT ON indus_one.admin_tour_requests TO authenticated, service_role;
GRANT SELECT ON indus_one.tour_requests TO authenticated, service_role;
GRANT SELECT ON indus_one.admin_tour_attendance_marks TO authenticated, service_role;

DROP POLICY IF EXISTS admin_tour_requests_select_erp ON indus_one.admin_tour_requests;
CREATE POLICY admin_tour_requests_select_erp ON indus_one.admin_tour_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

DROP POLICY IF EXISTS tour_requests_select_erp ON indus_one.tour_requests;
CREATE POLICY tour_requests_select_erp ON indus_one.tour_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

DROP POLICY IF EXISTS admin_tour_attendance_marks_select_erp ON indus_one.admin_tour_attendance_marks;
CREATE POLICY admin_tour_attendance_marks_select_erp ON indus_one.admin_tour_attendance_marks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM indus_one.admin_tour_requests r
      WHERE r.id = tour_request_id AND r.user_id = auth.uid()
    )
    OR public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

ALTER TABLE indus_one.admin_tour_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.tour_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE indus_one.admin_tour_attendance_marks ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

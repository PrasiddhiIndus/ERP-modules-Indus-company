-- =============================================================================
-- DATA SAFETY: This migration does NOT delete, update, truncate, or drop any
-- table rows. It only replaces Row Level Security POLICY definitions (metadata).
-- Existing leave/tour/request/mark rows are untouched.
-- =============================================================================
--
-- Performance-only: wrap the same access checks in (SELECT ...) so Postgres
-- evaluates them once per statement (InitPlan), not per row.
-- Access rules unchanged vs:
--   20260605100000_admin_leave_workflow.sql
--   20260624140000_indus_one_tour_register_access.sql
--
-- If you see "deadlock detected": close Daily Attendance (stop long SELECTs),
-- wait a few seconds, and re-run. Safe to re-run (idempotent policy replace).
-- Do not run this in the same session as another long migration on indus_one.

SET lock_timeout = '20s';

-- Leave attendance marks — same OR branches as before; InitPlan wrappers only.
DROP POLICY IF EXISTS admin_leave_attendance_marks_select ON indus_one.admin_leave_attendance_marks;
CREATE POLICY admin_leave_attendance_marks_select
  ON indus_one.admin_leave_attendance_marks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM indus_one.admin_leave_requests r
      WHERE r.id = leave_request_id
        AND r.user_id = (SELECT auth.uid())
    )
    OR (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

-- Tour attendance marks
DROP POLICY IF EXISTS admin_tour_attendance_marks_select_erp ON indus_one.admin_tour_attendance_marks;
DROP POLICY IF EXISTS admin_tour_attendance_marks_select ON indus_one.admin_tour_attendance_marks;
CREATE POLICY admin_tour_attendance_marks_select_erp
  ON indus_one.admin_tour_attendance_marks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM indus_one.admin_tour_requests r
      WHERE r.id = tour_request_id
        AND r.user_id = (SELECT auth.uid())
    )
    OR (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

-- Tour requests (admin)
DROP POLICY IF EXISTS admin_tour_requests_select_erp ON indus_one.admin_tour_requests;
DROP POLICY IF EXISTS admin_tour_requests_select ON indus_one.admin_tour_requests;
CREATE POLICY admin_tour_requests_select_erp
  ON indus_one.admin_tour_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

-- Tour requests (LMS)
DROP POLICY IF EXISTS tour_requests_select_erp ON indus_one.tour_requests;
DROP POLICY IF EXISTS tour_requests_select ON indus_one.tour_requests;
CREATE POLICY tour_requests_select_erp
  ON indus_one.tour_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.current_user_can_access_module('admin'))
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  );

NOTIFY pgrst, 'reload schema';

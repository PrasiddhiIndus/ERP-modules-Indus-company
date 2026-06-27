-- Daily Attendance Register: speed up approved-leave lookups that were timing out
-- via PostgREST (status + date-range overlap on indus_one.admin_leave_requests).
--
-- App query pattern (attendanceDaily.fetchApprovedLeaveMarksForMonth fallback):
--   status = 'approved' AND from_date <= :month_end AND to_date >= :month_start
--
-- Primary path reads admin_leave_attendance_marks by register_date; when empty,
-- falls back to admin_leave_requests. Both paths lacked supporting indexes.

-- Overlap filter on approved leave requests (partial — only rows that matter).
CREATE INDEX IF NOT EXISTS idx_admin_leave_requests_approved_dates
  ON indus_one.admin_leave_requests (from_date, to_date)
  WHERE status = 'approved';

-- Register marks for a calendar month (primary read path).
CREATE INDEX IF NOT EXISTS idx_admin_leave_attendance_marks_register_active
  ON indus_one.admin_leave_attendance_marks (register_date, employee_code)
  WHERE reverted = false;

-- RLS EXISTS (leave_request_id) on attendance marks + joins from register sync.
CREATE INDEX IF NOT EXISTS idx_admin_leave_attendance_marks_request_active
  ON indus_one.admin_leave_attendance_marks (leave_request_id)
  WHERE reverted = false;

ANALYZE indus_one.admin_leave_requests;
ANALYZE indus_one.admin_leave_attendance_marks;

NOTIFY pgrst, 'reload schema';

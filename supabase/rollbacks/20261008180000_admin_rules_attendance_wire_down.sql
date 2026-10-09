-- Rollback for 20261008180000_admin_rules_attendance_wire.sql.
-- Attendance rules are read-only again; a punch always wins over leave (as before).
-- Saved rule values stay in the history. The browser keeps reading them until the app is
-- reverted too — set them back to the starting times first if that matters.

UPDATE public.admin_attendance_rules
SET is_wired = false,
    engine_ref = 'Phase 2E'
WHERE rule_key IN (
  'att.half_day_cutoff', 'att.purple_first_from', 'att.purple_first_to', 'att.purple_last_before',
  'att.shift_start', 'att.shift_end', 'att.grace_minutes', 'att.punch_overrides_leave'
);

CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_punch_priority(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    indus_one.admin_leave_date_has_punch(p_employee_code, p_date)
    OR indus_one.admin_leave_register_has_punch(p_employee_code, p_date);
$$;

NOTIFY pgrst, 'reload schema';

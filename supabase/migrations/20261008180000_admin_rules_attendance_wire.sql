-- =============================================================================
-- Rules Console: Attendance rules become editable and are read by attendance.
--
-- Needs 20261008120000 … 20261008130000 (Rules Console scopes and get_rule_value).
-- Rollback: supabase/rollbacks/20261008180000_admin_rules_attendance_wire_down.sql
--
-- The company starting values are the times used today, so nothing changes until a rule is edited:
--   att.half_day_cutoff        13:00  punch → HD (last punch on/before this time)
--   att.purple_first_from/to   12:00 / 15:00  purple P (first punch in this window)
--   att.purple_last_before     12:00  purple P (last punch before) — such a day stays P, not HD
--   att.shift_start / end      09:00 / 18:00  punch in Late / punch out Early in punch screens, reports, export
--   att.grace_minutes          0      minutes after the shift start before a punch in is Late
--   att.punch_overrides_leave  on     a punch day wins over approved leave (register, balance, cancel)
-- The first six are applied in the browser (src/lib/attendanceRules.js attendanceTimesFor).
-- att.punch_overrides_leave is also applied here in indus_one.admin_leave_date_punch_priority, which
-- every leave path uses (apply to register, deductible days, cancel / reject).
-- =============================================================================

UPDATE public.admin_attendance_rules r
SET is_wired = true,
    hidden_until_wired = false,
    engine_ref = s.engine_ref,
    applies_note = s.applies_note
FROM (VALUES
  ('att.half_day_cutoff',
   'src/lib/attendanceRules.js attendanceTimesFor → punchesToPresentRegisterRows (register sync from punches)',
   'Attendance register (marks from punches)'),
  ('att.purple_first_from',
   'attendanceTimesFor → isPurplePresentPunch (register grid, purple P alerts)',
   'Attendance register colours and alerts'),
  ('att.purple_first_to',
   'attendanceTimesFor → isPurplePresentPunch (register grid, purple P alerts)',
   'Attendance register colours and alerts'),
  ('att.purple_last_before',
   'attendanceTimesFor → isPurplePresentPunch; registerMarkFromPunchWindow (stays P, not HD)',
   'Attendance register colours, alerts and marks from punches'),
  ('att.shift_start',
   'attendanceTimesFor → pairPunchesToDailyRows punch-in status (punch screens, late report, Excel export)',
   'Punch screens, late report and register export'),
  ('att.shift_end',
   'attendanceTimesFor → pairPunchesToDailyRows punch-out status',
   'Punch screens'),
  ('att.grace_minutes',
   'attendanceTimesFor → comparePunchInStatus',
   'Punch screens, late report and register export'),
  ('att.punch_overrides_leave',
   'indus_one.admin_leave_date_punch_priority (leave → register, balance, cancel); mergeApprovedLeaveMarksIntoManualMarks',
   'Attendance register and leave balances')
) AS s(rule_key, engine_ref, applies_note)
WHERE r.rule_key = s.rule_key
  AND NOT r.retired;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_punch_priority(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce((public.get_rule_value(p_employee_code, 'att.punch_overrides_leave', p_date) #>> '{}')::boolean, true)
    AND (
      indus_one.admin_leave_date_has_punch(p_employee_code, p_date)
      OR indus_one.admin_leave_register_has_punch(p_employee_code, p_date)
    );
$$;

NOTIFY pgrst, 'reload schema';

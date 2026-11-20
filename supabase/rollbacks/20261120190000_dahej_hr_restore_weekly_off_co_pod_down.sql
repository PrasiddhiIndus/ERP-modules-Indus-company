-- Rollback for 20261120190000_dahej_hr_restore_weekly_off_co_pod.sql.
-- Removes only the inherit (NULL) wo.pattern rows this migration inserted.
-- Does not delete catch-up C/O credits, restore prior "none" values, or
-- revert Employee Master department label edits / norm-function alias.

DELETE FROM public.admin_attendance_rule_values v
WHERE v.rule_key = 'wo.pattern'
  AND v.status = 'active'
  AND v.value IS NULL
  AND v.reason = 'Restore Dahej-HR weekly offs (C/O + POD on WO)';

NOTIFY pgrst, 'reload schema';

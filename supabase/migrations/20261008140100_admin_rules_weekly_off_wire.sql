-- =============================================================================
-- Rules Console — Phase 2A wiring: weekly-off rules become editable.
--
-- Apply only after 20261008140000 is live and scripts/rulesConsole/regression.sql
-- returns the same rows as before it. Changes no result by itself.
-- Rollback: supabase/rollbacks/20261008140100_admin_rules_weekly_off_wire_down.sql
-- =============================================================================

UPDATE public.admin_attendance_rules
SET is_wired = true, hidden_until_wired = false
WHERE rule_key IN ('wo.pattern', 'wo.custom_days', 'wo.auto', 'wo.auto_holiday')
  AND NOT retired;

NOTIFY pgrst, 'reload schema';

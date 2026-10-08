-- Rollback for 20261008140100_admin_rules_weekly_off_wire.sql — rules become read-only again.
-- Values already saved stay in force; roll back 20261008140000 as well to stop the engine reading them.
-- Afterwards: DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008140100';

UPDATE public.admin_attendance_rules
SET is_wired = false
WHERE rule_key IN ('wo.pattern', 'wo.custom_days', 'wo.auto', 'wo.auto_holiday');

UPDATE public.admin_attendance_rules
SET hidden_until_wired = true
WHERE rule_key IN ('wo.pattern', 'wo.custom_days');

NOTIFY pgrst, 'reload schema';

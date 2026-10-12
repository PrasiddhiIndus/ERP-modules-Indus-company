-- Rollback for supabase/migrations/20261012180000_iev_oc_schema_repair.sql
-- The repair only adds columns/constraints the current OC Creation needs; the added columns hold
-- sign-off data, so they are kept. This removes the manual OC No. check it may have added.
-- To remove OC Creation entirely use 20261012120000_iev_oc_creation_down.sql.

ALTER TABLE public.oc_master DROP CONSTRAINT IF EXISTS oc_master_oc_no_manual_check;

NOTIFY pgrst, 'reload schema';

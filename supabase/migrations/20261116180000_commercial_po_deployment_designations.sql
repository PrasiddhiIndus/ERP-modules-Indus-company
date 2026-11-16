-- =============================================================================
-- Reverted: Manpower / vehicle custom designations use cm_oc_master.extra_deployment
-- only (no separate catalogue table).
--
-- Earlier drafts of this migration created public.cm_deployment_designations.
-- This revision is a no-op create path for fresh environments. Environments that
-- already applied the table-creating revision should also apply
-- 20261116190000_drop_commercial_po_deployment_designations.sql.
-- =============================================================================

SELECT 1;

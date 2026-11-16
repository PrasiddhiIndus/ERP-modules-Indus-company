-- =============================================================================
-- Drop unused Commercial deployment-designations catalogue (if present).
-- Custom Manpower / vehicle fields are stored on cm_oc_master.extra_deployment.
-- Safe when the table was never created. Does not touch cm_oc_master or cm_oc_save.
-- Rollback: supabase/rollbacks/20261116190000_drop_commercial_po_deployment_designations_down.sql
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cm_deployment_designations_guard ON public.cm_deployment_designations;
DROP FUNCTION IF EXISTS public.cm_deployment_designations_guard();
DROP TABLE IF EXISTS public.cm_deployment_designations;

NOTIFY pgrst, 'reload schema';

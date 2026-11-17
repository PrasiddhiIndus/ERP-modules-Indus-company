-- Rollback for 20261116120000_commercial_po_at_glance.sql
-- Removes only the Commercial PO At Glance objects (cm_oc_*). Nothing else is touched.
-- WARNING: drops all Commercial PO At Glance records and its sign-off assignment.

DROP TRIGGER IF EXISTS cm_oc_signoff_stamp ON public.cm_oc_signoff;
DROP TRIGGER IF EXISTS cm_oc_master_guard ON public.cm_oc_master;

DROP FUNCTION IF EXISTS public.cm_oc_save(jsonb);
DROP FUNCTION IF EXISTS public.cm_oc_signoff_stamp();
DROP FUNCTION IF EXISTS public.cm_oc_assert_can_sign(text);
DROP FUNCTION IF EXISTS public.cm_oc_master_guard();
DROP FUNCTION IF EXISTS public.cm_oc_employee_options();

DROP TABLE IF EXISTS public.cm_oc_signoff_assignees;
DROP TABLE IF EXISTS public.cm_oc_signoff;
DROP TABLE IF EXISTS public.cm_oc_contacts;
DROP TABLE IF EXISTS public.cm_oc_master;

DROP FUNCTION IF EXISTS public.cm_oc_current_user_can_configure();
DROP FUNCTION IF EXISTS public.cm_oc_current_user_has_access();

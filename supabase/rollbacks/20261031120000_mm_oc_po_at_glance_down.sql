-- Rollback for 20261031120000_mm_oc_po_at_glance.sql (Maintenance PO At Glance).
-- Drops only the mm_oc_* objects; IEV PO At Glance (oc_*) and its helpers are untouched.

DROP FUNCTION IF EXISTS public.mm_oc_save(jsonb);
DROP TABLE IF EXISTS public.mm_oc_signoff CASCADE;
DROP TABLE IF EXISTS public.mm_oc_contacts CASCADE;
DROP TABLE IF EXISTS public.mm_oc_payment_milestones CASCADE;
DROP TABLE IF EXISTS public.mm_oc_penalty CASCADE;
DROP TABLE IF EXISTS public.mm_oc_fixed_conditions CASCADE;
DROP TABLE IF EXISTS public.mm_oc_security_items CASCADE;
DROP TABLE IF EXISTS public.mm_oc_master CASCADE;
DROP TABLE IF EXISTS public.mm_oc_signoff_assignees CASCADE;
DROP FUNCTION IF EXISTS public.mm_oc_signoff_stamp();
DROP FUNCTION IF EXISTS public.mm_oc_assert_can_sign(text);
DROP FUNCTION IF EXISTS public.mm_oc_master_guard();
DROP FUNCTION IF EXISTS public.mm_oc_employee_options();
DROP FUNCTION IF EXISTS public.mm_oc_current_user_can_configure();
DROP FUNCTION IF EXISTS public.mm_oc_current_user_has_access();

NOTIFY pgrst, 'reload schema';

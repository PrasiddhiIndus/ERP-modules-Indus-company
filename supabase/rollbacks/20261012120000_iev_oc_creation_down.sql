-- Rollback for supabase/migrations/20261012120000_iev_oc_creation.sql
-- Drops the OC Creation tables and functions.

DROP FUNCTION IF EXISTS public.oc_save(jsonb);
DROP TABLE IF EXISTS public.oc_signoff;
DROP TABLE IF EXISTS public.oc_contacts;
DROP TABLE IF EXISTS public.oc_payment_milestones;
DROP TABLE IF EXISTS public.oc_penalty;
DROP TABLE IF EXISTS public.oc_fixed_conditions;
DROP TABLE IF EXISTS public.oc_security_items;
DROP TABLE IF EXISTS public.oc_master;
DROP FUNCTION IF EXISTS public.oc_signoff_stamp();
DROP FUNCTION IF EXISTS public.oc_assert_can_sign(text);
DROP TABLE IF EXISTS public.oc_signoff_assignees;
DROP FUNCTION IF EXISTS public.oc_employee_options();
DROP FUNCTION IF EXISTS public.oc_current_user_can_configure();
DROP FUNCTION IF EXISTS public.oc_current_employee_code();
DROP FUNCTION IF EXISTS public.oc_current_user_has_access();
DROP FUNCTION IF EXISTS public.oc_master_guard();
DROP FUNCTION IF EXISTS public.oc_j_text(jsonb, text);

NOTIFY pgrst, 'reload schema';

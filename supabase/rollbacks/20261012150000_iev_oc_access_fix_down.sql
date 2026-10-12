-- Rollback for supabase/migrations/20261012150000_iev_oc_access_fix.sql
-- Restores the earlier behaviour: OC access only through the IEV module / team / super admin, and the
-- employee code only from the profile. The OC functions keep calling these helpers.

CREATE OR REPLACE FUNCTION public.oc_current_user_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_has_fire_tender_shared_catalog_access();
$$;

CREATE OR REPLACE FUNCTION public.oc_current_employee_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(btrim(p.employee_code), '') FROM public.profiles p WHERE p.id = auth.uid();
$$;

NOTIFY pgrst, 'reload schema';

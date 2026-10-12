-- Rollback for supabase/migrations/20261012170000_iev_oc_access_match_app.sql
-- Restores the 20261012150000 definition (IEV module / team exact match, or IEV Costing / Dashboard sub-item).

CREATE OR REPLACE FUNCTION public.oc_current_user_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_has_fire_tender_shared_catalog_access()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.allowed_sub_modules, '[]'::jsonb) ?| ARRAY['fireTender.costing', 'fireTender.dashboard']
    );
$$;

NOTIFY pgrst, 'reload schema';

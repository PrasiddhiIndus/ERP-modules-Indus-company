-- IEV OC Creation: server access matches the IEV access the app grants.
-- Run after 20261012120000_iev_oc_creation.sql and 20261012150000_iev_oc_access_fix.sql.
--
-- The app treats a user as IEV when their team is an IEV department in any spelling/case
-- ("Projects-FTC", "Production-FTC", "Administration-FTC", "Emergency Response Team-FTC", "Fire Tender",
-- "production", "fireTender"), when Allowed modules lists IEV in any case, or when they hold the
-- IEV Costing / IEV Dashboard sub-item. The earlier check only accepted the exact values, so those users
-- saw "You do not have access to IEV OC Creation." All OC functions and policies call this helper,
-- so only the helper changes. The shared IEV catalog helper is untouched.

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
        AND (
          regexp_replace(lower(btrim(COALESCE(p.role, ''))), '[\s-]+', '_', 'g') IN ('super_admin', 'super_admin_pro')
          OR regexp_replace(lower(btrim(COALESCE(p.team, ''))), '\s+', ' ', 'g') IN (
            'firetender', 'fire tender', 'production', 'administration-ftc', 'projects-ftc',
            'production-ftc', 'emergency response team-ftc'
          )
          OR (
            jsonb_typeof(p.allowed_modules) = 'array'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(p.allowed_modules) m(v)
              WHERE lower(btrim(m.v)) IN ('firetender', 'production')
            )
          )
          OR (
            jsonb_typeof(p.allowed_sub_modules) = 'array'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(p.allowed_sub_modules) s(v)
              WHERE lower(btrim(s.v)) IN ('firetender.costing', 'firetender.dashboard')
            )
          )
        )
    );
$$;

COMMENT ON FUNCTION public.oc_current_user_has_access() IS
  'IEV OC Creation access: IEV team/department (any spelling), IEV module, IEV Costing/Dashboard sub-item, or Super Admin.';

REVOKE ALL ON FUNCTION public.oc_current_user_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_current_user_has_access() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

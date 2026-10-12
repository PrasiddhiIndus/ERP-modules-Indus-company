-- Rollback for 20261012200000_iev_po_at_glance_page_access.sql
-- Restores the access check from 20261012170000 (no PO At Glance page key).

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

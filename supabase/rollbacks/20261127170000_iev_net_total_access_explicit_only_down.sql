-- Rollback 20261127170000 — restore the broader Net Total helper from 20261127160000.
-- Does not remove backfilled fireTender.costing.costing-sheet.net-total keys.

CREATE OR REPLACE FUNCTION public.current_user_can_view_iev_costing_net_total()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    auth.uid() IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          public.normalize_erp_role(p.role) IN ('super_admin', 'super_admin_pro')
          OR lower(btrim(COALESCE(p.team, ''))) IN ('firetender', 'fire tender')
          OR (
            jsonb_typeof(COALESCE(p.allowed_modules, '[]'::jsonb)) = 'array'
            AND p.allowed_modules ? 'fireTender'
          )
          OR (
            jsonb_typeof(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) = 'array'
            AND (
              p.allowed_sub_modules ? 'fireTender.costing'
              OR p.allowed_sub_modules ? 'fireTender.dashboard'
              OR p.allowed_sub_modules ? 'fireTender.costing.costing-sheet.net-total'
            )
          )
        )
    );
$$;

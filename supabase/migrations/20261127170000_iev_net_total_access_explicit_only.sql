-- Fix Net Total Access: revoke must take effect immediately.
--
-- Previous helper also treated full IEV module / team / IEV Costing|Dashboard as
-- Net Total access, so removing fireTender.costing.costing-sheet.net-total still
-- left NET TOTAL visible. Align with the UI checkbox:
--   Super Admin / Super Admin Pro → always
--   Everyone else → only when the Net Total Access key is stored
--
-- Backfill the key for profiles that previously had implied Net Total access so
-- existing full-IEV users are unchanged until an admin unticks Net Total Access.
--
-- Rollback: supabase/rollbacks/20261127170000_iev_net_total_access_explicit_only_down.sql

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
          OR (
            jsonb_typeof(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) = 'array'
            AND p.allowed_sub_modules ? 'fireTender.costing.costing-sheet.net-total'
          )
        )
    );
$$;

COMMENT ON FUNCTION public.current_user_can_view_iev_costing_net_total() IS
  'True when the caller may view/edit Costing Sheet NET TOTAL. Super Admin always; others need fireTender.costing.costing-sheet.net-total. Mirrors canViewIevCostingNetTotal in src/config/roles.js.';

-- Backfill: users who already had implied Net Total under the old rule keep access
-- until an admin explicitly unticks Net Total Access in User Management.
DO $$
DECLARE
  r record;
  subs jsonb;
  key text := 'fireTender.costing.costing-sheet.net-total';
BEGIN
  FOR r IN
    SELECT id, team, role, allowed_modules, allowed_sub_modules
    FROM public.profiles
    WHERE public.normalize_erp_role(role) NOT IN ('super_admin', 'super_admin_pro')
  LOOP
    IF jsonb_typeof(COALESCE(r.allowed_sub_modules, '[]'::jsonb)) = 'array'
       AND r.allowed_sub_modules ? key THEN
      CONTINUE;
    END IF;

    IF lower(btrim(COALESCE(r.team, ''))) IN ('firetender', 'fire tender')
       OR (
         jsonb_typeof(COALESCE(r.allowed_modules, '[]'::jsonb)) = 'array'
         AND r.allowed_modules ? 'fireTender'
       )
       OR (
         jsonb_typeof(COALESCE(r.allowed_sub_modules, '[]'::jsonb)) = 'array'
         AND (
           r.allowed_sub_modules ? 'fireTender.costing'
           OR r.allowed_sub_modules ? 'fireTender.dashboard'
         )
       )
    THEN
      subs := CASE
        WHEN jsonb_typeof(COALESCE(r.allowed_sub_modules, '[]'::jsonb)) = 'array'
          THEN r.allowed_sub_modules
        ELSE '[]'::jsonb
      END;
      UPDATE public.profiles
      SET allowed_sub_modules = subs || jsonb_build_array(key)
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

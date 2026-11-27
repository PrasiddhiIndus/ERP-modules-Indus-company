-- IEV Costing Sheet → Net Total Access (User Management).
--
-- Key: fireTender.costing.costing-sheet.net-total
--   Super Admin / Super Admin Pro → always
--   Everyone else → only when Net Total Access is ticked in User Management
--
-- Accessories Margin % stays available without Net Total Access (owned by the
-- Accessories Costing sheet, not shown on NET TOTAL).
--
-- See also 20261127170000 (explicit-only helper + backfill for existing IEV users).
-- Rollback: supabase/rollbacks/20261127160000_iev_costing_net_total_access_down.sql

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

REVOKE ALL ON FUNCTION public.current_user_can_view_iev_costing_net_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_view_iev_costing_net_total() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.costing_summary_row_is_net_total_exempt(p_component text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_component, ''))) = lower('Accessories Margin %');
$$;

COMMENT ON FUNCTION public.costing_summary_row_is_net_total_exempt(text) IS
  'costing_summary rows that are not part of the NET TOTAL UI (Accessories Margin %).';

REVOKE ALL ON FUNCTION public.costing_summary_row_is_net_total_exempt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costing_summary_row_is_net_total_exempt(text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.costing_summary') IS NULL THEN
    RAISE NOTICE 'Skipping Net Total Access RLS — public.costing_summary does not exist.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_select ON public.costing_summary';
  EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_insert ON public.costing_summary';
  EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_update ON public.costing_summary';
  EXECUTE 'DROP POLICY IF EXISTS costing_summary_net_total_delete ON public.costing_summary';

  EXECUTE $p$
    CREATE POLICY costing_summary_net_total_select
      ON public.costing_summary
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        public.current_user_can_view_iev_costing_net_total()
        OR public.costing_summary_row_is_net_total_exempt(component)
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY costing_summary_net_total_insert
      ON public.costing_summary
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.current_user_can_view_iev_costing_net_total()
        OR public.costing_summary_row_is_net_total_exempt(component)
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY costing_summary_net_total_update
      ON public.costing_summary
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING (
        public.current_user_can_view_iev_costing_net_total()
        OR public.costing_summary_row_is_net_total_exempt(component)
      )
      WITH CHECK (
        public.current_user_can_view_iev_costing_net_total()
        OR public.costing_summary_row_is_net_total_exempt(component)
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY costing_summary_net_total_delete
      ON public.costing_summary
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (
        public.current_user_can_view_iev_costing_net_total()
        OR public.costing_summary_row_is_net_total_exempt(component)
      )
  $p$;
END $$;

NOTIFY pgrst, 'reload schema';

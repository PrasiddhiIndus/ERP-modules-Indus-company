-- Fire Tender shared catalog: main_components + price_master visible/editable by Fire Tender team
-- and Super Admins (same dataset for all, e.g. rows owned by the canonical maintainer user).
-- Replaces strict "only own user_id" RLS on these tables when those policies exist.

CREATE OR REPLACE FUNCTION public.current_user_has_fire_tender_shared_catalog_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.team = 'fireTender'
          OR p.role IN ('super_admin', 'super_admin_pro')
        )
    );
$$;

COMMENT ON FUNCTION public.current_user_has_fire_tender_shared_catalog_access() IS
  'RLS helper: Fire Tender shared catalog — team fireTender, super admins, or no profiles row (legacy).';

-- ---------------------------------------------------------------------------
-- main_components
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own data" ON public.main_components;
DROP POLICY IF EXISTS "Users can view their own data" ON public.main_components;
DROP POLICY IF EXISTS "Users can update their own data" ON public.main_components;
DROP POLICY IF EXISTS "Users can delete their own data" ON public.main_components;

CREATE POLICY "fire_tender_shared_catalog_select_main_components"
  ON public.main_components FOR SELECT
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_catalog_insert_main_components"
  ON public.main_components FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_has_fire_tender_shared_catalog_access()
    AND user_id IS NOT NULL
    AND auth.uid() = user_id
  );

CREATE POLICY "fire_tender_shared_catalog_update_main_components"
  ON public.main_components FOR UPDATE
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access())
  WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_catalog_delete_main_components"
  ON public.main_components FOR DELETE
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access());

-- ---------------------------------------------------------------------------
-- price_master (same model; skip if table not deployed yet)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.price_master') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own data" ON public.price_master';
  EXECUTE 'DROP POLICY IF EXISTS "Users can view their own data" ON public.price_master';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update their own data" ON public.price_master';
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own data" ON public.price_master';
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_catalog_select_price_master"
      ON public.price_master FOR SELECT
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_catalog_insert_price_master"
      ON public.price_master FOR INSERT
      TO authenticated
      WITH CHECK (
        public.current_user_has_fire_tender_shared_catalog_access()
        AND user_id IS NOT NULL
        AND auth.uid() = user_id
      )
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_catalog_update_price_master"
      ON public.price_master FOR UPDATE
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
      WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_catalog_delete_price_master"
      ON public.price_master FOR DELETE
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
END $$;

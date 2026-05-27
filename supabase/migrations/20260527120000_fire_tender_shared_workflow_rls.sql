-- Fire Tender shared workflow: tenders, quotations, costing_summary, approved_quotation_items
-- visible/editable by Fire Tender team, extra-module users, and Super Admins.

-- Reuse catalog access helper (team fireTender, allowed_modules, super admins, legacy no profile).
-- Function defined in 20260515143000_fire_tender_shared_catalog_rls.sql

-- ---------------------------------------------------------------------------
-- tenders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own data" ON public.tenders;
DROP POLICY IF EXISTS "Users can insert their own data" ON public.tenders;
DROP POLICY IF EXISTS "Users can update their own data" ON public.tenders;
DROP POLICY IF EXISTS "Users can delete their own data" ON public.tenders;

CREATE POLICY "fire_tender_shared_select_tenders"
  ON public.tenders FOR SELECT
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_insert_tenders"
  ON public.tenders FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_update_tenders"
  ON public.tenders FOR UPDATE
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access())
  WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_delete_tenders"
  ON public.tenders FOR DELETE
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access());

-- ---------------------------------------------------------------------------
-- quotations (one row per tender_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own data" ON public.quotations;
DROP POLICY IF EXISTS "Users can insert their own data" ON public.quotations;
DROP POLICY IF EXISTS "Users can update their own data" ON public.quotations;
DROP POLICY IF EXISTS "Users can delete their own data" ON public.quotations;

CREATE POLICY "fire_tender_shared_select_quotations"
  ON public.quotations FOR SELECT
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_insert_quotations"
  ON public.quotations FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_update_quotations"
  ON public.quotations FOR UPDATE
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access())
  WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access());

CREATE POLICY "fire_tender_shared_delete_quotations"
  ON public.quotations FOR DELETE
  TO authenticated
  USING (public.current_user_has_fire_tender_shared_catalog_access());

-- ---------------------------------------------------------------------------
-- costing_summary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.costing_summary') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "Users can view their own data" ON public.costing_summary';
  EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own data" ON public.costing_summary';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update their own data" ON public.costing_summary';
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own data" ON public.costing_summary';
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_select_costing_summary"
      ON public.costing_summary FOR SELECT
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_insert_costing_summary"
      ON public.costing_summary FOR INSERT
      TO authenticated
      WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_update_costing_summary"
      ON public.costing_summary FOR UPDATE
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
      WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_delete_costing_summary"
      ON public.costing_summary FOR DELETE
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
END $$;

-- ---------------------------------------------------------------------------
-- approved_quotation_items
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approved_quotation_items') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "Users can view their own data" ON public.approved_quotation_items';
  EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own data" ON public.approved_quotation_items';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update their own data" ON public.approved_quotation_items';
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own data" ON public.approved_quotation_items';
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_select_approved_quotation_items"
      ON public.approved_quotation_items FOR SELECT
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_insert_approved_quotation_items"
      ON public.approved_quotation_items FOR INSERT
      TO authenticated
      WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_update_approved_quotation_items"
      ON public.approved_quotation_items FOR UPDATE
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
      WITH CHECK (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
  EXECUTE $p$
    CREATE POLICY "fire_tender_shared_delete_approved_quotation_items"
      ON public.approved_quotation_items FOR DELETE
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;
END $$;

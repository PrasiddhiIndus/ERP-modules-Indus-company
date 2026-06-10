-- Fire Tender audit trail: audit_logs + price_master_versions
-- Append-only history for unit_cost / price master changes.
-- Reuses current_user_has_fire_tender_shared_catalog_access() from
-- 20260515143000_fire_tender_shared_catalog_rls.sql

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE NOTICE 'public.audit_logs does not exist — skipping RLS setup';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own data" ON public.audit_logs';
  EXECUTE 'DROP POLICY IF EXISTS "Users can view their own data" ON public.audit_logs';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update their own data" ON public.audit_logs';
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete their own data" ON public.audit_logs';
  EXECUTE 'DROP POLICY IF EXISTS fire_tender_audit_logs_select ON public.audit_logs';
  EXECUTE 'DROP POLICY IF EXISTS fire_tender_audit_logs_insert ON public.audit_logs';

  EXECUTE $p$
    CREATE POLICY fire_tender_audit_logs_select
      ON public.audit_logs FOR SELECT
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$;

  EXECUTE $p$
    CREATE POLICY fire_tender_audit_logs_insert
      ON public.audit_logs FOR INSERT
      TO authenticated
      WITH CHECK (
        public.current_user_has_fire_tender_shared_catalog_access()
        AND (user_id IS NULL OR user_id = auth.uid())
      )
  $p$;

  -- Immutable audit trail: no UPDATE/DELETE policies for authenticated users.
  REVOKE ALL ON public.audit_logs FROM anon;
  GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
END $$;

COMMENT ON TABLE public.audit_logs IS
  'Fire Tender unit-cost audit trail. Append-only; RLS scoped to Fire Tender team / module users and super admins.';

-- ---------------------------------------------------------------------------
-- price_master_versions (app table name; also covers legacy price_master_version)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  IF to_regclass('public.price_master_versions') IS NOT NULL THEN
    tbl := 'price_master_versions';
  ELSIF to_regclass('public.price_master_version') IS NOT NULL THEN
    tbl := 'price_master_version';
  ELSE
    RAISE NOTICE 'public.price_master_versions / price_master_version does not exist — skipping RLS setup';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

  EXECUTE format('DROP POLICY IF EXISTS "Users can insert their own data" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "Users can view their own data" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "Users can update their own data" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS "Users can delete their own data" ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS fire_tender_price_master_versions_select ON public.%I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS fire_tender_price_master_versions_insert ON public.%I', tbl);

  EXECUTE format($p$
    CREATE POLICY fire_tender_price_master_versions_select
      ON public.%I FOR SELECT
      TO authenticated
      USING (public.current_user_has_fire_tender_shared_catalog_access())
  $p$, tbl);

  EXECUTE format($p$
    CREATE POLICY fire_tender_price_master_versions_insert
      ON public.%I FOR INSERT
      TO authenticated
      WITH CHECK (
        public.current_user_has_fire_tender_shared_catalog_access()
        AND user_id IS NOT NULL
        AND user_id = auth.uid()
      )
  $p$, tbl);

  -- Immutable version history: no UPDATE/DELETE policies for authenticated users.
  EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
  EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', tbl);
END $$;

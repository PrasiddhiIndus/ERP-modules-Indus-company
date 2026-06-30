-- =============================================================================
-- PRODUCTION MODULE DATA FIX — wbyzhknaqcjqqtwopupl ONLY
--
-- Run AFTER production_login_fix.sql when modules open but tables are empty:
--   Marketing, Commercial, Admin, Fire Tender, Finance/P&L, etc.
--
-- ALSO in Supabase Dashboard → Settings → API → Exposed schemas, enable:
--   public, billing, finance, indus_one
-- =============================================================================

-- ── 1) Schema usage + table grants ───────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

CREATE SCHEMA IF NOT EXISTS billing;
GRANT USAGE ON SCHEMA billing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA billing TO authenticated;

CREATE SCHEMA IF NOT EXISTS finance;
GRANT USAGE ON SCHEMA finance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finance TO authenticated;

CREATE SCHEMA IF NOT EXISTS indus_one;
GRANT USAGE ON SCHEMA indus_one TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA indus_one TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA indus_one TO authenticated;

-- Re-apply billing access helper: run manually in SQL Editor if Commercial PO is empty:
--   supabase/migrations/20260624120000_billing_schema_grants_ensure.sql

-- ── 2) Authenticated RLS on core ERP tables (idempotent) ─────────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Marketing
    'marketing_enquiries', 'marketing_quotations', 'marketing_quotation_items',
    'marketing_quotation_revisions', 'marketing_clients', 'marketing_costing_sheets',
    'marketing_follow_ups', 'marketing_notifications', 'marketing_site_visits',
    'marketing_enquiry_documents', 'marketing_mail_templates', 'marketing_gst_documents',
    -- Commercial
    'manpower_enquiries',
    -- Fire Tender / Projects
    'tenders', 'tender_contacts', 'costing_rows', 'costing_summary', 'costing_accessories',
    'quotations', 'approved_quotation_items', 'quotation_templates',
    'main_components', 'moc_prices', 'price_master',
    -- Admin
    'admin_ifsp_employee_master', 'admin_attendance_register', 'erp_attendance_punches',
    'erp_attendance_sync_state', 'erp_activity_log', 'erp_app_access_config'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Skip missing table public.%', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS erp_auth_select_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY erp_auth_select_%I ON public.%I FOR SELECT TO authenticated USING (true)',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS erp_auth_insert_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY erp_auth_insert_%I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS erp_auth_update_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY erp_auth_update_%I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS erp_auth_delete_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY erp_auth_delete_%I ON public.%I FOR DELETE TO authenticated USING (true)',
      t, t
    );
  END LOOP;
END $$;

-- ── 3) Verify row counts (informational) ─────────────────────────────────────
SELECT 'marketing_enquiries' AS table_name, count(*)::text AS rows FROM public.marketing_enquiries
UNION ALL SELECT 'marketing_quotations', count(*)::text FROM public.marketing_quotations
UNION ALL SELECT 'manpower_enquiries', count(*)::text FROM public.manpower_enquiries
UNION ALL SELECT 'tenders', count(*)::text FROM public.tenders
UNION ALL SELECT 'billing.po_wo', count(*)::text FROM billing.po_wo
UNION ALL SELECT 'finance.sites', count(*)::text FROM finance.sites
UNION ALL SELECT 'admin_ifsp_employee_master', count(*)::text FROM public.admin_ifsp_employee_master;

-- ── 4) Super-admin profile check (replace email if needed) ─────────────────────
-- UPDATE public.profiles SET role = 'super_admin', team = 'admin',
--   allowed_modules = '[]'::jsonb WHERE email ILIKE 'your-admin@ifspl.com';

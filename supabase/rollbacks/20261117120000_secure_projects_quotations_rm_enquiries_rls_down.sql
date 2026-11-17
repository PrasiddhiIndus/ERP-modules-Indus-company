-- Rollback for 20261117120000_secure_projects_quotations_rm_enquiries_rls.sql
-- Restores the exact policies saved in public.rls_policy_backup (falls back to the
-- original open policies from 20261022120000 / 20261023120000 / 20261102180000 if no backup exists),
-- restores the audit table grants and removes the audit stamp trigger.
-- WARNING: this re-opens these tables to every logged-in account.

-- 1. Drop the scoped policies
DROP POLICY IF EXISTS projects_quotations_scope_select ON projects.quotations;
DROP POLICY IF EXISTS projects_quotations_scope_insert ON projects.quotations;
DROP POLICY IF EXISTS projects_quotations_scope_update ON projects.quotations;
DROP POLICY IF EXISTS projects_quotations_scope_delete ON projects.quotations;

DROP POLICY IF EXISTS projects_quotation_rows_scope_select ON projects.quotation_rows;
DROP POLICY IF EXISTS projects_quotation_rows_scope_insert ON projects.quotation_rows;
DROP POLICY IF EXISTS projects_quotation_rows_scope_update ON projects.quotation_rows;
DROP POLICY IF EXISTS projects_quotation_rows_scope_delete ON projects.quotation_rows;

DROP POLICY IF EXISTS projects_quotation_maker_audit_scope_select ON projects.quotation_maker_audit;
DROP POLICY IF EXISTS projects_quotation_maker_audit_scope_insert ON projects.quotation_maker_audit;

DROP POLICY IF EXISTS enquiry_field_change_history_scope_select ON projects.enquiry_field_change_history;

DROP POLICY IF EXISTS rm_enquiries_scope_select ON rm.enquiries;
DROP POLICY IF EXISTS rm_enquiries_scope_insert ON rm.enquiries;
DROP POLICY IF EXISTS rm_enquiries_scope_update ON rm.enquiries;
DROP POLICY IF EXISTS rm_enquiries_scope_delete ON rm.enquiries;

-- 2. Restore the saved policies
DO $$
DECLARE
  r record;
  v_restored integer := 0;
  v_sql text;
BEGIN
  IF to_regclass('public.rls_policy_backup') IS NOT NULL THEN
    FOR r IN
      SELECT * FROM public.rls_policy_backup WHERE migration = '20261117120000' ORDER BY id
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      v_sql := format(
        'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
        r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd,
        (SELECT string_agg(CASE WHEN x = 'public' THEN 'public' ELSE quote_ident(x) END, ', ') FROM unnest(r.roles) AS x)
      );
      IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', r.qual); END IF;
      IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', r.with_check); END IF;
      EXECUTE v_sql;
      v_restored := v_restored + 1;
    END LOOP;
    DELETE FROM public.rls_policy_backup WHERE migration = '20261117120000';
  END IF;

  IF v_restored = 0 THEN
    -- No backup: recreate the original policies from the historical migrations.
    DROP POLICY IF EXISTS quotation_maker_auth_all ON projects.quotations;
    CREATE POLICY quotation_maker_auth_all ON projects.quotations
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS quotation_rows_auth_all ON projects.quotation_rows;
    CREATE POLICY quotation_rows_auth_all ON projects.quotation_rows
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS quotation_maker_audit_auth_all ON projects.quotation_maker_audit;
    CREATE POLICY quotation_maker_audit_auth_all ON projects.quotation_maker_audit
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "enquiry_field_change_history_select" ON projects.enquiry_field_change_history;
    CREATE POLICY "enquiry_field_change_history_select" ON projects.enquiry_field_change_history
      FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS rm_enquiries_select_authenticated ON rm.enquiries;
    CREATE POLICY rm_enquiries_select_authenticated ON rm.enquiries FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS rm_enquiries_insert_authenticated ON rm.enquiries;
    CREATE POLICY rm_enquiries_insert_authenticated ON rm.enquiries FOR INSERT TO authenticated WITH CHECK (true);
    DROP POLICY IF EXISTS rm_enquiries_update_authenticated ON rm.enquiries;
    CREATE POLICY rm_enquiries_update_authenticated ON rm.enquiries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS rm_enquiries_delete_authenticated ON rm.enquiries;
    CREATE POLICY rm_enquiries_delete_authenticated ON rm.enquiries FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- 3. Audit table: remove the stamp trigger, restore the original grants
DROP TRIGGER IF EXISTS quotation_maker_audit_stamp ON projects.quotation_maker_audit;
DROP FUNCTION IF EXISTS projects.quotation_maker_audit_stamp();

GRANT SELECT, INSERT, UPDATE, DELETE ON projects.quotation_maker_audit TO authenticated;
GRANT TRUNCATE, TRIGGER, REFERENCES ON projects.quotation_maker_audit TO authenticated;
GRANT TRUNCATE, TRIGGER, REFERENCES ON projects.quotations TO authenticated;
GRANT TRUNCATE, TRIGGER, REFERENCES ON projects.quotation_rows TO authenticated;

-- 4. Helper functions (only used by the policies above)
DROP FUNCTION IF EXISTS public.current_user_can_access_projects_data();
DROP FUNCTION IF EXISTS public.current_user_can_access_rm_data();
DROP FUNCTION IF EXISTS public.erp_current_user_has_data_scope(text[], text[]);

-- public.rls_policy_backup is kept (it may hold rows from other security migrations).

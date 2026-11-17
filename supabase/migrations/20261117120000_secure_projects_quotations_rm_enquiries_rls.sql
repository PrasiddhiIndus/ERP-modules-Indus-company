-- =============================================================================
-- Security fix C2 — replace open RLS (USING (true)) on:
--   projects.quotations, projects.quotation_rows, projects.quotation_maker_audit,
--   projects.enquiry_field_change_history, rm.enquiries
-- with department scope checks.
--
-- Who keeps access (same rule the UI uses to open these pages — see shared/erpDataScopes.mjs):
--   * Super Admin / Super Admin Pro / Admin (HOD) — unchanged, all data (as current_user_can_access_module).
--   * Projects data: team "Projects", allowed_modules "projects", or any "projects.*" sub-module.
--   * R&M data: team "R&M" / "commercialRm" / "Sales", allowed_modules "commercialRm" / "sales",
--     or any "commercialRm.*" / "sales.*" sub-module (legacy Sales owns every /app/commercial page).
--   * Inactive profiles (is_active = false) have no access.
--
-- Audit table (projects.quotation_maker_audit) becomes append-only for app users:
--   SELECT / INSERT for Projects users; no UPDATE / DELETE / TRUNCATE.
--   actor_id and created_at are stamped by the database (cannot be forged).
--   SECURITY DEFINER cleanup functions (quotation deletion) and FK "on delete set null" keep working.
--
-- Business logic, quotation calculations and approval workflows are unchanged: only who may touch the rows.
-- Every policy that exists on these tables right now is saved to public.rls_policy_backup before it is
-- dropped, so the rollback restores the exact previous state.
-- Rollback: supabase/rollbacks/20261117120000_secure_projects_quotations_rm_enquiries_rls_down.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Scope helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erp_current_user_has_data_scope(p_modules text[], p_teams text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE auth.uid() IS NOT NULL
      AND p.id = auth.uid()
      AND COALESCE(p.is_active, true)
      AND (
        replace(lower(btrim(COALESCE(p.role::text, ''), E' \t\r\n')), ' ', '_')
          IN ('admin', 'hod', 'super_admin', 'superadmin', 'super_admin_pro', 'superadmin_pro')
        OR regexp_replace(lower(btrim(COALESCE(p.team::text, ''), E' \t\r\n')), '\s+', ' ', 'g') = ANY (p_teams)
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p.allowed_modules) = 'array' THEN p.allowed_modules ELSE '[]'::jsonb END
          ) AS m(v)
          WHERE lower(btrim(m.v, E' \t\r\n')) = ANY (p_modules)
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p.allowed_sub_modules) = 'array' THEN p.allowed_sub_modules ELSE '[]'::jsonb END
          ) AS s(v)
          WHERE lower(btrim(split_part(s.v, '.', 1), E' \t\r\n')) = ANY (p_modules)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.erp_current_user_has_data_scope(text[], text[]) IS
  'True when the caller is an active Admin/Super Admin, or has one of p_teams as team, one of p_modules in allowed_modules, or a sub-module under one of p_modules. Mirrors shared/erpDataScopes.mjs.';

CREATE OR REPLACE FUNCTION public.current_user_can_access_projects_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.erp_current_user_has_data_scope(ARRAY['projects'], ARRAY['projects']);
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_access_rm_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.erp_current_user_has_data_scope(
    ARRAY['commercialrm', 'sales'],
    ARRAY['r&m', 'commercialrm', 'sales']
  );
$$;

REVOKE ALL ON FUNCTION public.erp_current_user_has_data_scope(text[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_access_projects_data() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can_access_rm_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_current_user_has_data_scope(text[], text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_projects_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can_access_rm_data() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Save every current policy on the five tables, then drop them
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rls_policy_backup (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migration text NOT NULL,
  schemaname text NOT NULL,
  tablename text NOT NULL,
  policyname text NOT NULL,
  permissive text NOT NULL,
  roles text[] NOT NULL,
  cmd text NOT NULL,
  qual text,
  with_check text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migration, schemaname, tablename, policyname)
);

COMMENT ON TABLE public.rls_policy_backup IS
  'Policies saved by security migrations before they were replaced; read by the matching rollback.';

ALTER TABLE public.rls_policy_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rls_policy_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rls_policy_backup TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check
    FROM pg_policies p
    WHERE (p.schemaname, p.tablename) IN (
      ('projects', 'quotations'),
      ('projects', 'quotation_rows'),
      ('projects', 'quotation_maker_audit'),
      ('projects', 'enquiry_field_change_history'),
      ('rm', 'enquiries')
    )
  LOOP
    INSERT INTO public.rls_policy_backup (migration, schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
    VALUES ('20261117120000', r.schemaname, r.tablename, r.policyname, r.permissive, r.roles::text[], r.cmd, r.qual, r.with_check)
    ON CONFLICT (migration, schemaname, tablename, policyname) DO NOTHING;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. projects.quotations / projects.quotation_rows — Projects users only
-- ---------------------------------------------------------------------------
ALTER TABLE projects.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.quotation_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_quotations_scope_select ON projects.quotations
  FOR SELECT TO authenticated USING (public.current_user_can_access_projects_data());
CREATE POLICY projects_quotations_scope_insert ON projects.quotations
  FOR INSERT TO authenticated WITH CHECK (public.current_user_can_access_projects_data());
CREATE POLICY projects_quotations_scope_update ON projects.quotations
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_projects_data())
  WITH CHECK (public.current_user_can_access_projects_data());
CREATE POLICY projects_quotations_scope_delete ON projects.quotations
  FOR DELETE TO authenticated USING (public.current_user_can_access_projects_data());

CREATE POLICY projects_quotation_rows_scope_select ON projects.quotation_rows
  FOR SELECT TO authenticated USING (public.current_user_can_access_projects_data());
CREATE POLICY projects_quotation_rows_scope_insert ON projects.quotation_rows
  FOR INSERT TO authenticated WITH CHECK (public.current_user_can_access_projects_data());
CREATE POLICY projects_quotation_rows_scope_update ON projects.quotation_rows
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_projects_data())
  WITH CHECK (public.current_user_can_access_projects_data());
CREATE POLICY projects_quotation_rows_scope_delete ON projects.quotation_rows
  FOR DELETE TO authenticated USING (public.current_user_can_access_projects_data());

REVOKE TRUNCATE, TRIGGER, REFERENCES ON projects.quotations FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON projects.quotation_rows FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. projects.quotation_maker_audit — append-only, database-stamped identity
-- ---------------------------------------------------------------------------
ALTER TABLE projects.quotation_maker_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_quotation_maker_audit_scope_select ON projects.quotation_maker_audit
  FOR SELECT TO authenticated USING (public.current_user_can_access_projects_data());
CREATE POLICY projects_quotation_maker_audit_scope_insert ON projects.quotation_maker_audit
  FOR INSERT TO authenticated WITH CHECK (public.current_user_can_access_projects_data());
-- No UPDATE / DELETE policy: app users cannot change or remove audit records.

REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON projects.quotation_maker_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON projects.quotation_maker_audit TO authenticated;

CREATE OR REPLACE FUNCTION projects.quotation_maker_audit_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  NEW.created_at := now();
  IF v_uid IS NOT NULL THEN
    -- The signed-in user is always the actor; a client-supplied actor_id is ignored.
    NEW.actor_id := v_uid;
    IF NEW.actor_name IS NULL OR btrim(NEW.actor_name) = '' THEN
      SELECT COALESCE(NULLIF(btrim(p.username), ''), NULLIF(btrim(p.email), ''))
        INTO v_name
        FROM public.profiles p
       WHERE p.id = v_uid;
      NEW.actor_name := v_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION projects.quotation_maker_audit_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS quotation_maker_audit_stamp ON projects.quotation_maker_audit;
CREATE TRIGGER quotation_maker_audit_stamp
  BEFORE INSERT ON projects.quotation_maker_audit
  FOR EACH ROW EXECUTE FUNCTION projects.quotation_maker_audit_stamp();

-- ---------------------------------------------------------------------------
-- 5. projects.enquiry_field_change_history — read by Projects users only (writes stay trigger-only)
-- ---------------------------------------------------------------------------
ALTER TABLE projects.enquiry_field_change_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY enquiry_field_change_history_scope_select ON projects.enquiry_field_change_history
  FOR SELECT TO authenticated USING (public.current_user_can_access_projects_data());

-- ---------------------------------------------------------------------------
-- 6. rm.enquiries — R&M users only
-- ---------------------------------------------------------------------------
ALTER TABLE rm.enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY rm_enquiries_scope_select ON rm.enquiries
  FOR SELECT TO authenticated USING (public.current_user_can_access_rm_data());
CREATE POLICY rm_enquiries_scope_insert ON rm.enquiries
  FOR INSERT TO authenticated WITH CHECK (public.current_user_can_access_rm_data());
CREATE POLICY rm_enquiries_scope_update ON rm.enquiries
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_rm_data())
  WITH CHECK (public.current_user_can_access_rm_data());
CREATE POLICY rm_enquiries_scope_delete ON rm.enquiries
  FOR DELETE TO authenticated USING (public.current_user_can_access_rm_data());

REVOKE TRUNCATE, TRIGGER, REFERENCES ON rm.enquiries FROM anon, authenticated;

-- =============================================================================
-- Attendance punches + Daily Register: drop leftover OPEN RLS, keep Admin/HR.
--
-- Intent
--   Daily Register and Raw Punches stay for HR/Admin.
--   A normal executive must not dump the whole company punch table.
--
-- Why this file exists
--   20260827120000 already creates erp_attendance_punches_hr_all +
--   erp_attendance_punches_select_own. Later one-off scripts
--   (production_modules_data_fix.sql) can recreate erp_auth_* USING (true).
--   Postgres ORs permissive policies: if USING (true) remains, scoped
--   policies do nothing.
--
-- Do NOT
--   Restore USING (true) / *_authenticated / erp_auth_* on these tables.
--   Remove Admin module, employee master, leave, or any other table.
--   Grant the Vite client service_role.
--
-- If Admin Attendance looks empty after this: grant that user
--   profiles.role / team / allowed_modules (admin|hr|payroll). Do not
--   reopen USING (true).
-- =============================================================================

-- Cheap attendance-admin gate (single profiles read). Same semantics as
-- 20260827150000. Safe to re-apply.
CREATE OR REPLACE FUNCTION public.current_user_has_attendance_admin_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND auth.uid() IS NOT NULL
      AND (
        p.role IN ('admin', 'super_admin', 'super_admin_pro')
        OR lower(coalesce(p.team, '')) IN ('hr', 'admin')
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(coalesce(p.allowed_modules, '[]'::jsonb)) AS m(value)
          WHERE lower(m.value) IN ('hr', 'payroll', 'admin')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_attendance_admin_access() IS
  'Attendance/HR admin gate. role admin/super_admin*, team hr/admin, or allowed_modules hr|payroll|admin.';

CREATE OR REPLACE FUNCTION public.current_user_employee_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT NULLIF(btrim(p.employee_code), '')
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_employee_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_employee_code() TO service_role;

-- ── erp_attendance_punches (only this table is the dump risk) ────────────────
DO $$
DECLARE
  punch_emp_col text;
BEGIN
  IF to_regclass('public.erp_attendance_punches') IS NULL THEN
    RAISE NOTICE 'Skipping erp_attendance_punches RLS — table not present.';
    RETURN;
  END IF;

  ALTER TABLE public.erp_attendance_punches ENABLE ROW LEVEL SECURITY;

  -- Keep table grants. RLS, not REVOKE, is the security layer.
  -- service_role still used by eTime sync API.
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_punches TO authenticated;
  GRANT ALL ON public.erp_attendance_punches TO service_role;

  -- Drop every known OPEN policy. Do not leave USING (true) as an OR.
  DROP POLICY IF EXISTS erp_attendance_punches_select_authenticated ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_attendance_punches_insert_authenticated ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_attendance_punches_update_authenticated ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_attendance_punches_delete_authenticated ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS "erp_attendance_punches_select_authenticated" ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS "erp_attendance_punches_insert_authenticated" ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS "erp_attendance_punches_update_authenticated" ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS "erp_attendance_punches_delete_authenticated" ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_auth_select_erp_attendance_punches ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_auth_insert_erp_attendance_punches ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_auth_update_erp_attendance_punches ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_auth_delete_erp_attendance_punches ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_attendance_punches_hr_all ON public.erp_attendance_punches;
  DROP POLICY IF EXISTS erp_attendance_punches_select_own ON public.erp_attendance_punches;

  CREATE POLICY erp_attendance_punches_hr_all ON public.erp_attendance_punches
    FOR ALL TO authenticated
    USING ((SELECT public.current_user_has_attendance_admin_access()))
    WITH CHECK ((SELECT public.current_user_has_attendance_admin_access()));

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'erp_attendance_punches'
        AND column_name = 'employee_code'
    ) THEN 'employee_code'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'erp_attendance_punches'
        AND column_name = 'emp_code'
    ) THEN 'emp_code'
    ELSE 'employee_code'
  END INTO punch_emp_col;

  EXECUTE format(
    'CREATE POLICY erp_attendance_punches_select_own ON public.erp_attendance_punches
      FOR SELECT TO authenticated
      USING (
        (SELECT public.current_user_has_attendance_admin_access())
        OR lower(btrim(%I)) = lower(btrim(public.current_user_employee_code()))
      )',
    punch_emp_col
  );
END $$;

-- ── admin_attendance_register (HR/Admin keep full register; no company dump) ─
DO $$
DECLARE
  att_emp_col text;
BEGIN
  IF to_regclass('public.admin_attendance_register') IS NULL THEN
    RAISE NOTICE 'Skipping admin_attendance_register RLS — table not present.';
    RETURN;
  END IF;

  ALTER TABLE public.admin_attendance_register ENABLE ROW LEVEL SECURITY;

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_attendance_register TO authenticated;
  GRANT ALL ON public.admin_attendance_register TO service_role;

  DROP POLICY IF EXISTS admin_attendance_register_select_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_insert_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_update_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_delete_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS "admin_attendance_register_select_authenticated" ON public.admin_attendance_register;
  DROP POLICY IF EXISTS "admin_attendance_register_insert_authenticated" ON public.admin_attendance_register;
  DROP POLICY IF EXISTS "admin_attendance_register_update_authenticated" ON public.admin_attendance_register;
  DROP POLICY IF EXISTS "admin_attendance_register_delete_authenticated" ON public.admin_attendance_register;
  DROP POLICY IF EXISTS erp_auth_select_admin_attendance_register ON public.admin_attendance_register;
  DROP POLICY IF EXISTS erp_auth_insert_admin_attendance_register ON public.admin_attendance_register;
  DROP POLICY IF EXISTS erp_auth_update_admin_attendance_register ON public.admin_attendance_register;
  DROP POLICY IF EXISTS erp_auth_delete_admin_attendance_register ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_hr_all ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_self_read ON public.admin_attendance_register;

  CREATE POLICY admin_attendance_register_hr_all ON public.admin_attendance_register
    FOR ALL TO authenticated
    USING ((SELECT public.current_user_has_attendance_admin_access()))
    WITH CHECK ((SELECT public.current_user_has_attendance_admin_access()));

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'admin_attendance_register'
        AND column_name = 'employee_code'
    ) THEN 'employee_code'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'admin_attendance_register'
        AND column_name = 'emp_code'
    ) THEN 'emp_code'
    ELSE 'employee_code'
  END INTO att_emp_col;

  EXECUTE format(
    'CREATE POLICY admin_attendance_register_self_read ON public.admin_attendance_register
      FOR SELECT TO authenticated
      USING (
        (SELECT public.current_user_has_attendance_admin_access())
        OR lower(btrim(%I)) = lower(btrim(public.current_user_employee_code()))
      )',
    att_emp_col
  );
END $$;

NOTIFY pgrst, 'reload schema';

-- Verify after apply (also run this alone first to see current state):
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('erp_attendance_punches', 'admin_attendance_register')
-- ORDER BY tablename, policyname;

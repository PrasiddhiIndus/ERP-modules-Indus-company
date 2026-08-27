-- Attendance Daily Register + Raw punches: restore a scoped authenticated path
-- after open USING (true) policies were moved off authenticated (N9).
--
-- Do NOT restore erp_auth_* / *_authenticated USING (true).
-- Do NOT grant the Vite client service_role. The SPA reads these tables as
-- authenticated (user JWT + anon key). service_role remains for eTime sync API.
--
-- A. Scoped policies for admin_attendance_register + erp_attendance_punches
-- B. Align attendance-admin gate with Admin Ops: C2('admin') in addition to N1

CREATE OR REPLACE FUNCTION public.current_user_has_attendance_admin_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  -- Single profiles read (no nested N1/C2). Prefer InitPlan via (SELECT fn()) in policies.
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
  'Cheap attendance/HR admin gate (single profiles read). role admin/super_admin*, team hr/admin, or allowed_modules hr|payroll|admin.';

GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO service_role;

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

GRANT EXECUTE ON FUNCTION public.current_user_employee_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_employee_code() TO service_role;

-- ── admin_attendance_register ────────────────────────────────────────────────
DO $$
DECLARE
  att_emp_col text;
BEGIN
  IF to_regclass('public.admin_attendance_register') IS NULL THEN
    RAISE NOTICE 'Skipping admin_attendance_register RLS — table not present.';
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_attendance_register TO authenticated;
  GRANT ALL ON public.admin_attendance_register TO service_role;

  DROP POLICY IF EXISTS admin_attendance_register_select_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_insert_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_update_authenticated ON public.admin_attendance_register;
  DROP POLICY IF EXISTS admin_attendance_register_delete_authenticated ON public.admin_attendance_register;
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

-- ── erp_attendance_punches ───────────────────────────────────────────────────
DO $$
DECLARE
  punch_emp_col text;
BEGIN
  IF to_regclass('public.erp_attendance_punches') IS NULL THEN
    RAISE NOTICE 'Skipping erp_attendance_punches RLS — table not present.';
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_punches TO authenticated;
  GRANT ALL ON public.erp_attendance_punches TO service_role;

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

-- ── Leave overlay on Daily Register (SELECT only) ─────────────────────────────
-- When /api/admin/leave-requests is unavailable, the SPA reads these tables as
-- authenticated. HR/payroll/Admin-module users must see all rows, not only own.
DO $$
BEGIN
  IF to_regnamespace('indus_one') IS NULL THEN
    RAISE NOTICE 'Skipping leave SELECT policies — indus_one not present.';
    RETURN;
  END IF;

  IF to_regclass('indus_one.admin_leave_requests') IS NOT NULL THEN
    GRANT SELECT ON indus_one.admin_leave_requests TO authenticated;
    DROP POLICY IF EXISTS admin_leave_requests_select_own ON indus_one.admin_leave_requests;
    CREATE POLICY admin_leave_requests_select_own ON indus_one.admin_leave_requests
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR public.current_user_has_admin_module_access()
        OR public.current_user_can_access_module('admin')
        OR public.current_user_has_attendance_admin_access()
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      );
  END IF;

  IF to_regclass('indus_one.leave_requests') IS NOT NULL THEN
    GRANT SELECT ON indus_one.leave_requests TO authenticated;
    DROP POLICY IF EXISTS leave_requests_select_erp ON indus_one.leave_requests;
    CREATE POLICY leave_requests_select_erp ON indus_one.leave_requests
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR public.current_user_has_admin_module_access()
        OR public.current_user_can_access_module('admin')
        OR public.current_user_has_attendance_admin_access()
        OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Fix Daily Attendance Register / punch 500s after N9.
--
-- Symptom: PostgREST 500 on erp_attendance_punches + admin_attendance_register
-- after ~8–13s under attendance-admin RLS. Cause: policies called
-- current_user_has_attendance_admin_access() which nested
-- current_user_has_admin_module_access() + current_user_can_access_module(...) —
-- Postgres re-evaluated those expensive helpers across large scans.
--
-- Fix:
-- 1) Single-profile STABLE gate (no nested C2/N1 calls).
-- 2) Wrap policy predicates in (SELECT ...) so RLS uses an InitPlan once per query.
-- 3) Keep semantics: N1 roles, team hr/admin, or allowed_modules hr/payroll/admin.
-- Do NOT restore USING (true) bypasses.

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
  'Cheap attendance/HR admin gate (single profiles read). role admin/super_admin*, team hr/admin, or allowed_modules hr|payroll|admin. Safe for large RLS scans.';

GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_attendance_admin_access() TO service_role;

-- Force InitPlan evaluation in RLS (evaluate once per statement, not per row).
DO $$
DECLARE
  att_emp_col text;
  punch_emp_col text;
BEGIN
  IF to_regclass('public.admin_attendance_register') IS NOT NULL THEN
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
  END IF;

  IF to_regclass('public.erp_attendance_punches') IS NOT NULL THEN
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
  END IF;
END $$;

-- Daily Register loads Active employees via JWT. N8 closed erp_auth bypass and
-- N1 policies are role-only. Allow attendance-admins SELECT (not write) so the
-- grid can list people without reopening full-table CRUD.
DO $$
BEGIN
  IF to_regclass('public.admin_ifsp_employee_master') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS admin_ifsp_employee_master_attendance_admin_select
    ON public.admin_ifsp_employee_master;

  CREATE POLICY admin_ifsp_employee_master_attendance_admin_select
    ON public.admin_ifsp_employee_master
    FOR SELECT TO authenticated
    USING ((SELECT public.current_user_has_attendance_admin_access()));
END $$;

NOTIFY pgrst, 'reload schema';

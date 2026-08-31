-- =============================================================================
-- Leave Management yearly balances: same timeout as Daily Register / punches.
--
-- Symptom: PostgREST 500 on indus_one.employee_leave_balances_yearly
-- (GET year=eq.2026 and UPSERT) with 57014 canceling statement due to
-- statement timeout. Employee Leave Management then shows the error.
--
-- Cause: policies call current_user_has_attendance_admin_access() /
-- current_user_employee_code() per row. Postgres re-evaluates them across
-- the year scan / bulk upsert.
--
-- Fix: wrap predicates in (SELECT ...) so RLS uses an InitPlan once per
-- statement. Keep HR/Admin full access; others own employee_code only.
-- Do NOT restore USING (true). Do NOT drop Admin / leave screens.
-- DATA SAFETY: policy metadata only — no row changes.
-- =============================================================================

-- Cheap gate (idempotent with 20260827150000). Needed if that file was not
-- applied on this database yet.
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

DO $$
DECLARE
  bal_emp_col text;
BEGIN
  IF to_regnamespace('indus_one') IS NULL THEN
    RAISE NOTICE 'Skipping leave-balance RLS — indus_one not present.';
    RETURN;
  END IF;

  IF to_regclass('indus_one.leave_carry_forward_rules') IS NOT NULL THEN
    DROP POLICY IF EXISTS leave_carry_forward_rules_select_authenticated ON indus_one.leave_carry_forward_rules;
    DROP POLICY IF EXISTS leave_carry_forward_rules_write_authenticated ON indus_one.leave_carry_forward_rules;
    DROP POLICY IF EXISTS leave_carry_forward_rules_hr ON indus_one.leave_carry_forward_rules;
    CREATE POLICY leave_carry_forward_rules_hr ON indus_one.leave_carry_forward_rules
      FOR ALL TO authenticated
      USING ((SELECT public.current_user_has_attendance_admin_access()))
      WITH CHECK ((SELECT public.current_user_has_attendance_admin_access()));
  END IF;

  IF to_regclass('indus_one.employee_pl_encash_pref') IS NOT NULL THEN
    DROP POLICY IF EXISTS employee_pl_encash_pref_select_authenticated ON indus_one.employee_pl_encash_pref;
    DROP POLICY IF EXISTS employee_pl_encash_pref_write_authenticated ON indus_one.employee_pl_encash_pref;
    DROP POLICY IF EXISTS employee_pl_encash_pref_hr ON indus_one.employee_pl_encash_pref;
    CREATE POLICY employee_pl_encash_pref_hr ON indus_one.employee_pl_encash_pref
      FOR ALL TO authenticated
      USING ((SELECT public.current_user_has_attendance_admin_access()))
      WITH CHECK ((SELECT public.current_user_has_attendance_admin_access()));
  END IF;

  IF to_regclass('indus_one.employee_leave_balances_yearly') IS NULL THEN
    RAISE NOTICE 'Skipping employee_leave_balances_yearly RLS — table not present.';
    RETURN;
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON indus_one.employee_leave_balances_yearly TO authenticated;
  GRANT ALL ON indus_one.employee_leave_balances_yearly TO service_role;

  DROP POLICY IF EXISTS employee_leave_balances_yearly_select_authenticated
    ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_yearly_write_authenticated
    ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS "employee_leave_balances_yearly_select_authenticated"
    ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS "employee_leave_balances_yearly_write_authenticated"
    ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_hr ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_self ON indus_one.employee_leave_balances_yearly;

  CREATE POLICY employee_leave_balances_hr ON indus_one.employee_leave_balances_yearly
    FOR ALL TO authenticated
    USING ((SELECT public.current_user_has_attendance_admin_access()))
    WITH CHECK ((SELECT public.current_user_has_attendance_admin_access()));

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one'
        AND table_name = 'employee_leave_balances_yearly'
        AND column_name = 'employee_code'
    ) THEN 'employee_code'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'indus_one'
        AND table_name = 'employee_leave_balances_yearly'
        AND column_name = 'emp_code'
    ) THEN 'emp_code'
    ELSE 'employee_code'
  END INTO bal_emp_col;

  EXECUTE format(
    'CREATE POLICY employee_leave_balances_self ON indus_one.employee_leave_balances_yearly
      FOR SELECT TO authenticated
      USING (
        (SELECT public.current_user_has_attendance_admin_access())
        OR lower(btrim(%I)) = lower(btrim((SELECT public.current_user_employee_code())))
      )',
    bal_emp_col
  );
END $$;

NOTIFY pgrst, 'reload schema';

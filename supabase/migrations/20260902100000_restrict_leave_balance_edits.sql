-- Leave balance ledger: view for admin-module / HR attendance admins; manual edit for
-- super admins and bency@indusfire.com only. Register usage sync stays via SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.current_user_can_edit_leave_balances()
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
        p.role IN ('super_admin', 'super_admin_pro')
        OR lower(btrim(coalesce(p.email, ''))) = 'bency@indusfire.com'
      )
  )
  OR lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) = 'bency@indusfire.com';
$$;

COMMENT ON FUNCTION public.current_user_can_edit_leave_balances() IS
  'Manual leave balance ledger edits: super admins and bency@indusfire.com only.';

GRANT EXECUTE ON FUNCTION public.current_user_can_edit_leave_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_edit_leave_balances() TO service_role;

CREATE OR REPLACE FUNCTION indus_one.sync_employee_yearly_leave_usage_row(p_row jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_code text;
  v_year int;
BEGIN
  IF NOT (
    (SELECT public.current_user_has_attendance_admin_access())
    OR (SELECT public.current_user_can_edit_leave_balances())
  ) THEN
    RAISE EXCEPTION 'not authorized to sync leave usage'
      USING ERRCODE = '42501';
  END IF;

  v_code := btrim(p_row->>'employee_code');
  v_year := NULLIF(p_row->>'year', '')::int;
  IF v_code IS NULL OR v_code = '' OR v_year IS NULL THEN
    RETURN false;
  END IF;

  UPDATE indus_one.employee_leave_balances_yearly b
  SET
    used_pl = coalesce((p_row->>'used_pl')::numeric, b.used_pl),
    used_sl = coalesce((p_row->>'used_sl')::numeric, b.used_sl),
    used_cl = coalesce((p_row->>'used_cl')::numeric, b.used_cl),
    used_sbel = coalesce((p_row->>'used_sbel')::numeric, b.used_sbel),
    used_spla = coalesce((p_row->>'used_spla')::numeric, b.used_spla),
    used_splb = coalesce((p_row->>'used_splb')::numeric, b.used_splb),
    used_splm = coalesce((p_row->>'used_splm')::numeric, b.used_splm),
    used_coff = coalesce((p_row->>'used_coff')::numeric, b.used_coff),
    used_paternity = coalesce((p_row->>'used_paternity')::numeric, b.used_paternity),
    unused_pl = coalesce((p_row->>'unused_pl')::numeric, b.unused_pl),
    unused_sl = coalesce((p_row->>'unused_sl')::numeric, b.unused_sl),
    unused_cl = coalesce((p_row->>'unused_cl')::numeric, b.unused_cl),
    unused_sbel = coalesce((p_row->>'unused_sbel')::numeric, b.unused_sbel),
    unused_spla = coalesce((p_row->>'unused_spla')::numeric, b.unused_spla),
    unused_splb = coalesce((p_row->>'unused_splb')::numeric, b.unused_splb),
    unused_splm = coalesce((p_row->>'unused_splm')::numeric, b.unused_splm),
    unused_coff = coalesce((p_row->>'unused_coff')::numeric, b.unused_coff),
    unused_paternity = coalesce((p_row->>'unused_paternity')::numeric, b.unused_paternity),
    processed_at = now()
  WHERE b.employee_code = v_code
    AND b.year = v_year;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.sync_employee_yearly_leave_usage_batch(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  rec jsonb;
  applied int := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR rec IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    IF indus_one.sync_employee_yearly_leave_usage_row(rec) THEN
      applied := applied + 1;
    END IF;
  END LOOP;

  RETURN applied;
END;
$$;

REVOKE ALL ON FUNCTION indus_one.sync_employee_yearly_leave_usage_row(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION indus_one.sync_employee_yearly_leave_usage_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION indus_one.sync_employee_yearly_leave_usage_row(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.sync_employee_yearly_leave_usage_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.sync_employee_yearly_leave_usage_row(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION indus_one.sync_employee_yearly_leave_usage_batch(jsonb) TO service_role;

DO $$
DECLARE
  bal_emp_col text;
BEGIN
  IF to_regclass('indus_one.employee_leave_balances_yearly') IS NULL THEN
    RAISE NOTICE 'Skipping leave balance edit RLS — table not present.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS employee_leave_balances_hr ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_self ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_select ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_insert ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_update ON indus_one.employee_leave_balances_yearly;
  DROP POLICY IF EXISTS employee_leave_balances_delete ON indus_one.employee_leave_balances_yearly;

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
    'CREATE POLICY employee_leave_balances_select ON indus_one.employee_leave_balances_yearly
      FOR SELECT TO authenticated
      USING (
        (SELECT public.current_user_has_admin_module_access())
        OR (SELECT public.current_user_has_attendance_admin_access())
        OR lower(btrim(%I)) = lower(btrim((SELECT public.current_user_employee_code())))
      )',
    bal_emp_col
  );

  CREATE POLICY employee_leave_balances_insert ON indus_one.employee_leave_balances_yearly
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.current_user_can_edit_leave_balances()));

  CREATE POLICY employee_leave_balances_update ON indus_one.employee_leave_balances_yearly
    FOR UPDATE TO authenticated
    USING ((SELECT public.current_user_can_edit_leave_balances()))
    WITH CHECK ((SELECT public.current_user_can_edit_leave_balances()));

  CREATE POLICY employee_leave_balances_delete ON indus_one.employee_leave_balances_yearly
    FOR DELETE TO authenticated
    USING ((SELECT public.current_user_can_edit_leave_balances()));
END $$;

NOTIFY pgrst, 'reload schema';

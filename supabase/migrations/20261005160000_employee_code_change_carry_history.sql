-- Employee code change → carry attendance & leave history to the new code.
--
-- Attendance, leave, tour, comp-off and balance rows are keyed by employee_code.
-- When Employee Master changes an employee's code, those rows used to stay on the
-- old code and disappeared from the employee's register / leave screens.
--
-- 1) public.employee_code_changes  – audit of every code change (old → new).
-- 2) AFTER UPDATE trigger on admin_ifsp_employee_master moves existing rows to the
--    new code (non-destructive: rows that would collide with an existing row under
--    the new code are left in place, except the daily register which is merged).
-- 3) BEFORE INSERT/UPDATE trigger on punches + register remaps a retired code to the
--    employee's current code, so a biometric device still sending the old code keeps
--    landing on the right employee.

-- ---------------------------------------------------------------------------
-- 1) Audit table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_code_changes (
  id bigserial PRIMARY KEY,
  employee_master_id bigint NOT NULL,
  old_code text NOT NULL,
  new_code text NOT NULL,
  old_code_norm text NOT NULL,
  rows_moved jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE INDEX IF NOT EXISTS employee_code_changes_old_norm_idx
  ON public.employee_code_changes (old_code_norm, changed_at DESC);
CREATE INDEX IF NOT EXISTS employee_code_changes_master_idx
  ON public.employee_code_changes (employee_master_id, changed_at DESC);

COMMENT ON TABLE public.employee_code_changes IS
  'History of Employee Master code changes. Old codes are remapped to the employee''s current code for attendance/leave data.';

ALTER TABLE public.employee_code_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_code_changes_select ON public.employee_code_changes;
CREATE POLICY employee_code_changes_select
  ON public.employee_code_changes FOR SELECT TO authenticated
  USING ((SELECT public.current_user_has_admin_module_access()));

GRANT SELECT ON public.employee_code_changes TO authenticated;
GRANT ALL ON public.employee_code_changes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.employee_code_changes_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 2a) Generic mover: retag rows of one table/column from old → new code.
--     p_conflict_cols: other unique-key columns; rows that would collide with an
--     existing new-code row are skipped (kept on the old code, never deleted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_employee_code_rows(
  p_schema text,
  p_table text,
  p_column text,
  p_old text,
  p_new text,
  p_conflict_cols text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_conflict text := '';
  v_col text;
  v_count integer := 0;
BEGIN
  IF to_regclass(format('%I.%I', p_schema, p_table)) IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = p_schema AND table_name = p_table AND column_name = p_column
  ) THEN
    RETURN 0;
  END IF;

  IF p_conflict_cols IS NOT NULL THEN
    v_conflict := format(
      ' AND NOT EXISTS (SELECT 1 FROM %I.%I x WHERE public.norm_emp_code(x.%I) = public.norm_emp_code($2)',
      p_schema, p_table, p_column
    );
    FOREACH v_col IN ARRAY p_conflict_cols LOOP
      v_conflict := v_conflict || format(' AND x.%1$I IS NOT DISTINCT FROM t.%1$I', v_col);
    END LOOP;
    v_conflict := v_conflict || ')';
  END IF;

  EXECUTE format(
    'UPDATE %I.%I t SET %I = $2 WHERE public.norm_emp_code(t.%I) = public.norm_emp_code($1)',
    p_schema, p_table, p_column, p_column
  ) || v_conflict
  USING p_old, p_new;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.move_employee_code_rows(text, text, text, text, text, text[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2b) Daily register: merge same-date rows, then retag the rest.
--     A manual / leave / tour mark from the old code wins over an automatic
--     (punch / auto WO / auto holiday) or blank mark already on the new code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_employee_code_register(p_old text, p_new text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF to_regclass('public.admin_attendance_register') IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.admin_attendance_register n
  SET mark = o.mark,
      mark_source = o.mark_source,
      mark_remark = coalesce(o.mark_remark, n.mark_remark),
      leave_request_id = o.leave_request_id,
      tour_request_id = o.tour_request_id,
      updated_at = now()
  FROM public.admin_attendance_register o
  WHERE public.norm_emp_code(o.employee_code) = public.norm_emp_code(p_old)
    AND public.norm_emp_code(n.employee_code) = public.norm_emp_code(p_new)
    AND o.register_date = n.register_date
    AND nullif(btrim(coalesce(o.mark, '')), '') IS NOT NULL
    AND (
      nullif(btrim(coalesce(n.mark, '')), '') IS NULL
      OR (
        coalesce(o.mark_source, '') NOT IN ('', 'punch', 'auto_wo', 'auto_holiday')
        AND coalesce(n.mark_source, '') IN ('', 'punch', 'auto_wo', 'auto_holiday')
      )
    );

  DELETE FROM public.admin_attendance_register o
  WHERE public.norm_emp_code(o.employee_code) = public.norm_emp_code(p_old)
    AND EXISTS (
      SELECT 1 FROM public.admin_attendance_register n
      WHERE public.norm_emp_code(n.employee_code) = public.norm_emp_code(p_new)
        AND n.register_date = o.register_date
    );

  UPDATE public.admin_attendance_register
  SET employee_code = p_new, updated_at = now()
  WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(p_old);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.move_employee_code_register(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2c) Trigger: Employee Master code changed → record + move history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_master_carry_code_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_old text := btrim(coalesce(OLD.employee_code, ''));
  v_new text := btrim(coalesce(NEW.employee_code, ''));
  v_moved jsonb := '{}'::jsonb;
  v_n integer;
  v_t record;
BEGIN
  IF v_old = '' OR v_new = '' OR public.norm_emp_code(v_old) = public.norm_emp_code(v_new) THEN
    RETURN NEW;
  END IF;

  -- Attendance
  v_moved := v_moved || jsonb_build_object('admin_attendance_register', public.move_employee_code_register(v_old, v_new));

  FOR v_t IN
    SELECT * FROM (VALUES
      ('public',    'erp_attendance_punches',            'employee_code', NULL::text[]),
      ('indus_one', 'admin_leave_requests',              'employee_code', NULL),
      ('indus_one', 'leave_requests',                    'employee_code', NULL),
      ('indus_one', 'admin_leave_attendance_marks',      'employee_code', NULL),
      ('indus_one', 'admin_leave_balance_ledger',        'employee_code', NULL),
      ('indus_one', 'admin_tour_requests',               'employee_code', NULL),
      ('indus_one', 'tour_requests',                     'employee_code', NULL),
      ('indus_one', 'admin_tour_attendance_marks',       'employee_code', NULL),
      ('indus_one', 'comp_off_deductions',               'employee_code', NULL),
      ('indus_one', 'comp_off_credits',                  'employee_code', ARRAY['earned_date']),
      ('indus_one', 'employee_leave_balances_yearly',    'employee_code', ARRAY['year']),
      ('indus_one', 'employee_pl_encash_pref',           'employee_code', ARRAY[]::text[]),
      ('indus_one', 'probation_leave_monthly_accruals',  'employee_code', ARRAY['leave_type', 'accrual_month'])
    ) AS t(schema_name, table_name, column_name, conflict_cols)
  LOOP
    v_n := public.move_employee_code_rows(v_t.schema_name, v_t.table_name, v_t.column_name, v_old, v_new, v_t.conflict_cols);
    IF v_n > 0 THEN
      v_moved := v_moved || jsonb_build_object(v_t.table_name, v_n);
    END IF;
  END LOOP;

  -- Login account: keep profiles.employee_code in step (unique per code).
  BEGIN
    UPDATE public.profiles p
    SET employee_code = v_new
    WHERE public.norm_emp_code(p.employee_code) = public.norm_emp_code(v_old)
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles x
        WHERE public.norm_emp_code(x.employee_code) = public.norm_emp_code(v_new)
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      v_moved := v_moved || jsonb_build_object('profiles', v_n);
    END IF;
  EXCEPTION WHEN raise_exception OR unique_violation THEN
    RAISE NOTICE 'Employee code change %→%: login profile not updated (%)', v_old, v_new, SQLERRM;
  END;

  INSERT INTO public.employee_code_changes (employee_master_id, old_code, new_code, old_code_norm, rows_moved, changed_by)
  VALUES (NEW.id, v_old, v_new, public.norm_emp_code(v_old), v_moved, auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_master_carry_code_history ON public.admin_ifsp_employee_master;
CREATE TRIGGER trg_employee_master_carry_code_history
  AFTER UPDATE OF employee_code ON public.admin_ifsp_employee_master
  FOR EACH ROW
  WHEN (OLD.employee_code IS DISTINCT FROM NEW.employee_code)
  EXECUTE FUNCTION public.employee_master_carry_code_history();

-- ---------------------------------------------------------------------------
-- 3) Remap retired codes on new punches / register rows
--    Only when no Employee Master row currently owns the old code (so a code that
--    was re-issued to someone else is never hijacked).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remap_retired_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_norm text;
  v_current text;
BEGIN
  v_norm := public.norm_emp_code(NEW.employee_code);
  IF v_norm = '' THEN
    RETURN NEW;
  END IF;

  SELECT m.employee_code INTO v_current
  FROM public.employee_code_changes c
  JOIN public.admin_ifsp_employee_master m ON m.id = c.employee_master_id
  WHERE c.old_code_norm = v_norm
  ORDER BY c.changed_at DESC
  LIMIT 1;

  IF v_current IS NULL OR public.norm_emp_code(v_current) = v_norm THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master x
    WHERE public.norm_emp_code(x.employee_code) = v_norm
  ) THEN
    RETURN NEW;
  END IF;

  NEW.employee_code := v_current;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.erp_attendance_punches') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_remap_retired_code_punches ON public.erp_attendance_punches;
    CREATE TRIGGER trg_remap_retired_code_punches
      BEFORE INSERT OR UPDATE OF employee_code ON public.erp_attendance_punches
      FOR EACH ROW EXECUTE FUNCTION public.remap_retired_employee_code();
  END IF;

  IF to_regclass('public.admin_attendance_register') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_remap_retired_code_register ON public.admin_attendance_register;
    CREATE TRIGGER trg_remap_retired_code_register
      BEFORE INSERT OR UPDATE OF employee_code ON public.admin_attendance_register
      FOR EACH ROW EXECUTE FUNCTION public.remap_retired_employee_code();
  END IF;
END $$;

-- Use employee_code everywhere (matches admin_ifsp_employee_master + attendance register).
-- Renames legacy emp_code columns; refreshes leave workflow functions.

CREATE OR REPLACE FUNCTION public._rename_column_if_exists(
  p_schema text,
  p_table text,
  p_old text,
  p_new text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = p_schema
      AND table_name = p_table
      AND column_name = p_old
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = p_schema
      AND table_name = p_table
      AND column_name = p_new
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.%I RENAME COLUMN %I TO %I',
      p_schema,
      p_table,
      p_old,
      p_new
    );
  END IF;
END;
$$;

-- profiles: emp_code → employee_code (skip copy if emp_code never existed)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_code text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'emp_code'
  ) THEN
    UPDATE public.profiles
    SET employee_code = emp_code
    WHERE employee_code IS NULL
      AND emp_code IS NOT NULL;
  END IF;
END $$;

SELECT public._rename_column_if_exists('public', 'profiles', 'emp_code', 'employee_code');

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS emp_code;

DROP INDEX IF EXISTS public.profiles_emp_code_unique_idx;
DROP INDEX IF EXISTS public.profiles_employee_code_unique_idx;
CREATE UNIQUE INDEX profiles_employee_code_unique_idx
  ON public.profiles (lower(btrim(employee_code)))
  WHERE employee_code IS NOT NULL AND btrim(employee_code) <> '';

COMMENT ON COLUMN public.profiles.employee_code IS
  'Unique employee code for this ERP user; matches admin_ifsp_employee_master.employee_code.';

-- indus_one leave / balance tables
SELECT public._rename_column_if_exists('indus_one', 'admin_leave_requests', 'emp_code', 'employee_code');
SELECT public._rename_column_if_exists('indus_one', 'admin_leave_balance_ledger', 'emp_code', 'employee_code');
SELECT public._rename_column_if_exists('indus_one', 'employee_pl_encash_pref', 'emp_code', 'employee_code');
SELECT public._rename_column_if_exists('indus_one', 'employee_leave_balances_yearly', 'emp_code', 'employee_code');

-- Leave workflow functions (column rename on admin_leave_requests)
CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_balance_deduction(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_year integer;
  v_days numeric;
  v_code text;
BEGIN
  v_code := upper(btrim(p_req.leave_type_code));
  IF v_code NOT IN ('PL', 'SL', 'CL') THEN
    RETURN;
  END IF;

  v_year := extract(year FROM p_req.from_date)::integer;
  v_days := p_req.days;

  IF NOT EXISTS (
    SELECT 1 FROM indus_one.employee_leave_balances_yearly y
    WHERE y.employee_code = p_req.employee_code AND y.year = v_year
  ) THEN
    RETURN;
  END IF;

  IF v_code = 'PL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_pl = used_pl + v_days,
      unused_pl = greatest(coalesce(unused_pl, 0) - v_days, 0),
      processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSIF v_code = 'SL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_sl = used_sl + v_days,
      unused_sl = greatest(coalesce(unused_sl, 0) - v_days, 0),
      processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  ELSIF v_code = 'CL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET
      used_cl = used_cl + v_days,
      unused_cl = greatest(coalesce(unused_cl, 0) - v_days, 0),
      processed_at = now()
    WHERE employee_code = p_req.employee_code AND year = v_year;
  END IF;

  INSERT INTO indus_one.admin_leave_balance_ledger (
    leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
  ) VALUES (
    p_req.id, p_req.employee_code, v_year, v_code, -v_days, 'deduct',
    'Approved leave — balance deducted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_restore_balance(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT * FROM indus_one.admin_leave_balance_ledger
    WHERE leave_request_id = p_req.id AND entry_type = 'deduct'
    ORDER BY created_at
  LOOP
    IF v_row.leave_type_code = 'PL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET
        used_pl = greatest(used_pl + v_row.delta_days, 0),
        unused_pl = unused_pl - v_row.delta_days,
        processed_at = now()
      WHERE employee_code = v_row.employee_code AND year = v_row.year;
    ELSIF v_row.leave_type_code = 'SL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET
        used_sl = greatest(used_sl + v_row.delta_days, 0),
        unused_sl = unused_sl - v_row.delta_days,
        processed_at = now()
      WHERE employee_code = v_row.employee_code AND year = v_row.year;
    ELSIF v_row.leave_type_code = 'CL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET
        used_cl = greatest(used_cl + v_row.delta_days, 0),
        unused_cl = unused_cl - v_row.delta_days,
        processed_at = now()
      WHERE employee_code = v_row.employee_code AND year = v_row.year;
    END IF;

    INSERT INTO indus_one.admin_leave_balance_ledger (
      leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
    ) VALUES (
      p_req.id, v_row.employee_code, v_row.year, v_row.leave_type_code,
      -v_row.delta_days, 'restore', 'Leave rejected/cancelled — balance restored'
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_attendance(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_mark text;
  v_date date;
  v_month_key text;
  v_prev_mark text;
  v_prev_source text;
  v_prev_leave_id uuid;
  v_row_exists boolean;
  v_can_apply boolean;
BEGIN
  v_mark := indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code);

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date)
  LOOP
    v_month_key := to_char(v_date, 'YYYY-MM');

    SELECT r.mark, r.mark_source, r.leave_request_id
    INTO v_prev_mark, v_prev_source, v_prev_leave_id
    FROM public.admin_attendance_register r
    WHERE r.employee_code = p_req.employee_code
      AND r.register_date = v_date
    LIMIT 1;

    v_row_exists := FOUND;
    v_can_apply := true;

    IF v_row_exists THEN
      IF indus_one.admin_leave_mark_is_manual(v_prev_mark, v_prev_source) THEN
        v_can_apply := false;
      ELSIF NOT indus_one.admin_leave_mark_is_punch(v_prev_mark, v_prev_source)
        AND v_prev_leave_id IS DISTINCT FROM p_req.id
      THEN
        v_can_apply := false;
      END IF;
    END IF;

    IF NOT v_can_apply THEN
      CONTINUE;
    END IF;

    INSERT INTO indus_one.admin_leave_attendance_marks (
      leave_request_id, employee_code, register_date, applied_mark,
      previous_mark, previous_mark_source
    ) VALUES (
      p_req.id, p_req.employee_code, v_date, v_mark,
      CASE WHEN v_row_exists THEN v_prev_mark ELSE NULL END,
      CASE WHEN v_row_exists THEN v_prev_source ELSE NULL END
    )
    ON CONFLICT (leave_request_id, register_date) DO NOTHING;

    IF v_row_exists THEN
      UPDATE public.admin_attendance_register
      SET
        mark = v_mark,
        mark_source = 'leave',
        leave_request_id = p_req.id,
        month_key = coalesce(nullif(btrim(month_key), ''), v_month_key),
        updated_at = now()
      WHERE employee_code = p_req.employee_code
        AND register_date = v_date;
    ELSE
      INSERT INTO public.admin_attendance_register (
        employee_code, register_date, month_key, mark, mark_source, leave_request_id, updated_at
      ) VALUES (
        p_req.employee_code, v_date, v_month_key, v_mark, 'leave', p_req.id, now()
      );
    END IF;
  END LOOP;
END;
$$;

-- Half-day composite attendance marks (Option A): P/SL, P/CL, P/PL
-- One row per employee per day; 0.5 Present + 0.5 typed leave.

-- ---------------------------------------------------------------------------
-- 1) Extend register mark_check
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_attendance_register
  DROP CONSTRAINT IF EXISTS admin_attendance_register_mark_check;

ALTER TABLE public.admin_attendance_register
  ADD CONSTRAINT admin_attendance_register_mark_check CHECK (
    mark IN (
      'P',
      'P(OD)',
      'T',
      'L',
      'WO',
      'NH/PH',
      'HD',
      'WFH',
      'PL',
      'CL',
      'SL',
      'SPLA',
      'SPLB',
      'SPLM',
      'SBEL',
      'CO',
      'PTL',
      'ML',
      'LWP',
      'Left',
      'P/SL',
      'P/CL',
      'P/PL'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Normalize: allow composites; do not collapse P/SL → L
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_normalize_register_mark(p_mark text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_mark IS NULL OR btrim(p_mark) = '' THEN 'L'
    WHEN upper(btrim(p_mark)) IN ('NHPH', 'NH/PH') THEN 'NH/PH'
    WHEN upper(btrim(p_mark)) IN ('C/O', 'COMP OFF', 'COMPENSATORY OFF') THEN 'CO'
    WHEN upper(btrim(p_mark)) = 'P (OD)' THEN 'P(OD)'
    WHEN upper(btrim(p_mark)) IN ('P/SL', 'P/CL', 'P/PL') THEN upper(btrim(p_mark))
    WHEN upper(btrim(p_mark)) IN (
      'P', 'P(OD)', 'T', 'L', 'WO', 'HD', 'WFH',
      'PL', 'CL', 'SL', 'SPLA', 'SPLB', 'SPLM', 'SBEL', 'CO', 'PTL', 'ML', 'LWP', 'LEFT'
    ) THEN
      CASE upper(btrim(p_mark))
        WHEN 'P(OD)' THEN 'P(OD)'
        WHEN 'LEFT' THEN 'Left'
        ELSE upper(btrim(p_mark))
      END
    WHEN upper(btrim(p_mark)) IN ('A', 'ABSENT', 'LEAVE') THEN 'L'
    WHEN upper(btrim(p_mark)) IN ('WEEK OFF', 'WEEKOFF') THEN 'WO'
    WHEN upper(btrim(p_mark)) IN ('HALF DAY', 'HALFDAY') THEN 'HD'
    WHEN upper(btrim(p_mark)) IN ('WORK FROM HOME', 'WFH') THEN 'WFH'
    ELSE 'L'
  END;
$$;

-- Map leave type mark → composite half-day mark (NULL if not SL/CL/PL).
CREATE OR REPLACE FUNCTION indus_one.admin_leave_composite_half_day_mark(p_leave_mark text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(btrim(coalesce(p_leave_mark, '')))
    WHEN 'SL' THEN 'P/SL'
    WHEN 'CL' THEN 'P/CL'
    WHEN 'PL' THEN 'P/PL'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_is_half_day_request(p_req indus_one.admin_leave_requests)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_req.days, 0) = 0.5;
$$;

-- ---------------------------------------------------------------------------
-- 3) Deductible days: punch + half-day SL/CL/PL → 0.5; half-day without punch → 0.5
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_deductible_days(p_req indus_one.admin_leave_requests)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
  SELECT CASE
    WHEN indus_one.admin_leave_is_half_day_request(p_req) THEN
      CASE
        WHEN exists (
          SELECT 1
          FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, p_req.employee_code) AS d
          WHERE
            NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
            OR indus_one.admin_leave_composite_half_day_mark(
                 indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code)
               ) IS NOT NULL
        ) THEN 0.5::numeric
        ELSE 0::numeric
      END
    ELSE (
      SELECT count(*)::numeric
      FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, p_req.employee_code) AS d
      WHERE NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
    )
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Apply attendance: half-day + Present/Punch → P/SL|P/CL|P/PL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_attendance(p_req indus_one.admin_leave_requests)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_base_mark text;
  v_mark text;
  v_composite text;
  v_date date;
  v_month_key text;
  v_prev_mark text;
  v_prev_source text;
  v_prev_leave_id uuid;
  v_row_exists boolean;
  v_can_apply boolean;
  v_reg_code text;
  v_has_present boolean;
  v_is_half boolean;
BEGIN
  IF NOT indus_one.admin_leave_is_fully_approved(p_req) THEN
    RETURN;
  END IF;

  v_reg_code := indus_one.admin_leave_validate_request_employee(p_req);
  IF v_reg_code IS NULL THEN
    RETURN;
  END IF;

  v_base_mark := indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code);
  v_composite := indus_one.admin_leave_composite_half_day_mark(v_base_mark);
  v_is_half := indus_one.admin_leave_is_half_day_request(p_req);

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_reg_code)
  LOOP
    v_has_present := indus_one.admin_leave_date_punch_priority(v_reg_code, v_date);

    IF v_has_present THEN
      IF v_is_half AND v_composite IS NOT NULL THEN
        v_mark := v_composite;
      ELSE
        CONTINUE;
      END IF;
    ELSE
      v_mark := v_base_mark;
    END IF;

    v_month_key := to_char(v_date, 'YYYY-MM');

    SELECT r.mark, r.mark_source, r.leave_request_id
    INTO v_prev_mark, v_prev_source, v_prev_leave_id
    FROM public.admin_attendance_register r
    WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(v_reg_code)
      AND r.register_date = v_date
    LIMIT 1;

    v_row_exists := FOUND;
    v_can_apply := true;

    IF v_row_exists THEN
      IF indus_one.admin_leave_mark_is_manual(v_prev_mark, v_prev_source) THEN
        v_can_apply := false;
      ELSIF NOT indus_one.admin_leave_mark_is_punch(v_prev_mark, v_prev_source)
        AND v_prev_leave_id IS DISTINCT FROM p_req.id
        AND coalesce(lower(btrim(v_prev_source)), '') = 'leave'
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
      p_req.id, v_reg_code, v_date, v_mark,
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
      WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code)
        AND register_date = v_date;
    ELSE
      INSERT INTO public.admin_attendance_register (
        employee_code, register_date, month_key, mark, mark_source, leave_request_id, updated_at
      ) VALUES (
        v_reg_code, v_date, v_month_key, v_mark, 'leave', p_req.id, now()
      );
    END IF;
  END LOOP;
END;
$$;

-- Balance ledger note: half-day composites deduct 0.5 via deductible_days.
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
  v_unused numeric;
  v_reg_code text;
BEGIN
  IF NOT indus_one.admin_leave_is_fully_approved(p_req) THEN
    RETURN;
  END IF;

  v_reg_code := indus_one.admin_leave_validate_request_employee(p_req);
  IF v_reg_code IS NULL THEN
    RETURN;
  END IF;

  v_code := upper(btrim(p_req.leave_type_code));
  IF v_code NOT IN ('PL', 'SL', 'CL') THEN
    RETURN;
  END IF;

  v_year := extract(year FROM p_req.from_date)::integer;
  v_days := indus_one.admin_leave_deductible_days(p_req);

  IF v_days <= 0 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM indus_one.employee_leave_balances_yearly y
    WHERE public.norm_emp_code(y.employee_code) = public.norm_emp_code(v_reg_code)
      AND y.year = v_year
  ) THEN
    RETURN;
  END IF;

  IF v_code = 'PL' THEN
    SELECT coalesce(unused_pl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSIF v_code = 'SL' THEN
    SELECT coalesce(unused_sl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSE
    SELECT coalesce(unused_cl, 0) INTO v_unused
    FROM indus_one.employee_leave_balances_yearly
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  END IF;

  IF v_unused < v_days THEN
    RETURN;
  END IF;

  IF v_code = 'PL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_pl = used_pl + v_days, unused_pl = unused_pl - v_days, processed_at = now()
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSIF v_code = 'SL' THEN
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_sl = used_sl + v_days, unused_sl = unused_sl - v_days, processed_at = now()
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  ELSE
    UPDATE indus_one.employee_leave_balances_yearly
    SET used_cl = used_cl + v_days, unused_cl = unused_cl - v_days, processed_at = now()
    WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
  END IF;

  INSERT INTO indus_one.admin_leave_balance_ledger (
    leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
  ) VALUES (
    p_req.id, v_reg_code, v_year, v_code, -v_days, 'deduct',
    CASE
      WHEN indus_one.admin_leave_is_half_day_request(p_req) THEN
        'Approved half-day leave — 0.5 balance deducted (composite mark when Present/Punch)'
      ELSE
        'Approved leave — balance deducted (excludes full-day punch-present days)'
    END
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

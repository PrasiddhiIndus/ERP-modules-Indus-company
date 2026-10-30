-- Punch + LWP leave → register mark P/LWP (half day, value 0.5).
--
-- DATA SAFETY:
--   * No UPDATE / DELETE / INSERT of attendance or leave rows.
--   * Only widens mark_check to allow 'P/LWP', and patches leave-apply
--     so the single punch+LWP case writes P/LWP instead of skipping the day.
--
-- UNCHANGED:
--   * Existing register / leave / balance / sandwich / CO / P/PL|P/CL|P/SL data
--   * Punch priority for non-LWP leave (still CONTINUE — Present wins)
--   * Half-day leave, sandwich LWP, paid-leave balance deduction
--   * admin_leave_register_mark_is_lwp (sandwich flanking) — not modified

-- ---------------------------------------------------------------------------
-- 1) Allow P/LWP on admin_attendance_register (constraint only; no row rewrites)
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
      'P/PL',
      'P/LWP',
      'LWP/PL',
      'LWP/SL',
      'LWP/CL'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Normalize: allow P/LWP through (same body as before + one token)
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
    WHEN upper(btrim(p_mark)) IN (
      'P/SL', 'P/CL', 'P/PL', 'P/LWP', 'LWP/PL', 'LWP/SL', 'LWP/CL'
    ) THEN
      upper(btrim(p_mark))
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

-- ---------------------------------------------------------------------------
-- 3) sufficient — identical to 20261027171000 except:
--      punch + (force LWP | leave type LWP) → write P/LWP instead of CONTINUE
--      P/LWP day paid_amount = 0 (same as LWP)
--      force_lwp lwp_days: P/LWP counts 0.5, other applied days still 1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_attendance_sufficient(
  p_req indus_one.admin_leave_requests
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_mark text;
  v_date date;
  v_reg_code text;
  v_emp_code text;
  v_is_half_day boolean;
  v_marks jsonb := '[]'::jsonb;
  v_paid numeric := 0;
  v_type text;
  v_force_lwp boolean := false;
  v_day_mark text;
  v_day_paid numeric;
BEGIN
  v_emp_code := coalesce(
    nullif(btrim(p_req.employee_code), ''),
    indus_one.admin_leave_request_employee_code(p_req.id)
  );

  IF v_emp_code IS NULL AND p_req.employee_master_id IS NOT NULL THEN
    SELECT coalesce(
      nullif(btrim(m.employee_code::text), ''),
      nullif(btrim(m.employee_id::text), '')
    )
    INTO v_emp_code
    FROM public.admin_ifsp_employee_master m
    WHERE m.id = p_req.employee_master_id;
  END IF;

  v_reg_code := coalesce(
    indus_one.admin_leave_register_employee_code(v_emp_code),
    nullif(btrim(v_emp_code), '')
  );

  IF v_reg_code IS NULL OR btrim(v_reg_code) = '' THEN
    RETURN jsonb_build_object(
      'paid_leave_days', 0,
      'lwp_days', 0,
      'applied_day_marks', '[]'::jsonb
    );
  END IF;

  v_is_half_day := indus_one.admin_leave_is_half_day(p_req.days);
  v_type := upper(btrim(indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code)));
  v_mark := v_type;
  IF v_is_half_day THEN
    v_mark := 'P/' || v_type;
  END IF;

  IF coalesce(p_req.lwp_days, 0) > 0 AND coalesce(p_req.paid_leave_days, 0) <= 0 THEN
    v_force_lwp := true;
    v_mark := 'LWP';
  END IF;

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_reg_code)
  LOOP
    v_day_mark := v_mark;

    IF NOT v_is_half_day AND indus_one.admin_leave_date_punch_priority(v_reg_code, v_date) THEN
      -- Same as before for CO; non-LWP leave still skipped (Present wins).
      -- Only change: LWP / all-LWP on a punch day → P/LWP.
      IF v_type = 'CO' THEN
        v_day_mark := 'CO';
      ELSIF v_force_lwp OR v_type = 'LWP' THEN
        v_day_mark := 'P/LWP';
      ELSE
        CONTINUE;
      END IF;
    ELSIF v_force_lwp THEN
      v_day_mark := 'LWP';
    -- Paid Taken Leave: sandwich offs stay as leave type (balance deducts them).
    -- Unpaid / all-LWP: sandwich offs between LWP stay LWP (prior policy).
    ELSIF coalesce(p_req.paid_leave_days, 0) <= 0
      AND coalesce(p_req.lwp_days, 0) > 0
      AND indus_one.admin_leave_date_is_sandwichable_off(v_reg_code, v_date)
      AND indus_one.admin_leave_flanking_working_marks_are_lwp(v_reg_code, v_date)
    THEN
      v_day_mark := 'LWP';
    END IF;

    PERFORM indus_one.admin_leave_write_register_mark(p_req, v_reg_code, v_date, v_day_mark);

    v_day_paid := CASE
      WHEN v_day_mark IN ('LWP', 'P/LWP') THEN 0
      WHEN v_is_half_day THEN coalesce(p_req.days, 0.5)
      ELSE 1
    END;
    IF upper(btrim(coalesce(p_req.leave_type_code, ''))) IN ('PL', 'SL', 'CL') THEN
      v_paid := v_paid + v_day_paid;
    END IF;

    v_marks := v_marks || jsonb_build_array(jsonb_build_object(
      'date', v_date::text,
      'mark', v_day_mark,
      'paid_amount', v_day_paid
    ));
  END LOOP;

  IF v_force_lwp OR upper(btrim(coalesce(p_req.leave_type_code, ''))) NOT IN ('PL', 'SL', 'CL') THEN
    v_paid := 0;
  END IF;

  RETURN jsonb_build_object(
    'paid_leave_days', v_paid,
    'lwp_days', CASE
      WHEN v_force_lwp THEN (
        SELECT coalesce(sum(
          CASE WHEN (e->>'mark') = 'P/LWP' THEN 0.5 ELSE 1 END
        ), 0)
        FROM jsonb_array_elements(v_marks) e
      )
      ELSE greatest(jsonb_array_length(v_marks)::numeric - v_paid, 0)
    END,
    'applied_day_marks', v_marks
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) partial — identical to 20261027170000 except:
--      after mark_for_unit, if mark is full LWP and day has punch → P/LWP @ 0.5
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_attendance_partial(
  p_req indus_one.admin_leave_requests,
  p_available numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_reg_code text;
  v_emp_code text;
  v_type text;
  v_running numeric;
  v_new_balance numeric;
  v_unit record;
  v_mark text;
  v_paid numeric;
  v_lwp numeric;
  v_total_paid numeric := 0;
  v_total_lwp numeric := 0;
  v_marks jsonb := '[]'::jsonb;
  v_date date;
  v_seen text[];
BEGIN
  v_emp_code := coalesce(
    nullif(btrim(p_req.employee_code), ''),
    indus_one.admin_leave_request_employee_code(p_req.id)
  );

  v_reg_code := coalesce(
    indus_one.admin_leave_register_employee_code(v_emp_code),
    nullif(btrim(v_emp_code), '')
  );

  IF v_reg_code IS NULL OR btrim(v_reg_code) = '' THEN
    RETURN jsonb_build_object(
      'paid_leave_days', 0,
      'lwp_days', 0,
      'applied_day_marks', '[]'::jsonb
    );
  END IF;

  v_type := upper(btrim(indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code)));
  v_running := greatest(coalesce(p_available, 0), 0);
  v_seen := ARRAY[]::text[];

  FOR v_unit IN
    SELECT u.unit_date, u.unit_weight
    FROM indus_one.admin_leave_approval_day_units(p_req, v_reg_code) u
    ORDER BY u.unit_date
  LOOP
    SELECT f.o_mark, f.o_paid, f.o_lwp, f.o_new_balance
    INTO v_mark, v_paid, v_lwp, v_new_balance
    FROM indus_one.admin_leave_mark_for_unit(v_running, v_unit.unit_weight, v_type) f;

    v_running := greatest(coalesce(v_new_balance, 0), 0);

    -- Only change vs prior partial: punch + full LWP → P/LWP (0.5).
    -- LWP/PL|SL|CL and paid marks are untouched.
    IF upper(btrim(coalesce(v_mark, ''))) = 'LWP'
      AND indus_one.admin_leave_date_punch_priority(v_reg_code, v_unit.unit_date)
    THEN
      v_mark := 'P/LWP';
      v_lwp := least(coalesce(v_lwp, 1), 0.5);
    END IF;

    PERFORM indus_one.admin_leave_write_register_mark(
      p_req, v_reg_code, v_unit.unit_date, v_mark
    );

    v_total_paid := v_total_paid + coalesce(v_paid, 0);
    v_total_lwp := v_total_lwp + coalesce(v_lwp, 0);
    v_seen := v_seen || v_unit.unit_date::text;

    v_marks := v_marks || jsonb_build_array(jsonb_build_object(
      'date', v_unit.unit_date::text,
      'mark', v_mark,
      'paid_amount', coalesce(v_paid, 0)
    ));
  END LOOP;

  -- Safety: any sandwichable working_date missed by units → LWP (no paid debit)
  FOR v_date IN
    SELECT wd.d
    FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_reg_code) AS wd(d)
    ORDER BY wd.d
  LOOP
    IF v_date::text = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    IF NOT indus_one.admin_leave_date_is_sandwichable_off(v_reg_code, v_date) THEN
      CONTINUE;
    END IF;

    v_mark := 'LWP';
    PERFORM indus_one.admin_leave_write_register_mark(p_req, v_reg_code, v_date, v_mark);
    v_total_lwp := v_total_lwp + 1;
    v_seen := v_seen || v_date::text;
    v_marks := v_marks || jsonb_build_array(jsonb_build_object(
      'date', v_date::text,
      'mark', v_mark,
      'paid_amount', 0
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'paid_leave_days', v_total_paid,
    'lwp_days', v_total_lwp,
    'applied_day_marks', v_marks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_apply_attendance_partial(
  indus_one.admin_leave_requests, numeric
) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Approved SPLA / SPLB on Daily Attendance Register → P/SPLA | P/SPLB.
--
-- Root cause: half-day leave-apply wrote P/SPLA|P/SPLB, but normalize + mark_check
-- did not allow those tokens, so they collapsed to L.
--
-- DATA / LOGIC SAFETY:
--   * No UPDATE / DELETE of existing attendance or leave rows.
--   * Only widens mark_check / normalize, birthday-leave check, and the
--     leave-apply punch branch for SPLA|SPLB → P/SPLA|P/SPLB.
--   * PL/CL/SL, LWP, CO, sandwich, balance deduction unchanged.

-- ---------------------------------------------------------------------------
-- 1) Allow P/SPLA | P/SPLB on admin_attendance_register
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
      'P/SPLA',
      'P/SPLB',
      'LWP/PL',
      'LWP/SL',
      'LWP/CL'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Normalize: preserve P/SPLA | P/SPLB (do not collapse to L)
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
      'P/SL', 'P/CL', 'P/PL', 'P/LWP', 'P/SPLA', 'P/SPLB',
      'LWP/PL', 'LWP/SL', 'LWP/CL'
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
-- 3) Birthday / anniversary check also covers P/SPLA | P/SPLB composites
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_attendance_mark_is_birthday_anniversary_leave(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(coalesce(p_mark, ''))) IN (
    'SBEL', 'SPLA', 'SPLB', 'P/SPLA', 'P/SPLB', 'SPLA/P', 'SPLB/P'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) sufficient — same as punch+LWP migration, plus:
--      punch + SPLA|SPLB → P/SPLA|P/SPLB (instead of skipping / Present wins)
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
  -- SPLA / SPLB are half-day special leave: always store Present+leave composite.
  IF v_type IN ('SPLA', 'SPLB') THEN
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

    IF NOT v_is_half_day
      AND v_type NOT IN ('SPLA', 'SPLB')
      AND indus_one.admin_leave_date_punch_priority(v_reg_code, v_date)
    THEN
      IF v_type = 'CO' THEN
        v_day_mark := 'CO';
      ELSIF v_force_lwp OR v_type = 'LWP' THEN
        v_day_mark := 'P/LWP';
      ELSE
        CONTINUE;
      END IF;
    ELSIF v_force_lwp THEN
      v_day_mark := 'LWP';
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
      WHEN v_day_mark IN ('P/SPLA', 'P/SPLB') THEN coalesce(p_req.days, 0.5)
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

NOTIFY pgrst, 'reload schema';

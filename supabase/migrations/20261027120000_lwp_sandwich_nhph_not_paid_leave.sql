-- LWP sandwich: NH/PH (and WO) between consecutive LWP must become LWP, not PL/CL/SL.
--
-- Root cause:
--   20261026150000 made NH/PH sandwichable like WO. Leave apply then writes those
--   days with the leave-type mark (PL/SL/CL) via sufficient / write_register_mark.
--   admin_leave_approval_day_units only emits p_req.days units, so newly included
--   sandwich NH/PH beyond that count are never visited by the partial-LWP walk and
--   can remain (or be re-stamped as) paid leave while flanking work days are LWP.
--
-- Fix (minimal):
--   1) write_register_mark — if converting a sandwichable off day to a paid leave
--      mark and both flanking working-day marks are LWP, force LWP.
--   2) apply_attendance_partial — after the day-unit walk, stamp any remaining
--      sandwichable-off working_dates as LWP (no paid debit).
--   3) apply_attendance_sufficient — never stamp paid leave on sandwichable offs
--      when the request is already all-LWP (paid_leave_days = 0, lwp_days > 0);
--      also force LWP when flanking working days are both LWP.
--
-- Unchanged: half-day sandwich block, manual WO/NH/PH protection, punch priority,
-- paid-leave sandwich (PL between PL), balance ledger math, UI.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_register_mark_is_lwp(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(coalesce(p_mark, ''))) IN ('LWP', 'LWP/PL', 'LWP/SL', 'LWP/CL');
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_register_mark_is_paid_leave(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(coalesce(p_mark, ''))) IN (
    'PL', 'CL', 'SL', 'P/PL', 'P/CL', 'P/SL', 'PL/P', 'CL/P', 'SL/P'
  );
$$;

-- Nearest non-sandwichable-off register mark walking left (−1) or right (+1).
CREATE OR REPLACE FUNCTION indus_one.admin_leave_flanking_working_mark(
  p_employee_code text,
  p_date date,
  p_direction integer
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_emp text := nullif(btrim(p_employee_code), '');
  v_cursor date;
  v_mark text;
  v_guard integer := 0;
  v_step integer := CASE WHEN p_direction < 0 THEN -1 ELSE 1 END;
BEGIN
  IF v_emp IS NULL OR p_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_cursor := p_date + v_step;
  WHILE v_guard < 21 LOOP
    v_guard := v_guard + 1;

    IF indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_cursor) THEN
      v_cursor := v_cursor + v_step;
      CONTINUE;
    END IF;

    SELECT upper(btrim(r.mark))
    INTO v_mark
    FROM public.admin_attendance_register r
    WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(v_emp)
      AND r.register_date = v_cursor
    LIMIT 1;

    RETURN v_mark;
  END LOOP;

  RETURN NULL;
END;
$$;

-- True when both flanking working-day marks are LWP (LWP sandwich).
CREATE OR REPLACE FUNCTION indus_one.admin_leave_flanking_working_marks_are_lwp(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
  SELECT indus_one.admin_leave_register_mark_is_lwp(
           indus_one.admin_leave_flanking_working_mark(p_employee_code, p_date, -1)
         )
     AND indus_one.admin_leave_register_mark_is_lwp(
           indus_one.admin_leave_flanking_working_mark(p_employee_code, p_date, 1)
         );
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_register_mark_is_lwp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_register_mark_is_paid_leave(text) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_flanking_working_mark(text, date, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_flanking_working_marks_are_lwp(text, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- write_register_mark: LWP sandwich overrides paid leave on WO / NH/PH
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_write_register_mark(
  p_req indus_one.admin_leave_requests,
  p_reg_code text,
  p_date date,
  p_mark text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_prev_mark text;
  v_prev_source text;
  v_prev_leave_id uuid;
  v_row_exists boolean;
  v_can_apply boolean;
  v_prev_src text;
  v_prev_mark_u text;
  v_mark text := upper(btrim(coalesce(p_mark, '')));
BEGIN
  SELECT r.mark, r.mark_source, r.leave_request_id
  INTO v_prev_mark, v_prev_source, v_prev_leave_id
  FROM public.admin_attendance_register r
  WHERE indus_one.leave_attendance_norm_code(r.employee_code)
          = indus_one.leave_attendance_norm_code(p_reg_code)
    AND r.register_date = p_date
  LIMIT 1;

  v_row_exists := FOUND;
  v_can_apply := true;
  v_prev_src := coalesce(lower(btrim(v_prev_source)), '');
  v_prev_mark_u := upper(btrim(coalesce(v_prev_mark, '')));

  IF v_row_exists THEN
    IF v_prev_mark_u = 'WO'
       AND v_prev_src IN ('', 'auto_wo', 'auto')
    THEN
      v_can_apply := true;
    ELSIF v_prev_mark_u IN ('NH/PH', 'NHPH')
       AND v_prev_src IN ('', 'auto_holiday', 'auto')
    THEN
      v_can_apply := true;
    ELSIF indus_one.admin_leave_mark_is_manual(v_prev_mark, v_prev_source) THEN
      v_can_apply := false;
    ELSIF NOT indus_one.admin_leave_is_half_day(p_req.days)
      AND NOT indus_one.admin_leave_mark_is_punch(v_prev_mark, v_prev_source)
      AND v_prev_leave_id IS DISTINCT FROM p_req.id
      AND coalesce(lower(btrim(v_prev_source)), '') = 'leave'
    THEN
      v_can_apply := false;
    END IF;
  END IF;

  IF NOT v_can_apply THEN
    RETURN;
  END IF;

  -- LWP | NH/PH or WO | LWP → sandwich day must be LWP, not PL/CL/SL
  IF indus_one.admin_leave_register_mark_is_paid_leave(v_mark)
     AND indus_one.admin_leave_date_is_sandwichable_off(p_reg_code, p_date)
     AND indus_one.admin_leave_flanking_working_marks_are_lwp(p_reg_code, p_date)
  THEN
    v_mark := 'LWP';
  END IF;

  INSERT INTO indus_one.admin_leave_attendance_marks (
    leave_request_id, employee_code, register_date, applied_mark,
    previous_mark, previous_mark_source, reverted
  ) VALUES (
    p_req.id, p_reg_code, p_date, v_mark,
    CASE WHEN v_row_exists THEN v_prev_mark ELSE NULL END,
    CASE WHEN v_row_exists THEN v_prev_source ELSE NULL END,
    false
  )
  ON CONFLICT (leave_request_id, register_date) DO UPDATE
  SET
    applied_mark = EXCLUDED.applied_mark,
    employee_code = EXCLUDED.employee_code,
    previous_mark = EXCLUDED.previous_mark,
    previous_mark_source = EXCLUDED.previous_mark_source,
    reverted = false;

  IF v_row_exists THEN
    UPDATE public.admin_attendance_register
    SET mark = v_mark, mark_source = 'leave', leave_request_id = p_req.id
    WHERE indus_one.leave_attendance_norm_code(employee_code)
            = indus_one.leave_attendance_norm_code(p_reg_code)
      AND register_date = p_date;
  ELSE
    BEGIN
      INSERT INTO public.admin_attendance_register (
        employee_code, register_date, mark, mark_source, leave_request_id
      ) VALUES (
        p_reg_code, p_date, v_mark, 'leave', p_req.id
      );
    EXCEPTION
      WHEN unique_violation THEN
        UPDATE public.admin_attendance_register
        SET mark = v_mark, mark_source = 'leave', leave_request_id = p_req.id
        WHERE indus_one.leave_attendance_norm_code(employee_code)
                = indus_one.leave_attendance_norm_code(p_reg_code)
          AND register_date = p_date
          AND (
            (
              upper(btrim(coalesce(mark, ''))) = 'WO'
              AND coalesce(lower(btrim(mark_source)), '') IN ('', 'auto_wo', 'auto')
            )
            OR (
              upper(btrim(coalesce(mark, ''))) IN ('NH/PH', 'NHPH')
              AND coalesce(lower(btrim(mark_source)), '') IN ('', 'auto_holiday', 'auto')
            )
            OR NOT indus_one.admin_leave_mark_is_manual(mark, mark_source)
          );
    END;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_write_register_mark(
  indus_one.admin_leave_requests, text, date, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- partial: stamp leftover sandwichable offs as LWP (beyond days quota)
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

  -- Sandwich NH/PH (or WO) included in working_dates but beyond days quota:
  -- must follow LWP sandwich policy, never remain/become paid leave.
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

-- ---------------------------------------------------------------------------
-- sufficient: all-LWP requests + LWP-flanked sandwich offs must not write PL
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
  v_paid numeric := coalesce(p_req.days, 0);
  v_type text;
  v_force_lwp boolean := false;
  v_day_mark text;
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

  -- Request already recorded as unpaid → never re-stamp paid leave (incl. sandwich NH/PH).
  IF coalesce(p_req.lwp_days, 0) > 0 AND coalesce(p_req.paid_leave_days, 0) <= 0 THEN
    v_force_lwp := true;
    v_mark := 'LWP';
    v_paid := 0;
  END IF;

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_reg_code)
  LOOP
    v_day_mark := v_mark;

    IF NOT v_is_half_day AND indus_one.admin_leave_date_punch_priority(v_reg_code, v_date) THEN
      IF v_type <> 'CO' THEN
        CONTINUE;
      END IF;
      v_day_mark := 'CO';
    ELSIF v_force_lwp THEN
      v_day_mark := 'LWP';
    ELSIF indus_one.admin_leave_date_is_sandwichable_off(v_reg_code, v_date)
      AND indus_one.admin_leave_flanking_working_marks_are_lwp(v_reg_code, v_date)
    THEN
      v_day_mark := 'LWP';
    END IF;

    PERFORM indus_one.admin_leave_write_register_mark(p_req, v_reg_code, v_date, v_day_mark);

    v_marks := v_marks || jsonb_build_array(jsonb_build_object(
      'date', v_date::text,
      'mark', v_day_mark,
      'paid_amount', CASE
        WHEN v_day_mark = 'LWP' THEN 0
        WHEN v_is_half_day THEN coalesce(p_req.days, 0.5)
        ELSE 1
      END
    ));
  END LOOP;

  IF upper(btrim(coalesce(p_req.leave_type_code, ''))) NOT IN ('PL', 'SL', 'CL') THEN
    v_paid := 0;
  ELSIF v_force_lwp THEN
    v_paid := 0;
  END IF;

  RETURN jsonb_build_object(
    'paid_leave_days', v_paid,
    'lwp_days', CASE WHEN v_force_lwp THEN jsonb_array_length(v_marks)::numeric ELSE 0 END,
    'applied_day_marks', v_marks
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

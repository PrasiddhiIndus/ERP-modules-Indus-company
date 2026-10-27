-- Paid leave sandwich: show Taken Leave (PL/CL/SL), not LWP; deduct balance.
--
-- Root cause (20261027170000 repair, if applied):
--   Re-calling admin_leave_apply_attendance on already-approved leaves uses the
--   *remaining* yearly unused balance. After the original deduction, unused is
--   often below the sandwich-inclusive day count → partial-LWP path → WO/NH-PH
--   (and sometimes weekdays) stamped LWP instead of PL/CL/SL. Balance top-up
--   then could not match Taken Leave on the register.
--
-- This migration (minimal, leave/attendance only):
--   1) write_register_mark: LWP-sandwich force only for unpaid / all-LWP requests
--   2) sufficient: same — do not force LWP on sandwich when the request is paid
--   3) Safe repair: for approved PL/SL/CL that are paid (paid_leave_days > 0 OR
--      ledger deduct > 0), re-stamp working_dates as leave type (not LWP),
--      refresh days/paid/lwp, top up balance for sandwich delta only.
--   4) True all-LWP requests (paid=0, lwp>0, no ledger deduct) unchanged.
--
-- Does not touch tours, punches, salary, recruitment, or site attendance.

-- ---------------------------------------------------------------------------
-- 1) write_register_mark: LWP force only when request is unpaid / all-LWP
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
  v_unpaid boolean :=
    coalesce(p_req.lwp_days, 0) > 0 AND coalesce(p_req.paid_leave_days, 0) <= 0;
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
       AND v_prev_src IN ('', 'auto_wo', 'auto', 'auto_weekoff', 'system')
    THEN
      v_can_apply := true;
    ELSIF v_prev_mark_u IN ('NH/PH', 'NHPH')
       AND v_prev_src IN ('', 'auto_holiday', 'auto', 'system')
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

  -- LWP | off | LWP → LWP only for unpaid / all-LWP requests.
  -- Paid Taken Leave (PL/CL/SL) must keep sandwich offs as leave, not LWP.
  IF v_unpaid
     AND indus_one.admin_leave_register_mark_is_paid_leave(v_mark)
     AND indus_one.admin_leave_date_is_lwp_sandwich_off(p_reg_code, p_date)
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
              AND coalesce(lower(btrim(mark_source)), '') IN ('', 'auto_wo', 'auto', 'auto_weekoff', 'system')
            )
            OR (
              upper(btrim(coalesce(mark, ''))) IN ('NH/PH', 'NHPH')
              AND coalesce(lower(btrim(mark_source)), '') IN ('', 'auto_holiday', 'auto', 'system')
            )
            OR upper(btrim(coalesce(mark, ''))) = 'LWP'
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
-- 2) sufficient: sandwich → LWP only when request is already all-LWP
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
      IF v_type <> 'CO' THEN
        CONTINUE;
      END IF;
      v_day_mark := 'CO';
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
      WHEN v_day_mark = 'LWP' THEN 0
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
      WHEN v_force_lwp THEN jsonb_array_length(v_marks)::numeric
      ELSE greatest(jsonb_array_length(v_marks)::numeric - v_paid, 0)
    END,
    'applied_day_marks', v_marks
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Safe repair: paid approved leaves → Taken Leave marks + balance top-up
-- ---------------------------------------------------------------------------
DO $repair_paid_sandwich_not_lwp$
DECLARE
  v_req indus_one.admin_leave_requests%ROWTYPE;
  v_reg_code text;
  v_code text;
  v_type text;
  v_date date;
  v_new numeric;
  v_applied numeric;
  v_delta numeric;
  v_year integer;
  v_unused numeric;
  v_ledger numeric;
  v_count integer := 0;
  v_topped integer := 0;
  v_from date := (current_date - interval '18 months')::date;
  v_to date := (current_date + interval '12 months')::date;
  v_marks jsonb;
BEGIN
  FOR v_req IN
    SELECT r.*
    FROM indus_one.admin_leave_requests r
    WHERE indus_one.admin_leave_request_is_approved(r.status, r.overall_status)
      AND upper(btrim(coalesce(r.leave_type_code, ''))) IN ('PL', 'SL', 'CL')
      AND r.to_date >= v_from
      AND r.from_date <= v_to
      AND r.from_date IS NOT NULL
      AND r.to_date IS NOT NULL
      AND r.to_date >= r.from_date
      AND NOT indus_one.admin_leave_is_half_day(r.days)
      AND EXISTS (
        SELECT 1
        FROM generate_series(r.from_date, r.to_date, interval '1 day') AS g(d)
        WHERE indus_one.admin_leave_date_is_sandwichable_off(r.employee_code, g.d::date)
          AND g.d::date > r.from_date
          AND g.d::date < r.to_date
      )
    ORDER BY r.from_date, r.employee_code
  LOOP
    SELECT coalesce(-sum(l.delta_days), 0)
    INTO v_ledger
    FROM indus_one.admin_leave_balance_ledger l
    WHERE l.leave_request_id = v_req.id
      AND l.entry_type = 'deduct';

    -- True all-LWP (never deducted paid balance): leave alone.
    IF coalesce(v_req.paid_leave_days, 0) <= 0
       AND coalesce(v_req.lwp_days, 0) > 0
       AND coalesce(v_ledger, 0) <= 0
    THEN
      CONTINUE;
    END IF;

    -- Paid / Taken Leave (has paid days or ledger deduct): restore leave marks.
    IF coalesce(v_req.paid_leave_days, 0) <= 0 AND coalesce(v_ledger, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_reg_code := indus_one.admin_leave_validate_request_employee(v_req);
    IF v_reg_code IS NULL THEN
      CONTINUE;
    END IF;

    v_code := upper(btrim(v_req.leave_type_code));
    v_type := upper(btrim(indus_one.admin_leave_primary_attendance_mark(v_req.leave_type_code)));
    v_marks := '[]'::jsonb;

    -- Ensure request looks paid so write_register_mark will not force LWP.
    IF coalesce(v_req.paid_leave_days, 0) <= 0 THEN
      v_req.paid_leave_days := greatest(v_ledger, 1);
      v_req.lwp_days := 0;
    END IF;

    FOR v_date IN
      SELECT *
      FROM indus_one.admin_leave_working_dates(v_req.from_date, v_req.to_date, v_reg_code)
      ORDER BY 1
    LOOP
      IF indus_one.admin_leave_date_punch_priority(v_reg_code, v_date) THEN
        CONTINUE;
      END IF;

      PERFORM indus_one.admin_leave_write_register_mark(v_req, v_reg_code, v_date, v_type);

      v_marks := v_marks || jsonb_build_array(jsonb_build_object(
        'date', v_date::text,
        'mark', v_type,
        'paid_amount', 1
      ));
    END LOOP;

    v_new := indus_one.admin_leave_deductible_days(v_req);

    UPDATE indus_one.admin_leave_requests
    SET
      days = CASE
        WHEN v_new > 0 THEN v_new
        ELSE days
      END,
      paid_leave_days = CASE WHEN v_new > 0 THEN v_new ELSE paid_leave_days END,
      lwp_days = 0,
      applied_day_marks = v_marks,
      updated_at = now()
    WHERE id = v_req.id;

    UPDATE indus_one.leave_requests lr
    SET days = CASE WHEN v_new > 0 THEN v_new ELSE lr.days END,
        updated_at = now()
    WHERE lr.id = v_req.id
      AND v_new > 0
      AND coalesce(lr.days, 0) IS DISTINCT FROM v_new;

    v_count := v_count + 1;

    v_applied := v_ledger;
    v_delta := v_new - v_applied;
    IF v_delta IS NULL OR v_delta <= 0 THEN
      CONTINUE;
    END IF;

    v_year := extract(year FROM v_req.from_date)::integer;

    IF NOT EXISTS (
      SELECT 1 FROM indus_one.employee_leave_balances_yearly y
      WHERE public.norm_emp_code(y.employee_code) = public.norm_emp_code(v_reg_code)
        AND y.year = v_year
    ) THEN
      CONTINUE;
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

    IF v_unused < v_delta THEN
      RAISE NOTICE 'paid sandwich repair % (%→%): need % but unused=% — marks restored, balance not topped',
        v_req.employee_code, v_req.from_date, v_req.to_date, v_delta, v_unused;
      CONTINUE;
    END IF;

    IF v_code = 'PL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET used_pl = used_pl + v_delta, unused_pl = unused_pl - v_delta, processed_at = now()
      WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
    ELSIF v_code = 'SL' THEN
      UPDATE indus_one.employee_leave_balances_yearly
      SET used_sl = used_sl + v_delta, unused_sl = unused_sl - v_delta, processed_at = now()
      WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
    ELSE
      UPDATE indus_one.employee_leave_balances_yearly
      SET used_cl = used_cl + v_delta, unused_cl = unused_cl - v_delta, processed_at = now()
      WHERE public.norm_emp_code(employee_code) = public.norm_emp_code(v_reg_code) AND year = v_year;
    END IF;

    INSERT INTO indus_one.admin_leave_balance_ledger (
      leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
    ) VALUES (
      v_req.id, v_reg_code, v_year, v_code, -v_delta, 'deduct',
      'Sandwich WO/NH-PH top-up — Taken Leave balance for offs between leave'
    );

    v_topped := v_topped + 1;
  END LOOP;

  RAISE NOTICE 'paid sandwich repair: restored % leave request(s), balance topped on %',
    v_count, v_topped;
END $repair_paid_sandwich_not_lwp$;

NOTIFY pgrst, 'reload schema';

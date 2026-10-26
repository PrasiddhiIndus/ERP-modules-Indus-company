-- Sandwich WO + NH/PH between full-day leave / LWP (user policy).
--
-- Prior policy (20260731120000 / 20261016120000): NH/PH was never sandwiched.
-- Required behavior: if WO or NH/PH falls strictly between continuous leave
-- working days (or completes an adjacent leave sandwich), convert those days
-- to the leave mark (PL/SL/CL or LWP when balance is exhausted).
--
-- Also: detect NH/PH from the holiday calendar (not only register mark), so a
-- day wrongly stamped PL still sandwiches correctly.
--
-- Data repair: emp 5616 only — re-apply partial LWP so sandwiched holiday days
-- are LWP (not PL). Emp 6385 and others are not modified.
--
-- Unchanged: half-day flanking still blocks sandwich; manual WO / manual NH/PH
-- stay protected; punch-priority / balance ledger paths otherwise unchanged.

-- ---------------------------------------------------------------------------
-- 1) NH/PH detector: register mark OR calendar holiday (holidays apply)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_is_nhph(
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
  SELECT p_date IS NOT NULL
    AND nullif(btrim(p_employee_code), '') IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.admin_attendance_register r
        WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
          AND r.register_date = p_date
          AND upper(btrim(r.mark)) IN ('NH/PH', 'NHPH')
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.admin_national_public_holidays h
          WHERE h.holiday_date = p_date
            AND h.holiday_type IN ('NH', 'PH')
        )
        AND public.admin_rule_holidays_apply(p_employee_code, p_date)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_nhph(text, date) TO authenticated;

-- True when the day is sandwichable non-working (WO or NH/PH).
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_is_sandwichable_off(
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
  SELECT indus_one.admin_leave_date_is_week_off(p_employee_code, p_date)
      OR indus_one.admin_leave_date_is_nhph(p_employee_code, p_date);
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_sandwichable_off(text, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) working_dates: sandwich WO and NH/PH between full-day leave anchors
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_working_dates(
  p_from date,
  p_to date,
  p_employee_code text DEFAULT NULL
)
RETURNS SETOF date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_emp text := nullif(btrim(p_employee_code), '');
  v_d date;
  v_amin date;
  v_amax date;
  v_cursor date;
  v_dates date[] := ARRAY[]::date[];
  v_from_is_anchor boolean;
  v_to_is_anchor boolean;
  v_guard integer;
  v_anchors_half boolean := false;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN;
  END IF;

  -- Leave working anchors: exclude WO and NH/PH
  SELECT min(x.d), max(x.d)
  INTO v_amin, v_amax
  FROM (
    SELECT g.d::date AS d
    FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
    WHERE NOT indus_one.admin_leave_date_is_sandwichable_off(v_emp, g.d::date)
  ) x;

  IF v_emp IS NOT NULL AND v_amin IS NOT NULL THEN
    v_anchors_half :=
      indus_one.admin_leave_date_is_half_day_leave(v_emp, v_amin)
      OR indus_one.admin_leave_date_is_half_day_leave(v_emp, v_amax);
  END IF;

  FOR v_d IN
    SELECT g.d::date
    FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
  LOOP
    IF NOT indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_d) THEN
      v_dates := array_append(v_dates, v_d);
    ELSIF v_amin IS NOT NULL
          AND v_d > v_amin
          AND v_d < v_amax
          AND NOT v_anchors_half THEN
      -- Within-request sandwich: WO or NH/PH between full-day leave anchors
      v_dates := array_append(v_dates, v_d);
    END IF;
  END LOOP;

  IF v_emp IS NULL THEN
    RETURN QUERY SELECT DISTINCT u FROM unnest(v_dates) AS u ORDER BY 1;
    RETURN;
  END IF;

  v_from_is_anchor :=
    NOT indus_one.admin_leave_date_is_sandwichable_off(v_emp, p_from)
    AND NOT indus_one.admin_leave_date_is_half_day_leave(v_emp, p_from);
  v_to_is_anchor :=
    NOT indus_one.admin_leave_date_is_sandwichable_off(v_emp, p_to)
    AND NOT indus_one.admin_leave_date_is_half_day_leave(v_emp, p_to);

  -- Adjacent sandwich before from_date: … Leave | WO/NHPH… | Leave(from)
  IF v_from_is_anchor THEN
    v_cursor := p_from - 1;
    v_guard := 0;
    WHILE v_guard < 14
      AND indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_cursor)
    LOOP
      v_cursor := v_cursor - 1;
      v_guard := v_guard + 1;
    END LOOP;
    IF v_guard > 0 AND v_guard < 14
       AND indus_one.admin_leave_date_has_adjacent_leave(v_emp, v_cursor)
       AND NOT indus_one.admin_leave_date_is_half_day_leave(v_emp, v_cursor)
    THEN
      v_d := v_cursor + 1;
      WHILE v_d < p_from LOOP
        IF indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_d) THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
        v_d := v_d + 1;
      END LOOP;
    END IF;
  END IF;

  -- Adjacent sandwich after to_date: Leave(to) | WO/NHPH… | Leave …
  IF v_to_is_anchor THEN
    v_cursor := p_to + 1;
    v_guard := 0;
    WHILE v_guard < 14
      AND indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_cursor)
    LOOP
      v_cursor := v_cursor + 1;
      v_guard := v_guard + 1;
    END LOOP;
    IF v_guard > 0 AND v_guard < 14
       AND indus_one.admin_leave_date_has_adjacent_leave(v_emp, v_cursor)
       AND NOT indus_one.admin_leave_date_is_half_day_leave(v_emp, v_cursor)
    THEN
      v_d := p_to + 1;
      WHILE v_d < v_cursor LOOP
        IF indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_d) THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
        v_d := v_d + 1;
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY SELECT DISTINCT u FROM unnest(v_dates) AS u ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_working_dates(date, date, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) write_register_mark: allow auto WO and auto NH/PH → leave (sandwich)
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
    -- Sandwich: convert auto / unmarked WO or NH/PH to leave
    -- (manual WO / manual NH/PH stay protected via mark_is_manual)
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

  INSERT INTO indus_one.admin_leave_attendance_marks (
    leave_request_id, employee_code, register_date, applied_mark,
    previous_mark, previous_mark_source, reverted
  ) VALUES (
    p_req.id, p_reg_code, p_date, p_mark,
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
    SET mark = p_mark, mark_source = 'leave', leave_request_id = p_req.id
    WHERE indus_one.leave_attendance_norm_code(employee_code)
            = indus_one.leave_attendance_norm_code(p_reg_code)
      AND register_date = p_date;
  ELSE
    BEGIN
      INSERT INTO public.admin_attendance_register (
        employee_code, register_date, mark, mark_source, leave_request_id
      ) VALUES (
        p_reg_code, p_date, p_mark, 'leave', p_req.id
      );
    EXCEPTION
      WHEN unique_violation THEN
        UPDATE public.admin_attendance_register
        SET mark = p_mark, mark_source = 'leave', leave_request_id = p_req.id
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
-- 4) Emp 5616 only: re-stamp sandwiched holidays as LWP (zero paid balance)
-- ---------------------------------------------------------------------------
DO $fix_5616_sandwich_lwp$
DECLARE
  v_req indus_one.admin_leave_requests%ROWTYPE;
  v_result jsonb;
  v_paid numeric;
BEGIN
  SELECT * INTO v_req
  FROM indus_one.admin_leave_requests r
  WHERE r.id = '377f1484-940b-4637-8418-ae2061fe7b56'::uuid
    AND public.norm_emp_code(r.employee_code) = public.norm_emp_code('5616')
    AND indus_one.admin_leave_request_is_approved(r.status, r.overall_status);

  IF NOT FOUND THEN
    RAISE NOTICE '5616 sandwich LWP fix: request not found / not approved — skipped';
    RETURN;
  END IF;

  -- Keep paid allocation from approval (0); sandwich NH/PH days become LWP.
  v_paid := coalesce(v_req.paid_leave_days, 0);
  v_result := indus_one.admin_leave_apply_attendance_partial(v_req, v_paid);

  UPDATE indus_one.admin_leave_requests
  SET
    paid_leave_days = (v_result ->> 'paid_leave_days')::numeric,
    lwp_days = (v_result ->> 'lwp_days')::numeric,
    applied_day_marks = coalesce(v_result -> 'applied_day_marks', '[]'::jsonb),
    updated_at = now()
  WHERE id = v_req.id;

  RAISE NOTICE '5616 sandwich LWP fix: paid=%, lwp=%, marks=%',
    v_result ->> 'paid_leave_days',
    v_result ->> 'lwp_days',
    jsonb_array_length(coalesce(v_result -> 'applied_day_marks', '[]'::jsonb));
END $fix_5616_sandwich_lwp$;

NOTIFY pgrst, 'reload schema';

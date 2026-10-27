-- Repair + harden: PL/CL/SL left on NH/PH (or WO) between consecutive LWP.
--
-- Why 20261027120000 alone was not enough:
--   1) It only changes apply paths — existing register rows (e.g. FTC-13 on
--      2026-10-20) stay PL until rewritten.
--   2) admin_leave_date_is_sandwichable_off uses register NH/PH mark OR
--      (calendar holiday AND holidays_apply). Once leave stamped PL, the
--      register no longer looks like NH/PH; if holidays_apply is false for
--      that employee, sandwichable_off is false and the LWP override never runs.
--
-- This migration:
--   * Detects LWP-sandwich offs via calendar NH/PH or week-off (no holidays_apply
--     gate) when flanking working marks are both LWP.
--   * Repairs orphan paid-leave register rows matching that pattern → LWP.
--   * Keeps prior apply-path guards; does not change paid PL-between-PL sandwich.

-- ---------------------------------------------------------------------------
-- 1) Calendar NH/PH (no holidays_apply gate) + LWP-sandwich off detector
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_is_calendar_nhph(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
  SELECT p_date IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_national_public_holidays h
      WHERE h.holiday_date = p_date
        AND h.holiday_type IN ('NH', 'PH')
    );
$$;

-- Off day for LWP sandwich purposes: week-off, calendar NH/PH, or register NH/PH.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_is_lwp_sandwich_off(
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
      indus_one.admin_leave_date_is_week_off(p_employee_code, p_date)
      OR indus_one.admin_leave_date_is_calendar_nhph(p_date)
      OR EXISTS (
        SELECT 1
        FROM public.admin_attendance_register r
        WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
          AND r.register_date = p_date
          AND upper(btrim(r.mark)) IN ('NH/PH', 'NHPH', 'WO')
      )
    );
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_calendar_nhph(date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_lwp_sandwich_off(text, date)
  TO authenticated, service_role;

-- Include calendar NH/PH in sandwichable offs even when holidays_apply is false,
-- so a day stamped PL on a public holiday still sandwiches between leave/LWP.
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
      OR indus_one.admin_leave_date_is_nhph(p_employee_code, p_date)
      OR indus_one.admin_leave_date_is_calendar_nhph(p_date);
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_sandwichable_off(text, date)
  TO authenticated, service_role;

-- Flanking walk must skip calendar NH/PH even when the cell is already PL.
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

    IF indus_one.admin_leave_date_is_lwp_sandwich_off(v_emp, v_cursor) THEN
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

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_flanking_working_mark(text, date, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) write_register_mark — use LWP-sandwich off (calendar NH/PH, not only apply gate)
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

  -- LWP | (NH/PH or WO) | LWP → must be LWP (even if cell was already stamped PL)
  IF indus_one.admin_leave_register_mark_is_paid_leave(v_mark)
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
-- 3) Data repair — orphan PL/CL/SL on LWP-sandwiched off days → LWP
-- ---------------------------------------------------------------------------
DO $repair_lwp_sandwich_orphan_pl$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH victims AS (
    SELECT r.ctid AS rid, r.employee_code, r.register_date, r.leave_request_id
    FROM public.admin_attendance_register r
    WHERE indus_one.admin_leave_register_mark_is_paid_leave(r.mark)
      AND indus_one.admin_leave_date_is_lwp_sandwich_off(r.employee_code, r.register_date)
      AND indus_one.admin_leave_flanking_working_marks_are_lwp(r.employee_code, r.register_date)
  ),
  upd AS (
    UPDATE public.admin_attendance_register r
    SET
      mark = 'LWP',
      updated_at = now()
    FROM victims v
    WHERE r.ctid = v.rid
    RETURNING r.employee_code, r.register_date, r.leave_request_id
  )
  SELECT count(*)::integer INTO v_updated FROM upd;

  -- Keep leave attendance audit marks in sync when linked
  UPDATE indus_one.admin_leave_attendance_marks m
  SET applied_mark = 'LWP'
  FROM public.admin_attendance_register r
  WHERE m.leave_request_id = r.leave_request_id
    AND m.register_date = r.register_date
    AND public.norm_emp_code(m.employee_code) = public.norm_emp_code(r.employee_code)
    AND upper(btrim(r.mark)) = 'LWP'
    AND indus_one.admin_leave_register_mark_is_paid_leave(m.applied_mark)
    AND indus_one.admin_leave_date_is_lwp_sandwich_off(r.employee_code, r.register_date)
    AND indus_one.admin_leave_flanking_working_marks_are_lwp(r.employee_code, r.register_date);

  RAISE NOTICE 'LWP sandwich orphan PL repair: % register row(s) → LWP', v_updated;
END
$repair_lwp_sandwich_orphan_pl$;

NOTIFY pgrst, 'reload schema';

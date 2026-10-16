-- =============================================================================
-- Sandwich leave: do not convert a week-off when either flanking leave working
-- day is a half-day leave (days = 0.5, or register P/PL · P/CL · P/SL · HD).
--
-- Needs 20260731120000_admin_leave_sandwich_weekoff.sql.
-- Rollback: supabase/rollbacks/20261016120000_admin_leave_sandwich_skip_half_day_down.sql
--
-- Example that must NOT sandwich Sunday:
--   Saturday full leave | Sunday WO | Monday half-day leave
-- Sunday stays WO; balance is not deducted for Sunday.
--
-- Unchanged: full-day leave on both sides (within-request and adjacent),
-- NH/PH never sandwiched, manual WO still protected on apply.
-- This migration does not rewrite existing register rows or ledger entries.
-- =============================================================================

-- True when the working day is (or will be) a half-day leave for sandwich checks.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_is_half_day_leave(
  p_employee_code text,
  p_date date,
  p_exclude_request_id uuid DEFAULT NULL
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
    AND NOT indus_one.admin_leave_date_is_week_off(p_employee_code, p_date)
    AND NOT indus_one.admin_leave_date_is_nhph(p_employee_code, p_date)
    AND (
      EXISTS (
        SELECT 1
        FROM public.admin_attendance_register r
        WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
          AND r.register_date = p_date
          AND upper(btrim(r.mark)) IN ('P/SL', 'P/CL', 'P/PL', 'HD')
          AND (p_exclude_request_id IS NULL OR r.leave_request_id IS DISTINCT FROM p_exclude_request_id)
      )
      OR EXISTS (
        SELECT 1
        FROM indus_one.admin_leave_requests r
        WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
          AND indus_one.admin_leave_request_is_approved(r.status, r.overall_status)
          AND p_date BETWEEN r.from_date AND r.to_date
          AND coalesce(r.days, 0) = 0.5
          AND (p_exclude_request_id IS NULL OR r.id IS DISTINCT FROM p_exclude_request_id)
      )
    );
$$;

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

  SELECT min(x.d), max(x.d)
  INTO v_amin, v_amax
  FROM (
    SELECT g.d::date AS d
    FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
    WHERE NOT indus_one.admin_leave_date_is_week_off(v_emp, g.d::date)
      AND NOT indus_one.admin_leave_date_is_nhph(v_emp, g.d::date)
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
    IF NOT indus_one.admin_leave_date_is_week_off(v_emp, v_d)
       AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d) THEN
      v_dates := array_append(v_dates, v_d);
    ELSIF indus_one.admin_leave_date_is_week_off(v_emp, v_d)
          AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d)
          AND v_amin IS NOT NULL
          AND v_d > v_amin
          AND v_d < v_amax
          AND NOT v_anchors_half THEN
      -- Within-request sandwich only when both leave working anchors are full-day.
      v_dates := array_append(v_dates, v_d);
    END IF;
  END LOOP;

  IF v_emp IS NULL THEN
    RETURN QUERY SELECT DISTINCT u FROM unnest(v_dates) AS u ORDER BY 1;
    RETURN;
  END IF;

  v_from_is_anchor :=
    NOT indus_one.admin_leave_date_is_week_off(v_emp, p_from)
    AND NOT indus_one.admin_leave_date_is_nhph(v_emp, p_from)
    AND NOT indus_one.admin_leave_date_is_half_day_leave(v_emp, p_from);
  v_to_is_anchor :=
    NOT indus_one.admin_leave_date_is_week_off(v_emp, p_to)
    AND NOT indus_one.admin_leave_date_is_nhph(v_emp, p_to)
    AND NOT indus_one.admin_leave_date_is_half_day_leave(v_emp, p_to);

  -- Adjacent sandwich before from_date: … Leave | WO…WO | Leave(from)
  -- Skipped when from_date or the far leave day is half-day.
  IF v_from_is_anchor THEN
    v_cursor := p_from - 1;
    v_guard := 0;
    WHILE v_guard < 14
      AND indus_one.admin_leave_date_is_week_off(v_emp, v_cursor)
      AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_cursor)
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
        IF indus_one.admin_leave_date_is_week_off(v_emp, v_d)
           AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d) THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
        v_d := v_d + 1;
      END LOOP;
    END IF;
  END IF;

  -- Adjacent sandwich after to_date: Leave(to) | WO…WO | Leave …
  IF v_to_is_anchor THEN
    v_cursor := p_to + 1;
    v_guard := 0;
    WHILE v_guard < 14
      AND indus_one.admin_leave_date_is_week_off(v_emp, v_cursor)
      AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_cursor)
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
        IF indus_one.admin_leave_date_is_week_off(v_emp, v_d)
           AND NOT indus_one.admin_leave_date_is_nhph(v_emp, v_d) THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
        v_d := v_d + 1;
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY SELECT DISTINCT u FROM unnest(v_dates) AS u ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_half_day_leave(text, date, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_working_dates(date, date, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

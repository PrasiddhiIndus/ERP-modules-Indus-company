-- Sandwich WO: do not convert week-off to leave when either flanking working day
-- is half-day / P/PL|P/SL|P/CL / machine punch / P(OD) (incl. P(OD)+P).
--
-- DATA SAFETY:
--   * Function body updates only (working_dates sandwich gate).
--   * October 2026 repair: restore incorrectly sandwiched WO cells + balance credit.
--   * NH/PH sandwich, LWP sandwich, paid-leave paths otherwise unchanged.
--   * No payroll / unrelated leave logic changes.

-- ---------------------------------------------------------------------------
-- 1) Flanking day blocks WO sandwich?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_blocks_wo_sandwich(
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
  SELECT CASE
    WHEN p_date IS NULL OR nullif(btrim(p_employee_code), '') IS NULL THEN false
    ELSE (
      -- Existing half-day leave rule (P/PL · P/CL · P/SL · HD · days=0.5)
      indus_one.admin_leave_date_is_half_day_leave(
        p_employee_code, p_date, p_exclude_request_id
      )
      -- Machine punch (raw punches or punch-sourced register Present)
      OR indus_one.admin_leave_date_punch_priority(p_employee_code, p_date)
      -- P(OD) — covers P(OD)+P; block WO sandwich (tour T unchanged elsewhere)
      OR EXISTS (
        SELECT 1
        FROM public.admin_attendance_register r
        WHERE public.norm_emp_code(r.employee_code)
            = public.norm_emp_code(p_employee_code)
          AND r.register_date = p_date
          AND upper(btrim(r.mark)) = 'P(OD)'
          AND (
            p_exclude_request_id IS NULL
            OR r.leave_request_id IS DISTINCT FROM p_exclude_request_id
          )
      )
    )
  END;
$$;

COMMENT ON FUNCTION indus_one.admin_leave_date_blocks_wo_sandwich(text, date, uuid) IS
  'True when a flanking working day must block sandwiching a week-off (half-day, P/PL|P/SL|P/CL, punch, or P(OD)).';

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_blocks_wo_sandwich(text, date, uuid)
  TO authenticated, service_role;

-- Nearest non-sandwichable-off working date (for repair flank checks).
CREATE OR REPLACE FUNCTION indus_one.admin_leave_flanking_working_date(
  p_employee_code text,
  p_date date,
  p_direction integer
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_emp text := nullif(btrim(p_employee_code), '');
  v_cursor date;
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

    RETURN v_cursor;
  END LOOP;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_flanking_working_date(text, date, integer)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) working_dates: WO sandwich uses the expanded blocker; NH/PH keeps half-day only
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
  v_anchors_block_wo boolean := false;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN;
  END IF;

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
    v_anchors_block_wo :=
      indus_one.admin_leave_date_blocks_wo_sandwich(v_emp, v_amin)
      OR indus_one.admin_leave_date_blocks_wo_sandwich(v_emp, v_amax);
  END IF;

  FOR v_d IN
    SELECT g.d::date
    FROM generate_series(p_from, p_to, interval '1 day') AS g(d)
  LOOP
    IF NOT indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_d) THEN
      v_dates := array_append(v_dates, v_d);
    ELSIF v_amin IS NOT NULL
          AND v_d > v_amin
          AND v_d < v_amax THEN
      IF indus_one.admin_leave_date_is_week_off(v_emp, v_d) THEN
        -- WO sandwich: blocked by half-day / P/* / punch / P(OD) on either flank
        IF NOT v_anchors_block_wo THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
      ELSE
        -- NH/PH sandwich: unchanged (half-day flanks only)
        IF NOT v_anchors_half THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
      END IF;
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

  -- Adjacent sandwich before from_date
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
        IF indus_one.admin_leave_date_is_week_off(v_emp, v_d) THEN
          IF NOT (
            indus_one.admin_leave_date_blocks_wo_sandwich(v_emp, p_from)
            OR indus_one.admin_leave_date_blocks_wo_sandwich(v_emp, v_cursor)
          ) THEN
            v_dates := array_append(v_dates, v_d);
          END IF;
        ELSIF indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_d) THEN
          v_dates := array_append(v_dates, v_d);
        END IF;
        v_d := v_d + 1;
      END LOOP;
    END IF;
  END IF;

  -- Adjacent sandwich after to_date
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
        IF indus_one.admin_leave_date_is_week_off(v_emp, v_d) THEN
          IF NOT (
            indus_one.admin_leave_date_blocks_wo_sandwich(v_emp, p_to)
            OR indus_one.admin_leave_date_blocks_wo_sandwich(v_emp, v_cursor)
          ) THEN
            v_dates := array_append(v_dates, v_d);
          END IF;
        ELSIF indus_one.admin_leave_date_is_sandwichable_off(v_emp, v_d) THEN
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
-- 3) October 2026 only: undo WO sandwich when flanks block
-- ---------------------------------------------------------------------------
DO $repair_oct2026_wo_sandwich_blockers$
DECLARE
  v_from date := DATE '2026-10-01';
  v_to date := DATE '2026-10-31';
  v_row record;
  v_prev text;
  v_prev_src text;
  v_leave_id uuid;
  v_type text;
  v_code text;
  v_year integer := 2026;
  v_restored_reg integer := 0;
  v_restored_bal integer := 0;
BEGIN
  FOR v_row IN
    SELECT
      r.ctid AS rid,
      r.employee_code,
      r.register_date,
      r.mark,
      r.mark_source,
      r.leave_request_id,
      r.month_key
    FROM public.admin_attendance_register r
    WHERE r.register_date BETWEEN v_from AND v_to
      AND indus_one.admin_leave_date_is_week_off(r.employee_code, r.register_date)
      AND upper(btrim(coalesce(r.mark, ''))) IN (
        'PL', 'CL', 'SL', 'LWP', 'L', 'P/PL', 'P/CL', 'P/SL',
        'LWP/PL', 'LWP/CL', 'LWP/SL'
      )
      AND (
        coalesce(lower(btrim(r.mark_source)), '') IN ('leave', '')
        OR r.leave_request_id IS NOT NULL
      )
      AND (
        indus_one.admin_leave_date_blocks_wo_sandwich(
          r.employee_code,
          indus_one.admin_leave_flanking_working_date(r.employee_code, r.register_date, -1)
        )
        OR indus_one.admin_leave_date_blocks_wo_sandwich(
          r.employee_code,
          indus_one.admin_leave_flanking_working_date(r.employee_code, r.register_date, 1)
        )
      )
  LOOP
    -- Prefer prior mark from leave attendance audit when it was WO / NH/PH
    SELECT m.previous_mark, m.previous_mark_source
    INTO v_prev, v_prev_src
    FROM indus_one.admin_leave_attendance_marks m
    WHERE m.leave_request_id IS NOT DISTINCT FROM v_row.leave_request_id
      AND m.register_date = v_row.register_date
      AND public.norm_emp_code(m.employee_code) = public.norm_emp_code(v_row.employee_code)
      AND coalesce(m.reverted, false) = false
    ORDER BY m.id DESC
    LIMIT 1;

    IF upper(btrim(coalesce(v_prev, ''))) NOT IN ('WO', 'NH/PH', 'NHPH') THEN
      v_prev := 'WO';
      v_prev_src := 'auto_wo';
    END IF;
    IF coalesce(lower(btrim(v_prev_src)), '') = '' THEN
      v_prev_src := 'auto_wo';
    END IF;

    UPDATE public.admin_attendance_register r
    SET
      mark = CASE WHEN upper(btrim(v_prev)) IN ('NHPH', 'NH/PH') THEN 'NH/PH' ELSE 'WO' END,
      mark_source = v_prev_src,
      leave_request_id = NULL,
      updated_at = now()
    WHERE r.ctid = v_row.rid;

    v_restored_reg := v_restored_reg + 1;

    -- Revert leave attendance audit row for this sandwich day
    UPDATE indus_one.admin_leave_attendance_marks m
    SET reverted = true
    WHERE m.register_date = v_row.register_date
      AND public.norm_emp_code(m.employee_code) = public.norm_emp_code(v_row.employee_code)
      AND coalesce(m.reverted, false) = false
      AND (
        m.leave_request_id IS NOT DISTINCT FROM v_row.leave_request_id
        OR v_row.leave_request_id IS NULL
      );

    -- Credit paid leave balance for this incorrectly sandwiched WO (not LWP/L)
    v_leave_id := v_row.leave_request_id;
    v_type := upper(btrim(coalesce(v_row.mark, '')));
    IF v_leave_id IS NOT NULL AND v_type IN ('PL', 'CL', 'SL', 'P/PL', 'P/CL', 'P/SL') THEN
      v_code := CASE
        WHEN v_type IN ('PL', 'P/PL', 'LWP/PL') THEN 'PL'
        WHEN v_type IN ('SL', 'P/SL', 'LWP/SL') THEN 'SL'
        ELSE 'CL'
      END;

      IF v_code = 'PL' THEN
        UPDATE indus_one.employee_leave_balances_yearly y
        SET
          used_pl = greatest(coalesce(used_pl, 0) - 1, 0),
          unused_pl = coalesce(unused_pl, 0) + 1,
          processed_at = now()
        WHERE public.norm_emp_code(y.employee_code)
            = public.norm_emp_code(v_row.employee_code)
          AND y.year = v_year;
      ELSIF v_code = 'SL' THEN
        UPDATE indus_one.employee_leave_balances_yearly y
        SET
          used_sl = greatest(coalesce(used_sl, 0) - 1, 0),
          unused_sl = coalesce(unused_sl, 0) + 1,
          processed_at = now()
        WHERE public.norm_emp_code(y.employee_code)
            = public.norm_emp_code(v_row.employee_code)
          AND y.year = v_year;
      ELSE
        UPDATE indus_one.employee_leave_balances_yearly y
        SET
          used_cl = greatest(coalesce(used_cl, 0) - 1, 0),
          unused_cl = coalesce(unused_cl, 0) + 1,
          processed_at = now()
        WHERE public.norm_emp_code(y.employee_code)
            = public.norm_emp_code(v_row.employee_code)
          AND y.year = v_year;
      END IF;

      INSERT INTO indus_one.admin_leave_balance_ledger (
        leave_request_id, employee_code, year, leave_type_code, delta_days, entry_type, note
      ) VALUES (
        v_leave_id,
        v_row.employee_code,
        v_year,
        v_code,
        1,
        'restore',
        'Oct 2026 repair: undo WO sandwich — flanking half-day/punch/P(OD)/P/*'
      );

      UPDATE indus_one.admin_leave_requests r
      SET
        days = CASE
          WHEN coalesce(days, 0) > 0.5 THEN days - 1
          ELSE days
        END,
        paid_leave_days = CASE
          WHEN coalesce(paid_leave_days, 0) > 0 THEN paid_leave_days - 1
          ELSE paid_leave_days
        END,
        applied_day_marks = CASE
          WHEN applied_day_marks IS NULL THEN applied_day_marks
          ELSE coalesce((
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(applied_day_marks) elem
            WHERE coalesce(elem->>'date', '')
                  IS DISTINCT FROM v_row.register_date::text
          ), '[]'::jsonb)
        END,
        updated_at = now()
      WHERE r.id = v_leave_id;

      UPDATE indus_one.leave_requests lr
      SET
        days = CASE
          WHEN coalesce(lr.days, 0) > 0.5 THEN lr.days - 1
          ELSE lr.days
        END,
        updated_at = now()
      WHERE lr.id = v_leave_id;

      v_restored_bal := v_restored_bal + 1;
    END IF;
  END LOOP;

  RAISE NOTICE
    'Oct 2026 WO sandwich repair: % register cell(s) restored to WO, % balance credit(s)',
    v_restored_reg, v_restored_bal;
END
$repair_oct2026_wo_sandwich_blockers$;

NOTIFY pgrst, 'reload schema';

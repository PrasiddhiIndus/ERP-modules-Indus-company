-- Week-Off sandwich leave policy
-- ---------------------------------------------------------------------------
-- If a Week Off (WO / Sunday auto-WO) falls strictly between continuous leave
-- working days on an approved leave request, treat those WO days as leave:
--   • mark them on the Daily Attendance Register (same leave mark as the request)
--   • include them in deductible leave duration / balance deduction
--
-- Also covers adjacent approved leave blocks (e.g. Fri leave + Mon leave →
-- Sat/Sun WO converted when the sandwich completes).
-- NH/PH holidays are NOT converted (WO-only policy).
-- ---------------------------------------------------------------------------

-- Ensure columns / helpers exist when earlier leave migrations were not applied.
ALTER TABLE indus_one.admin_leave_requests
  ADD COLUMN IF NOT EXISTS overall_status text;

UPDATE indus_one.admin_leave_requests
SET overall_status = status
WHERE overall_status IS NULL;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_effective_status(
  p_status text,
  p_overall_status text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(
    nullif(btrim(p_overall_status), ''),
    nullif(btrim(p_status), '')
  )));
$$;

-- Prefer text-args helper: composite-row overloads are often missing / hard to resolve in SQL.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_request_is_approved(
  p_status text,
  p_overall_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT indus_one.admin_leave_effective_status(p_status, p_overall_status) = 'approved';
$$;

DO $ensure_fully_approved$
BEGIN
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION indus_one.admin_leave_is_fully_approved(p_req indus_one.admin_leave_requests)
    RETURNS boolean
    LANGUAGE sql
    IMMUTABLE
    AS $body$
      SELECT indus_one.admin_leave_request_is_approved(p_req.status, p_req.overall_status);
    $body$;
  $fn$;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
END $ensure_fully_approved$;

-- True when the date is a week off: Sunday (auto WO) or register mark WO.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_is_week_off(
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
    AND (
      extract(dow FROM p_date) = 0
      OR (
        nullif(btrim(p_employee_code), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.admin_attendance_register r
          WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
            AND r.register_date = p_date
            AND upper(btrim(r.mark)) = 'WO'
        )
      )
    );
$$;

-- National / public holiday on the register (not sandwich-converted).
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
    AND EXISTS (
      SELECT 1
      FROM public.admin_attendance_register r
      WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
        AND r.register_date = p_date
        AND upper(btrim(r.mark)) IN ('NH/PH', 'NHPH')
    );
$$;

-- Another approved leave (or leave mark) already covers this working day.
CREATE OR REPLACE FUNCTION indus_one.admin_leave_date_has_adjacent_leave(
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
          AND (
            coalesce(lower(btrim(r.mark_source)), '') = 'leave'
            OR r.leave_request_id IS NOT NULL
            OR upper(btrim(r.mark)) IN (
              'L', 'PL', 'CL', 'SL', 'SPLA', 'SPLB', 'SPLM', 'SBEL',
              'PTL', 'ML', 'LWP', 'HD', 'P/SL', 'P/CL', 'P/PL'
            )
          )
          AND (p_exclude_request_id IS NULL OR r.leave_request_id IS DISTINCT FROM p_exclude_request_id)
      )
      OR EXISTS (
        SELECT 1
        FROM indus_one.admin_leave_requests r
        WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
          AND indus_one.admin_leave_request_is_approved(r.status, r.overall_status)
          AND p_date BETWEEN r.from_date AND r.to_date
          AND (p_exclude_request_id IS NULL OR r.id IS DISTINCT FROM p_exclude_request_id)
          AND NOT indus_one.admin_leave_date_is_week_off(p_employee_code, p_date)
          AND NOT indus_one.admin_leave_date_is_nhph(p_employee_code, p_date)
      )
    );
$$;

-- Working + sandwich WO dates for a leave range.
-- Signature unchanged so deductible_days / apply_attendance keep working.
DROP FUNCTION IF EXISTS indus_one.admin_leave_working_dates(date, date);

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
          AND v_d < v_amax THEN
      -- Within-request sandwich: WO strictly between first and last leave working day
      v_dates := array_append(v_dates, v_d);
    END IF;
  END LOOP;

  IF v_emp IS NULL THEN
    RETURN QUERY SELECT DISTINCT u FROM unnest(v_dates) AS u ORDER BY 1;
    RETURN;
  END IF;

  v_from_is_anchor :=
    NOT indus_one.admin_leave_date_is_week_off(v_emp, p_from)
    AND NOT indus_one.admin_leave_date_is_nhph(v_emp, p_from);
  v_to_is_anchor :=
    NOT indus_one.admin_leave_date_is_week_off(v_emp, p_to)
    AND NOT indus_one.admin_leave_date_is_nhph(v_emp, p_to);

  -- Adjacent sandwich before from_date: … Leave | WO…WO | Leave(from)
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

-- Apply attendance: allow converting auto / blank-source WO → leave (sandwich).
-- Preserve manual WO and other leave marks. Half-day composite behaviour unchanged.
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
  v_prev_src text;
BEGIN
  IF NOT indus_one.admin_leave_request_is_approved(p_req.status, p_req.overall_status) THEN
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
    v_prev_src := coalesce(lower(btrim(v_prev_source)), '');

    IF v_row_exists THEN
      -- Sandwich: convert auto / unmarked WO to leave (manual WO stays protected)
      IF upper(btrim(coalesce(v_prev_mark, ''))) = 'WO'
         AND v_prev_src IN ('', 'auto_wo', 'auto')
      THEN
        v_can_apply := true;
      ELSIF indus_one.admin_leave_mark_is_manual(v_prev_mark, v_prev_source) THEN
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

-- Ledger note: sandwich WO days are included via admin_leave_working_dates.
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
  IF NOT indus_one.admin_leave_request_is_approved(p_req.status, p_req.overall_status) THEN
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
        'Approved leave — balance deducted (includes sandwich week-off days; excludes full-day punch-present days)'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_effective_status(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_request_is_approved(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_week_off(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_nhph(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_has_adjacent_leave(text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_working_dates(date, date, text) TO authenticated;

-- Re-apply attendance for recent approved leaves so sandwiched WO days appear on the register.
DO $backfill$
BEGIN
  IF to_regprocedure('indus_one.sync_approved_leaves_to_register(date,date)') IS NOT NULL THEN
    PERFORM indus_one.sync_approved_leaves_to_register(
      (current_date - interval '120 days')::date,
      (current_date + interval '120 days')::date
    );
  END IF;
END $backfill$;

-- Top up leave balance for sandwich days on already-approved PL/SL/CL
-- (only the delta above prior ledger deductions — never double-deduct).
DO $topup$
DECLARE
  v_req indus_one.admin_leave_requests%ROWTYPE;
  v_new numeric;
  v_applied numeric;
  v_delta numeric;
  v_code text;
  v_year integer;
  v_unused numeric;
  v_reg_code text;
BEGIN
  FOR v_req IN
    SELECT *
    FROM indus_one.admin_leave_requests r
    WHERE indus_one.admin_leave_request_is_approved(r.status, r.overall_status)
      AND upper(btrim(r.leave_type_code)) IN ('PL', 'SL', 'CL')
      AND r.to_date >= (current_date - interval '120 days')::date
      AND r.from_date <= (current_date + interval '120 days')::date
  LOOP
    v_reg_code := indus_one.admin_leave_validate_request_employee(v_req);
    IF v_reg_code IS NULL THEN
      CONTINUE;
    END IF;

    v_new := indus_one.admin_leave_deductible_days(v_req);
    SELECT coalesce(-sum(l.delta_days), 0)
    INTO v_applied
    FROM indus_one.admin_leave_balance_ledger l
    WHERE l.leave_request_id = v_req.id;

    v_delta := v_new - v_applied;
    IF v_delta IS NULL OR v_delta <= 0 THEN
      CONTINUE;
    END IF;

    v_code := upper(btrim(v_req.leave_type_code));
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
      'Sandwich week-off top-up — balance deducted for WO days between leave'
    );
  END LOOP;
END $topup$;

NOTIFY pgrst, 'reload schema';

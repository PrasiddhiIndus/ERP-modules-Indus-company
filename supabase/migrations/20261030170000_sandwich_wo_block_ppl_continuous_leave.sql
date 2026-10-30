-- WO sandwich rule only (everything else unchanged):
--   Do not convert week-off → leave when either flanking working day is
--   half-day / P/PL|P/SL|P/CL / machine punch / P(OD) (incl. P(OD)+P).
--
-- SCOPE:
--   * Strengthen admin_leave_date_blocks_wo_sandwich detection only.
--   * Does NOT replace admin_leave_date_is_half_day_leave (NH/PH sandwich unchanged).
--   * Does NOT replace admin_leave_working_dates (keeps 20261030160000 body;
--     that function already gates WO via blocks_wo_sandwich).
--   * Does NOT change LWP/NH·PH sandwich rules, punch-priority leave skip,
--     balance deduct formulas, payroll, or approval triggers.
--   * Repair: October 2026 only — restore incorrectly sandwiched WO cells
--     + credit paid leave (PL/CL/SL) for that one day. Idempotent.

-- ---------------------------------------------------------------------------
-- 1) WO sandwich flank blocker
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
      -- Half-day / P/PL · P/CL · P/SL · HD (existing helper; register + days=0.5)
      indus_one.admin_leave_date_is_half_day_leave(
        p_employee_code, p_date, p_exclude_request_id
      )
      -- Machine punch (raw punches or punch-sourced register Present)
      OR indus_one.admin_leave_date_punch_priority(p_employee_code, p_date)
      -- P(OD) — covers P(OD)+P on the flank
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
      -- Same half-day composites on leave-attendance audit (if register overwritten)
      OR EXISTS (
        SELECT 1
        FROM indus_one.admin_leave_attendance_marks m
        WHERE public.norm_emp_code(m.employee_code)
            = public.norm_emp_code(p_employee_code)
          AND m.register_date = p_date
          AND coalesce(m.reverted, false) = false
          AND upper(btrim(m.applied_mark)) IN ('P/PL', 'P/CL', 'P/SL', 'HD')
          AND (
            p_exclude_request_id IS NULL
            OR m.leave_request_id IS DISTINCT FROM p_exclude_request_id
          )
      )
    )
  END;
$$;

COMMENT ON FUNCTION indus_one.admin_leave_date_blocks_wo_sandwich(text, date, uuid) IS
  'WO sandwich only: true when flanking working day is half-day / P/PL|P/SL|P/CL / machine punch / P(OD).';

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_blocks_wo_sandwich(text, date, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) October 2026 only: undo WO sandwich when a flank blocks
-- ---------------------------------------------------------------------------
DO $repair_oct2026_wo_sandwich_flank_blockers$
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
  v_left date;
  v_right date;
  v_already_credited boolean;
  v_restored_reg integer := 0;
  v_restored_bal integer := 0;
BEGIN
  IF to_regprocedure(
    'indus_one.admin_leave_flanking_working_date(text, date, integer)'
  ) IS NULL THEN
    RAISE NOTICE
      'Oct 2026 WO sandwich repair skipped: flanking_working_date missing (apply 20261030160000 first)';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT
      r.ctid AS rid,
      r.employee_code,
      r.register_date,
      r.mark,
      r.mark_source,
      r.leave_request_id
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
    ORDER BY r.register_date, r.employee_code
  LOOP
    v_left := indus_one.admin_leave_flanking_working_date(
      v_row.employee_code, v_row.register_date, -1
    );
    v_right := indus_one.admin_leave_flanking_working_date(
      v_row.employee_code, v_row.register_date, 1
    );

    IF NOT (
      indus_one.admin_leave_date_blocks_wo_sandwich(v_row.employee_code, v_left)
      OR indus_one.admin_leave_date_blocks_wo_sandwich(v_row.employee_code, v_right)
    ) THEN
      CONTINUE;
    END IF;

    SELECT m.previous_mark, m.previous_mark_source
    INTO v_prev, v_prev_src
    FROM indus_one.admin_leave_attendance_marks m
    WHERE m.register_date = v_row.register_date
      AND public.norm_emp_code(m.employee_code) = public.norm_emp_code(v_row.employee_code)
      AND coalesce(m.reverted, false) = false
      AND (
        v_row.leave_request_id IS NULL
        OR m.leave_request_id IS NOT DISTINCT FROM v_row.leave_request_id
      )
    ORDER BY m.id DESC
    LIMIT 1;

    IF upper(btrim(coalesce(v_prev, ''))) NOT IN ('WO', 'NH/PH', 'NHPH') THEN
      v_prev := 'WO';
      v_prev_src := 'auto_wo';
    END IF;
    IF coalesce(lower(btrim(v_prev_src)), '') = '' THEN
      v_prev_src := 'auto_wo';
    END IF;

    -- Decide balance credit before mutating (idempotent vs prior Oct repairs)
    v_leave_id := v_row.leave_request_id;
    v_type := upper(btrim(coalesce(v_row.mark, '')));
    v_code := CASE
      WHEN v_type IN ('PL', 'P/PL') THEN 'PL'
      WHEN v_type IN ('SL', 'P/SL') THEN 'SL'
      WHEN v_type IN ('CL', 'P/CL') THEN 'CL'
      ELSE NULL
    END;
    v_already_credited := false;
    IF v_leave_id IS NOT NULL AND v_code IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM indus_one.admin_leave_balance_ledger l
        WHERE l.leave_request_id = v_leave_id
          AND l.entry_type = 'restore'
          AND l.leave_type_code = v_code
          AND public.norm_emp_code(l.employee_code)
              = public.norm_emp_code(v_row.employee_code)
          AND l.note LIKE '%' || v_row.register_date::text || '%'
      )
      INTO v_already_credited;
    END IF;

    UPDATE public.admin_attendance_register r
    SET
      mark = CASE WHEN upper(btrim(v_prev)) IN ('NHPH', 'NH/PH') THEN 'NH/PH' ELSE 'WO' END,
      mark_source = v_prev_src,
      leave_request_id = NULL,
      updated_at = now()
    WHERE r.ctid = v_row.rid;

    v_restored_reg := v_restored_reg + 1;

    UPDATE indus_one.admin_leave_attendance_marks m
    SET reverted = true
    WHERE m.register_date = v_row.register_date
      AND public.norm_emp_code(m.employee_code) = public.norm_emp_code(v_row.employee_code)
      AND coalesce(m.reverted, false) = false
      AND (
        m.leave_request_id IS NOT DISTINCT FROM v_row.leave_request_id
        OR v_row.leave_request_id IS NULL
      );

    -- Credit paid leave only (not LWP / L); skip if already credited
    IF v_leave_id IS NULL OR v_code IS NULL OR v_already_credited THEN
      CONTINUE;
    END IF;

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
      'Oct 2026 repair: ' || v_row.register_date::text
        || ' — undo WO sandwich (flanking half-day/P/PL|P/SL|P/CL/punch/P(OD))'
    );

    UPDATE indus_one.admin_leave_requests r
    SET
      days = CASE WHEN coalesce(days, 0) > 0.5 THEN days - 1 ELSE days END,
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
      days = CASE WHEN coalesce(lr.days, 0) > 0.5 THEN lr.days - 1 ELSE lr.days END,
      updated_at = now()
    WHERE lr.id = v_leave_id;

    v_restored_bal := v_restored_bal + 1;
  END LOOP;

  RAISE NOTICE
    'Oct 2026 WO sandwich flank repair: % cell(s) → WO, % balance credit(s)',
    v_restored_reg, v_restored_bal;
END
$repair_oct2026_wo_sandwich_flank_blockers$;

-- ---------------------------------------------------------------------------
-- 3) October 2026: orphaned leave-attendance sandwich rows
--    (register already WO/manual but unreverted applied_mark still paints PL —
--     emp 8680 on 2026-10-11)
-- ---------------------------------------------------------------------------
DO $repair_oct2026_orphaned_wo_sandwich_marks$
DECLARE
  v_from date := DATE '2026-10-01';
  v_to date := DATE '2026-10-31';
  v_row record;
  v_type text;
  v_code text;
  v_year integer := 2026;
  v_left date;
  v_right date;
  v_already_credited boolean;
  v_restored_marks integer := 0;
  v_restored_bal integer := 0;
BEGIN
  IF to_regprocedure(
    'indus_one.admin_leave_flanking_working_date(text, date, integer)'
  ) IS NULL THEN
    RAISE NOTICE 'Orphaned WO sandwich mark repair skipped: flanking_working_date missing';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT
      m.id AS mark_id,
      m.leave_request_id,
      m.employee_code,
      m.register_date,
      m.applied_mark
    FROM indus_one.admin_leave_attendance_marks m
    WHERE m.register_date BETWEEN v_from AND v_to
      AND coalesce(m.reverted, false) = false
      AND upper(btrim(coalesce(m.previous_mark, ''))) IN ('WO', 'NH/PH', 'NHPH')
      AND upper(btrim(coalesce(m.applied_mark, ''))) IN (
        'PL', 'CL', 'SL', 'LWP', 'L', 'P/PL', 'P/CL', 'P/SL'
      )
      AND indus_one.admin_leave_date_is_week_off(m.employee_code, m.register_date)
      -- Register already shows off (manual undo) or still leave — both need mark revert
      AND EXISTS (
        SELECT 1
        FROM public.admin_attendance_register r
        WHERE public.norm_emp_code(r.employee_code)
            = public.norm_emp_code(m.employee_code)
          AND r.register_date = m.register_date
          AND (
            upper(btrim(coalesce(r.mark, ''))) IN ('WO', 'NH/PH', 'NHPH')
            OR upper(btrim(coalesce(r.mark, ''))) IN (
              'PL', 'CL', 'SL', 'LWP', 'L', 'P/PL', 'P/CL', 'P/SL'
            )
          )
      )
    ORDER BY m.register_date, m.employee_code
  LOOP
    v_left := indus_one.admin_leave_flanking_working_date(
      v_row.employee_code, v_row.register_date, -1
    );
    v_right := indus_one.admin_leave_flanking_working_date(
      v_row.employee_code, v_row.register_date, 1
    );

    IF NOT (
      indus_one.admin_leave_date_blocks_wo_sandwich(v_row.employee_code, v_left)
      OR indus_one.admin_leave_date_blocks_wo_sandwich(v_row.employee_code, v_right)
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.admin_attendance_register r
    SET
      mark = 'WO',
      mark_source = CASE
        WHEN upper(btrim(coalesce(r.mark, ''))) IN ('WO', 'NH/PH', 'NHPH')
          THEN coalesce(nullif(btrim(r.mark_source), ''), 'auto_wo')
        ELSE 'auto_wo'
      END,
      leave_request_id = NULL,
      updated_at = now()
    WHERE public.norm_emp_code(r.employee_code)
        = public.norm_emp_code(v_row.employee_code)
      AND r.register_date = v_row.register_date
      AND upper(btrim(coalesce(r.mark, ''))) NOT IN ('WO', 'NH/PH', 'NHPH');

    UPDATE indus_one.admin_leave_attendance_marks m
    SET reverted = true
    WHERE m.id = v_row.mark_id;

    v_restored_marks := v_restored_marks + 1;

    v_type := upper(btrim(coalesce(v_row.applied_mark, '')));
    v_code := CASE
      WHEN v_type IN ('PL', 'P/PL') THEN 'PL'
      WHEN v_type IN ('SL', 'P/SL') THEN 'SL'
      WHEN v_type IN ('CL', 'P/CL') THEN 'CL'
      ELSE NULL
    END;

    IF v_row.leave_request_id IS NULL OR v_code IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM indus_one.admin_leave_balance_ledger l
      WHERE l.leave_request_id = v_row.leave_request_id
        AND l.entry_type = 'restore'
        AND l.leave_type_code = v_code
        AND public.norm_emp_code(l.employee_code)
            = public.norm_emp_code(v_row.employee_code)
        AND l.note LIKE '%' || v_row.register_date::text || '%'
    )
    INTO v_already_credited;

    IF v_already_credited THEN
      CONTINUE;
    END IF;

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
      v_row.leave_request_id,
      v_row.employee_code,
      v_year,
      v_code,
      1,
      'restore',
      'Oct 2026 repair: ' || v_row.register_date::text
        || ' — undo WO sandwich orphan mark (flanking half-day/P/PL|P/SL|P/CL/punch/P(OD))'
    );

    -- Shrink days only when this off day is still listed on the request
    IF EXISTS (
      SELECT 1
      FROM indus_one.admin_leave_requests r
      WHERE r.id = v_row.leave_request_id
        AND r.applied_day_marks IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(r.applied_day_marks) elem
          WHERE coalesce(elem->>'date', '') = v_row.register_date::text
        )
    ) THEN
      UPDATE indus_one.admin_leave_requests r
      SET
        days = CASE WHEN coalesce(days, 0) > 0.5 THEN days - 1 ELSE days END,
        paid_leave_days = CASE
          WHEN coalesce(paid_leave_days, 0) > 0 THEN paid_leave_days - 1
          ELSE paid_leave_days
        END,
        applied_day_marks = coalesce((
          SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(applied_day_marks) elem
          WHERE coalesce(elem->>'date', '')
                IS DISTINCT FROM v_row.register_date::text
        ), '[]'::jsonb),
        updated_at = now()
      WHERE r.id = v_row.leave_request_id;

      UPDATE indus_one.leave_requests lr
      SET
        days = CASE WHEN coalesce(lr.days, 0) > 0.5 THEN lr.days - 1 ELSE lr.days END,
        updated_at = now()
      WHERE lr.id = v_row.leave_request_id;
    END IF;

    v_restored_bal := v_restored_bal + 1;
  END LOOP;

  RAISE NOTICE
    'Oct 2026 orphaned WO sandwich marks: % reverted, % balance credit(s)',
    v_restored_marks, v_restored_bal;
END
$repair_oct2026_orphaned_wo_sandwich_marks$;

NOTIFY pgrst, 'reload schema';

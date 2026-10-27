-- WO + NH/PH between leave: count as leave days and deduct balance.
--
-- Problems this fixes:
--   1) admin_leave_date_is_week_off only saw Sunday / register WO — not rule-based
--      weekly offs (e.g. 3rd Saturday) until WO was already stamped.
--   2) admin_leave_approval_day_units (live) emitted only p_req.days units, so when
--      LMS days excluded WO/NH-PH, sandwich offs were never paid-debited (partial
--      leftover stamped them LWP, or they stayed WO/NH-PH on the register).
--   3) sufficient returned paid_leave_days = p_req.days (excluding sandwich).
--   4) NULL mark_source WO/NH-PH could be treated as "manual" and block overwrite
--      when the auto-WO allow-list did not match.
--   5) Already-approved leaves with WO/NH-PH between dates need re-apply +
--      balance top-up (all such PL/SL/CL in ± window, not only 792 / 8019).
--
-- Policy (unchanged intent): full-day leave flanking WO or NH/PH → those offs are
-- leave (paid when balance allows, else LWP). Half-day flanking still blocks sandwich.

-- ---------------------------------------------------------------------------
-- 1) Week-off detector: Sunday / register WO / rule weekly-off
-- ---------------------------------------------------------------------------
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
        AND (
          public.admin_rule_is_weekly_off(p_employee_code, p_date)
          OR EXISTS (
            SELECT 1
            FROM public.admin_attendance_register r
            WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
              AND r.register_date = p_date
              AND upper(btrim(r.mark)) = 'WO'
          )
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_week_off(text, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Sandwichable off: week-off OR NH/PH (register / calendar)
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
      OR indus_one.admin_leave_date_is_calendar_nhph(p_date)
    );
$$;

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

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_calendar_nhph(date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_nhph(text, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION indus_one.admin_leave_date_is_sandwichable_off(text, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Manual detector: never treat auto/blank WO or NH/PH as manual
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_mark_is_manual(
  p_mark text,
  p_mark_source text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN upper(btrim(coalesce(p_mark, ''))) IN ('WO', 'NH/PH', 'NHPH')
        AND coalesce(lower(btrim(p_mark_source)), '') IN (
          '', 'auto_wo', 'auto_holiday', 'auto', 'auto_weekoff', 'system'
        )
      THEN false
      WHEN coalesce(lower(btrim(p_mark_source)), '') IN (
        'manual', 'hr', 'admin', 'erp_manual', 'erp', 'm'
      ) THEN true
      WHEN p_mark_source IS NULL
        AND coalesce(btrim(p_mark), '') <> ''
        AND upper(btrim(p_mark)) NOT IN ('P', 'P(OD)', 'WO', 'NH/PH', 'NHPH')
      THEN true
      ELSE false
    END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Day units = every sandwich-inclusive working date (not raw p_req.days)
--     Keep arg name p_reg_code (live signature) — CREATE OR REPLACE cannot rename
--     input params (42P13). Drop + recreate same types only; no CASCADE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS indus_one.admin_leave_approval_day_units(indus_one.admin_leave_requests, text);

CREATE FUNCTION indus_one.admin_leave_approval_day_units(
  p_req indus_one.admin_leave_requests,
  p_reg_code text
)
RETURNS TABLE(unit_date date, unit_weight numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
DECLARE
  v_emp text := coalesce(nullif(btrim(p_reg_code), ''), nullif(btrim(p_req.employee_code), ''));
  v_half boolean := indus_one.admin_leave_is_half_day(p_req.days);
BEGIN
  IF p_req.from_date IS NULL OR p_req.to_date IS NULL THEN
    RETURN;
  END IF;

  IF v_half THEN
    RETURN QUERY
    SELECT d::date, 0.5::numeric
    FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_emp) AS d
    ORDER BY 1
    LIMIT 1;
    RETURN;
  END IF;

  -- Full sandwich-inclusive working dates (WO + NH/PH between leave included).
  -- Callers still pass (p_req, v_reg_code) — signature unchanged.
  RETURN QUERY
  SELECT d::date, 1::numeric
  FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, v_emp) AS d
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_approval_day_units(
  indus_one.admin_leave_requests, text
) TO authenticated, service_role;

-- Drop first in case live OUT column names differ (same 42P13 class of error).
DROP FUNCTION IF EXISTS indus_one.admin_leave_mark_for_unit(numeric, numeric, text);

CREATE FUNCTION indus_one.admin_leave_mark_for_unit(
  p_available numeric,
  p_weight numeric,
  p_type text
)
RETURNS TABLE(o_mark text, o_paid numeric, o_lwp numeric, o_new_balance numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_avail numeric := greatest(coalesce(p_available, 0), 0);
  v_weight numeric := greatest(coalesce(p_weight, 0), 0);
  v_type text := upper(btrim(coalesce(p_type, 'LWP')));
BEGIN
  IF v_weight <= 0 THEN
    o_mark := v_type;
    o_paid := 0;
    o_lwp := 0;
    o_new_balance := v_avail;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_avail >= v_weight THEN
    o_mark := v_type;
    o_paid := v_weight;
    o_lwp := 0;
    o_new_balance := v_avail - v_weight;
  ELSIF v_avail > 0 THEN
    o_mark := 'LWP/' || v_type;
    o_paid := v_avail;
    o_lwp := v_weight - v_avail;
    o_new_balance := 0;
  ELSE
    o_mark := 'LWP';
    o_paid := 0;
    o_lwp := v_weight;
    o_new_balance := 0;
  END IF;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_mark_for_unit(numeric, numeric, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_needs_partial_lwp(
  p_req indus_one.admin_leave_requests,
  p_available numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
  SELECT CASE
    WHEN upper(btrim(coalesce(p_req.leave_type_code, ''))) NOT IN ('PL', 'SL', 'CL') THEN false
    WHEN indus_one.admin_leave_is_half_day(p_req.days) THEN
      coalesce(p_available, 0) < 0.5
    ELSE
      coalesce(p_available, 0) < indus_one.admin_leave_deductible_days(p_req)
  END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_needs_partial_lwp(
  indus_one.admin_leave_requests, numeric
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) sufficient: paid_leave_days = sandwich-inclusive applied paid count
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
    -- Only force LWP on sandwich when this request is already unpaid / all-LWP.
    -- Paid Taken Leave keeps sandwich offs as PL/CL/SL (balance deducts them).
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
-- 6) partial: day_units already include sandwich — leftover loop stays as safety net
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

-- ---------------------------------------------------------------------------
-- 7) apply_attendance: also refresh days to sandwich-inclusive deductible
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.admin_leave_apply_attendance(
  p_req indus_one.admin_leave_requests
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
  v_code text;
  v_year integer;
  v_available numeric;
  v_has_balance boolean;
  v_result jsonb;
  v_days numeric;
BEGIN
  v_emp_code := coalesce(
    nullif(btrim(p_req.employee_code), ''),
    indus_one.admin_leave_request_employee_code(p_req.id)
  );

  v_reg_code := coalesce(
    indus_one.admin_leave_register_employee_code(v_emp_code),
    nullif(btrim(v_emp_code), '')
  );

  v_code := upper(btrim(coalesce(p_req.leave_type_code, '')));
  v_year := extract(year FROM p_req.from_date)::integer;
  v_days := indus_one.admin_leave_deductible_days(p_req);

  IF v_code NOT IN ('PL', 'SL', 'CL') OR v_reg_code IS NULL THEN
    v_result := indus_one.admin_leave_apply_attendance_sufficient(p_req);
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM indus_one.employee_leave_balances_yearly y
      WHERE indus_one.leave_attendance_norm_code(y.employee_code)
              = indus_one.leave_attendance_norm_code(v_reg_code)
        AND y.year = v_year
    ) INTO v_has_balance;

    IF NOT v_has_balance THEN
      v_result := indus_one.admin_leave_apply_attendance_sufficient(p_req);
    ELSE
      v_available := indus_one.admin_leave_yearly_unused_balance(v_reg_code, v_year, v_code);
      IF NOT indus_one.admin_leave_needs_partial_lwp(p_req, v_available) THEN
        v_result := indus_one.admin_leave_apply_attendance_sufficient(p_req);
      ELSE
        v_result := indus_one.admin_leave_apply_attendance_partial(p_req, v_available);
      END IF;
    END IF;
  END IF;

  -- Outside a leave-status trigger: persist paid/lwp/days on the request row.
  -- Inside BEFORE trigger: caller assigns NEW.* from the returned jsonb.
  IF pg_trigger_depth() = 0 THEN
    UPDATE indus_one.admin_leave_requests
    SET
      days = CASE
        WHEN indus_one.admin_leave_is_half_day(p_req.days) THEN p_req.days
        WHEN v_days > 0 THEN v_days
        ELSE coalesce((v_result ->> 'paid_leave_days')::numeric, 0)
               + coalesce((v_result ->> 'lwp_days')::numeric, 0)
      END,
      paid_leave_days = (v_result ->> 'paid_leave_days')::numeric,
      lwp_days = (v_result ->> 'lwp_days')::numeric,
      applied_day_marks = coalesce(v_result -> 'applied_day_marks', '[]'::jsonb),
      updated_at = now()
    WHERE id = p_req.id;

    UPDATE indus_one.leave_requests lr
    SET days = CASE
          WHEN indus_one.admin_leave_is_half_day(p_req.days) THEN p_req.days
          WHEN v_days > 0 THEN v_days
          ELSE lr.days
        END,
        updated_at = now()
    WHERE lr.id = p_req.id
      AND NOT indus_one.admin_leave_is_half_day(p_req.days)
      AND v_days > 0
      AND coalesce(lr.days, 0) IS DISTINCT FROM v_days;
  END IF;

  -- Always expose sandwich-inclusive days on the result for trigger assignment.
  v_result := v_result || jsonb_build_object(
    'days', CASE
      WHEN indus_one.admin_leave_is_half_day(p_req.days) THEN p_req.days
      WHEN v_days > 0 THEN v_days
      ELSE coalesce((v_result ->> 'paid_leave_days')::numeric, 0)
             + coalesce((v_result ->> 'lwp_days')::numeric, 0)
    END
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION indus_one.admin_leave_apply_attendance(indus_one.admin_leave_requests)
  TO authenticated;

-- BEFORE status trigger: capture jsonb apply result onto NEW (incl. sandwich days).
CREATE OR REPLACE FUNCTION indus_one.admin_leave_request_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
DECLARE
  v_old_effective text;
  v_new_effective text;
  v_result jsonb;
  v_days numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF indus_one.admin_leave_effective_status(NEW.status, NEW.overall_status) = 'approved' THEN
      NEW.decided_at := coalesce(NEW.decided_at, now());
      v_result := indus_one.admin_leave_apply_attendance(NEW);
      NEW.paid_leave_days := coalesce((v_result ->> 'paid_leave_days')::numeric, NEW.paid_leave_days);
      NEW.lwp_days := coalesce((v_result ->> 'lwp_days')::numeric, NEW.lwp_days);
      NEW.applied_day_marks := coalesce(v_result -> 'applied_day_marks', NEW.applied_day_marks);
      v_days := (v_result ->> 'days')::numeric;
      IF v_days IS NOT NULL AND NOT indus_one.admin_leave_is_half_day(NEW.days) AND v_days > 0 THEN
        NEW.days := v_days;
      END IF;
      PERFORM indus_one.admin_leave_apply_balance_deduction(NEW);
    END IF;
    RETURN NEW;
  END IF;

  v_old_effective := indus_one.admin_leave_effective_status(OLD.status, OLD.overall_status);
  v_new_effective := indus_one.admin_leave_effective_status(NEW.status, NEW.overall_status);

  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF v_new_effective IS NOT DISTINCT FROM v_old_effective
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.overall_status IS NOT DISTINCT FROM OLD.overall_status
  THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := now();

  IF v_new_effective = 'approved' AND v_old_effective IS DISTINCT FROM 'approved' THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
    v_result := indus_one.admin_leave_apply_attendance(NEW);
    NEW.paid_leave_days := coalesce((v_result ->> 'paid_leave_days')::numeric, NEW.paid_leave_days);
    NEW.lwp_days := coalesce((v_result ->> 'lwp_days')::numeric, NEW.lwp_days);
    NEW.applied_day_marks := coalesce(v_result -> 'applied_day_marks', NEW.applied_day_marks);
    v_days := (v_result ->> 'days')::numeric;
    IF v_days IS NOT NULL AND NOT indus_one.admin_leave_is_half_day(NEW.days) AND v_days > 0 THEN
      NEW.days := v_days;
    END IF;
    PERFORM indus_one.admin_leave_apply_balance_deduction(NEW);

    UPDATE indus_one.leave_requests lr
    SET days = NEW.days, updated_at = now()
    WHERE lr.id = NEW.id
      AND coalesce(lr.days, 0) IS DISTINCT FROM coalesce(NEW.days, 0);
  ELSIF v_new_effective IN ('rejected', 'cancelled', 'withdrawn')
    AND v_old_effective = 'approved'
  THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
    PERFORM indus_one.admin_leave_revert_attendance(NEW);
    PERFORM indus_one.admin_leave_restore_balance(NEW);
  ELSIF v_new_effective IN ('rejected', 'cancelled', 'withdrawn')
    AND v_old_effective = 'pending'
  THEN
    NEW.decided_at := coalesce(NEW.decided_at, now());
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Repair note
--     Do NOT call admin_leave_apply_attendance here: it uses *current* unused
--     balance, so already-deducted leaves go through the partial-LWP path and
--     wrongly convert Taken Leave (PL/CL/SL) — including sandwiched WO/NH-PH —
--     into LWP. Safe stamp + balance top-up lives in
--     20261027171000_leave_sandwich_paid_not_lwp_repair.sql.
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

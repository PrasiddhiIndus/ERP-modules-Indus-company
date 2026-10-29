-- Forward-only consecutive leave merge: from 2026-10-29, only PL and CO may sit
-- next to each other. CL/SL still cannot mix with other leave types.
--
-- IMPORTANT — no existing data is rewritten:
--   * This migration only replaces validation functions / triggers.
--   * It does NOT UPDATE or DELETE admin_attendance_register, leave requests,
--     C/O credits, sandwich marks, or any other attendance/leave rows.
--   * Already-saved CO next to CL/SL (or any historical marks) stay as stored.
--   * Dates before 2026-10-29 keep the previous CO behaviour for merge checks
--     (CO was outside the mix rule), so re-touching older months does not fail.
--   * C/O earn/consume, punch priority, sandwich, LWP, and other leave logic
--     are unchanged.

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_pl_cl_sl_type(p_mark text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN m IN ('PL', 'P/PL', 'LWP/PL') THEN 'PL'
    WHEN m IN ('CL', 'P/CL', 'LWP/CL') THEN 'CL'
    WHEN m IN ('SL', 'P/SL', 'LWP/SL') THEN 'SL'
    WHEN m IN ('CO', 'C/O', 'COMP OFF', 'COMPENSATORY OFF') THEN 'CO'
    ELSE NULL
  END
  FROM (SELECT upper(btrim(coalesce(p_mark, ''))) AS m) s;
$$;

COMMENT ON FUNCTION public.admin_attendance_mark_pl_cl_sl_type(text) IS
  'Maps register / leave marks to PL, CL, SL, or CO for consecutive-day merge checks. Does not modify data.';

-- p_on_date: date of the mark being written. Before 2026-10-29, CO is compatible
-- with any leave type (legacy). From that date, only same-type or PL↔CO.
CREATE OR REPLACE FUNCTION public.admin_attendance_leave_types_compatible(
  p_a text,
  p_b text,
  p_on_date date DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_a IS NULL OR p_b IS NULL THEN true
      WHEN p_a = p_b THEN true
      WHEN (p_a = 'PL' AND p_b = 'CO') OR (p_a = 'CO' AND p_b = 'PL') THEN true
      WHEN p_a = 'CO' OR p_b = 'CO' THEN
        -- Legacy window: CO did not participate in mix checks.
        (p_on_date IS NULL OR p_on_date < DATE '2026-10-29')
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.admin_attendance_leave_types_compatible(text, text, date) IS
  'Consecutive leave merge: same type OK; PL↔CO OK; from 2026-10-29 CO cannot sit next to CL/SL. No data writes.';

-- Drop 2-arg overload if a prior draft created it (keep a single canonical signature).
DROP FUNCTION IF EXISTS public.admin_attendance_leave_types_compatible(text, text);

CREATE OR REPLACE FUNCTION public.admin_attendance_register_enforce_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
DECLARE
  v_new_type text;
  v_prev_type text;
  v_next_type text;
  v_has_punch boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.mark IS NOT DISTINCT FROM OLD.mark THEN
    RETURN NEW;
  END IF;

  IF NEW.mark IS NULL OR btrim(NEW.mark) = '' THEN
    RETURN NEW;
  END IF;

  v_has_punch := public.admin_attendance_employee_has_raw_punch(
    NEW.employee_code,
    NEW.register_date
  );

  IF public.admin_attendance_mark_requires_raw_punch(NEW.mark) AND NOT v_has_punch THEN
    RAISE EXCEPTION
      'Half Day and Present+leave marks (P/SL, P/CL, P/PL) require a biometric punch on % for this employee.',
      to_char(NEW.register_date, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.admin_attendance_mark_is_birthday_anniversary_leave(NEW.mark) AND NOT v_has_punch THEN
    RAISE EXCEPTION
      'Birthday or Anniversary leave requires a biometric punch on % and cannot be applied in advance without that punch.',
      to_char(NEW.register_date, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Same punch / birthday rules as before. Only the leave-type merge check below
  -- gains CO awareness (forward from 2026-10-29).
  v_new_type := public.admin_attendance_mark_pl_cl_sl_type(NEW.mark);
  -- Re-saving the same leave family on an already-stored day must not break
  -- pre-existing CO+CL / CO+SL combinations.
  IF TG_OP = 'UPDATE'
     AND v_new_type IS NOT NULL
     AND public.admin_attendance_mark_pl_cl_sl_type(OLD.mark) IS NOT DISTINCT FROM v_new_type THEN
    RETURN NEW;
  END IF;

  IF v_new_type IS NOT NULL THEN
    v_prev_type := public.admin_attendance_neighbor_pl_cl_sl_type(
      NEW.employee_code::text,
      NEW.register_date::date,
      -1
    );
    IF v_prev_type IS NOT NULL
       AND NOT public.admin_attendance_leave_types_compatible(
         v_new_type, v_prev_type, NEW.register_date::date
       ) THEN
      RAISE EXCEPTION
        'Cannot combine different leave types on consecutive days: % next to existing %. Only PL and CO may be combined; otherwise use the same leave type or leave a gap.',
        v_new_type,
        v_prev_type
        USING ERRCODE = 'check_violation';
    END IF;

    v_next_type := public.admin_attendance_neighbor_pl_cl_sl_type(
      NEW.employee_code::text,
      NEW.register_date::date,
      1
    );
    IF v_next_type IS NOT NULL
       AND NOT public.admin_attendance_leave_types_compatible(
         v_new_type, v_next_type, NEW.register_date::date
       ) THEN
      RAISE EXCEPTION
        'Cannot combine different leave types on consecutive days: % next to existing %. Only PL and CO may be combined; otherwise use the same leave type or leave a gap.',
        v_new_type,
        v_next_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('indus_one.admin_leave_requests') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION indus_one.admin_leave_request_enforce_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $body$
DECLARE
  v_old_effective text;
  v_new_effective text;
  v_reg_code text;
  v_mark text;
  v_type text;
  v_date date;
  v_prev_type text;
  v_next_type text;
  v_is_bday_ann boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_old_effective := NULL;
    v_new_effective := indus_one.admin_leave_effective_status(NEW.status, NEW.overall_status);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_effective := indus_one.admin_leave_effective_status(OLD.status, OLD.overall_status);
    v_new_effective := indus_one.admin_leave_effective_status(NEW.status, NEW.overall_status);
  ELSE
    RETURN NEW;
  END IF;

  IF v_new_effective IS DISTINCT FROM 'approved'
     OR v_new_effective IS NOT DISTINCT FROM v_old_effective THEN
    RETURN NEW;
  END IF;

  v_reg_code := indus_one.admin_leave_validate_request_employee(NEW);
  IF v_reg_code IS NULL THEN
    RETURN NEW;
  END IF;

  v_mark := indus_one.admin_leave_primary_attendance_mark(NEW.leave_type_code);
  v_type := public.admin_attendance_mark_pl_cl_sl_type(v_mark);
  v_is_bday_ann := indus_one.admin_leave_type_is_birthday_anniversary(NEW.leave_type_code);

  FOR v_date IN
    SELECT * FROM indus_one.admin_leave_working_dates(NEW.from_date, NEW.to_date, v_reg_code)
  LOOP
    IF v_is_bday_ann
       AND NOT public.admin_attendance_employee_has_raw_punch(v_reg_code, v_date) THEN
      RAISE EXCEPTION
        'Birthday or Anniversary leave requires a biometric punch on % and cannot be applied in advance without that punch.',
        to_char(v_date, 'DD Mon YYYY')
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_type IS NOT NULL THEN
      v_prev_type := public.admin_attendance_neighbor_pl_cl_sl_type(v_reg_code::text, v_date::date, -1);
      IF v_prev_type IS NOT NULL
         AND NOT public.admin_attendance_leave_types_compatible(v_type, v_prev_type, v_date) THEN
        RAISE EXCEPTION
          'Cannot combine different leave types on consecutive days: % next to existing %. Only PL and CO may be combined.',
          v_type,
          v_prev_type
          USING ERRCODE = 'check_violation';
      END IF;

      v_next_type := public.admin_attendance_neighbor_pl_cl_sl_type(v_reg_code::text, v_date::date, 1);
      IF v_next_type IS NOT NULL
         AND NOT public.admin_attendance_leave_types_compatible(v_type, v_next_type, v_date) THEN
        RAISE EXCEPTION
          'Cannot combine different leave types on consecutive days: % next to existing %. Only PL and CO may be combined.',
          v_type,
          v_next_type
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$body$;
$fn$;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_attendance_leave_types_compatible(text, text, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

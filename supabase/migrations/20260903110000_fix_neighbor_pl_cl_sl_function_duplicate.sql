-- Fix: "function public.admin_attendance_neighbor_pl_cl_sl_type(text, date, integer) is not unique"
-- Caused by duplicate overloads (e.g. text vs varchar employee_code) after re-applying migrations.
-- Drops every overload, then recreates one canonical helper + trigger body.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_attendance_neighbor_pl_cl_sl_type'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig::text;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_is_leave_bridge(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(coalesce(p_mark, ''))) IN ('WO', 'NH/PH', 'NHPH');
$$;

CREATE OR REPLACE FUNCTION public.admin_attendance_neighbor_pl_cl_sl_type(
  p_employee_code text,
  p_from_date date,
  p_direction integer
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_cursor date;
  v_mark text;
  v_type text;
  v_guard integer := 0;
  v_step integer;
BEGIN
  IF p_employee_code IS NULL OR btrim(p_employee_code) = '' OR p_from_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_step := CASE WHEN p_direction < 0 THEN -1 ELSE 1 END;
  v_cursor := p_from_date + v_step;

  WHILE v_guard < 14 LOOP
    v_guard := v_guard + 1;

    SELECT r.mark
    INTO v_mark
    FROM public.admin_attendance_register r
    WHERE public.norm_emp_code(r.employee_code) = public.norm_emp_code(p_employee_code)
      AND r.register_date = v_cursor
    LIMIT 1;

    IF NOT FOUND OR v_mark IS NULL OR btrim(v_mark) = '' THEN
      RETURN NULL;
    END IF;

    v_type := public.admin_attendance_mark_pl_cl_sl_type(v_mark);
    IF v_type IS NOT NULL THEN
      RETURN v_type;
    END IF;

    IF public.admin_attendance_mark_is_leave_bridge(v_mark) THEN
      v_cursor := v_cursor + v_step;
      CONTINUE;
    END IF;

    RETURN NULL;
  END LOOP;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_attendance_neighbor_pl_cl_sl_type(text, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attendance_neighbor_pl_cl_sl_type(text, date, integer) TO service_role;

-- Re-bind trigger (body unchanged; ensures it calls the single overload).
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

  v_new_type := public.admin_attendance_mark_pl_cl_sl_type(NEW.mark);
  IF v_new_type IS NOT NULL THEN
    v_prev_type := public.admin_attendance_neighbor_pl_cl_sl_type(
      NEW.employee_code::text,
      NEW.register_date::date,
      -1
    );
    IF v_prev_type IS NOT NULL AND v_prev_type IS DISTINCT FROM v_new_type THEN
      RAISE EXCEPTION
        'Cannot combine different leave types on consecutive days: % next to existing %. Use the same leave type or leave a gap.',
        v_new_type,
        v_prev_type
        USING ERRCODE = 'check_violation';
    END IF;

    v_next_type := public.admin_attendance_neighbor_pl_cl_sl_type(
      NEW.employee_code::text,
      NEW.register_date::date,
      1
    );
    IF v_next_type IS NOT NULL AND v_next_type IS DISTINCT FROM v_new_type THEN
      RAISE EXCEPTION
        'Cannot combine different leave types on consecutive days: % next to existing %. Use the same leave type or leave a gap.',
        v_new_type,
        v_next_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Leave approval path: explicit casts avoid ambiguous overload resolution.
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
      IF v_prev_type IS NOT NULL AND v_prev_type IS DISTINCT FROM v_type THEN
        RAISE EXCEPTION
          'Cannot combine different leave types on consecutive days: % next to existing %.',
          v_type,
          v_prev_type
          USING ERRCODE = 'check_violation';
      END IF;

      v_next_type := public.admin_attendance_neighbor_pl_cl_sl_type(v_reg_code::text, v_date::date, 1);
      IF v_next_type IS NOT NULL AND v_next_type IS DISTINCT FROM v_type THEN
        RAISE EXCEPTION
          'Cannot combine different leave types on consecutive days: % next to existing %.',
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

NOTIFY pgrst, 'reload schema';

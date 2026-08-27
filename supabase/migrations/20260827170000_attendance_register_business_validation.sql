-- =============================================================================
-- DATA SAFETY: This migration does NOT delete, update, truncate, or modify any
-- table rows. It only adds validation helper functions plus BEFORE triggers that
-- RAISE EXCEPTION on invalid writes. Existing register / punch / leave rows are
-- untouched. Workflows that write valid marks continue unchanged.
-- =============================================================================
--
-- Business rules enforced on every register write path (manual, import, API,
-- leave apply, punch sync, tour, auto marks) and on leave approval:
--   1) PL / CL / SL (and their P/ and LWP/ composites) must not sit on
--      consecutive dates (calendar-adjacent, walking across WO / NH/PH bridges)
--      when the neighboring leave type differs.
--   2) Present-based marks (P, HD, P/SL, P/CL, P/PL, P/…) require a raw row in
--      erp_attendance_punches for that employee + date.
--   3) Birthday / Anniversary leave (SBEL, SPLA, SPLB, or leave types labeled as
--      birthday/anniversary) require a raw punch on that date (blocks advance
--      apply/generate without punch).

-- ---------------------------------------------------------------------------
-- Helpers (immutable / stable; no data writes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_pl_cl_sl_type(p_mark text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN m IN ('PL', 'P/PL', 'LWP/PL') THEN 'PL'
    WHEN m IN ('CL', 'P/CL', 'LWP/CL') THEN 'CL'
    WHEN m IN ('SL', 'P/SL', 'LWP/SL') THEN 'SL'
    ELSE NULL
  END
  FROM (SELECT upper(btrim(coalesce(p_mark, ''))) AS m) s;
$$;

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_requires_raw_punch(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Present-based only. Do not treat PL / SPLA / PTL / etc. as P-based.
  SELECT
    m IN ('P', 'HD', 'P/SL', 'P/CL', 'P/PL', 'P/LWP')
    OR m LIKE 'P/%'
  FROM (SELECT upper(btrim(coalesce(p_mark, ''))) AS m) s;
$$;

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_is_birthday_anniversary_leave(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- SBEL (S BeL / birthday), SPLA / SPLB (anniversary / birthday special leaves).
  SELECT upper(btrim(coalesce(p_mark, ''))) IN ('SBEL', 'SPLA', 'SPLB');
$$;

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_is_leave_bridge(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(coalesce(p_mark, ''))) IN ('WO', 'NH/PH');
$$;

-- Walk calendar-adjacent days (across WO / NH/PH only) to find a neighboring
-- PL/CL/SL leave type. Stops on blank days or any other mark.
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

CREATE OR REPLACE FUNCTION public.admin_attendance_employee_has_raw_punch(
  p_employee_code text,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_attendance_punches p
    WHERE public.norm_emp_code(p.employee_code) = public.norm_emp_code(p_employee_code)
      AND p.punch_date = p_date
  );
$$;

-- ---------------------------------------------------------------------------
-- BEFORE INSERT OR UPDATE trigger — reject invalid mark writes only
-- ---------------------------------------------------------------------------

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
  -- Legacy / no-op friendly: only validate when the mark is new or changing.
  -- Does not rewrite or clear existing invalid rows.
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

  -- Rule 2: no raw punch → no Present-based marks (P, HD, P/SL, …)
  IF public.admin_attendance_mark_requires_raw_punch(NEW.mark) AND NOT v_has_punch THEN
    RAISE EXCEPTION
      'Present or half-day attendance (including P, Half Day, P/SL, P/CL, P/PL) requires a biometric punch on % for this employee.',
      to_char(NEW.register_date, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 3: Birthday / Anniversary leave requires raw punch (no advance apply)
  IF public.admin_attendance_mark_is_birthday_anniversary_leave(NEW.mark) AND NOT v_has_punch THEN
    RAISE EXCEPTION
      'Birthday or Anniversary leave requires a biometric punch on % and cannot be applied in advance without that punch.',
      to_char(NEW.register_date, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 1: PL / CL / SL must not be combined across consecutive dates
  v_new_type := public.admin_attendance_mark_pl_cl_sl_type(NEW.mark);
  IF v_new_type IS NOT NULL THEN
    v_prev_type := public.admin_attendance_neighbor_pl_cl_sl_type(
      NEW.employee_code,
      NEW.register_date,
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
      NEW.employee_code,
      NEW.register_date,
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

DROP TRIGGER IF EXISTS before_write_attendance_business_rules
  ON public.admin_attendance_register;

CREATE TRIGGER before_write_attendance_business_rules
  BEFORE INSERT OR UPDATE OF mark, employee_code, register_date
  ON public.admin_attendance_register
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_attendance_register_enforce_business_rules();

COMMENT ON FUNCTION public.admin_attendance_register_enforce_business_rules() IS
  'Enforces Daily Attendance Register business rules: no mixed PL/CL/SL on consecutive dates; P-based marks and Birthday/Anniversary leave require a raw punch. Does not modify existing rows.';

-- ---------------------------------------------------------------------------
-- Leave approval gate (additive): same rules before attendance is applied.
-- Does not replace admin_leave_request_status_changed / apply_attendance.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION indus_one.admin_leave_type_is_birthday_anniversary(p_leave_type_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, indus_one
SET row_security = off
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_leave_type_code, '')));
  v_mark text;
  v_label text;
BEGIN
  IF v_code = '' THEN
    RETURN false;
  END IF;

  IF v_code IN (
    'SBEL', 'SPLA', 'SPLB',
    'BL', 'AL',
    'BIRTHDAY', 'ANNIVERSARY',
    'BIRTHDAY LEAVE', 'ANNIVERSARY LEAVE',
    'BIRTH DAY', 'WEDDING ANNIVERSARY'
  ) THEN
    RETURN true;
  END IF;

  IF v_code LIKE '%BIRTHDAY%' OR v_code LIKE '%ANNIVERSARY%' THEN
    RETURN true;
  END IF;

  SELECT upper(btrim(coalesce(lt.label, '')))
  INTO v_label
  FROM public.hr_leave_types lt
  WHERE upper(btrim(lt.code)) = v_code
     OR upper(btrim(lt.label)) = v_code
  ORDER BY CASE WHEN upper(btrim(lt.code)) = v_code THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_label IS NOT NULL AND (
    v_label LIKE '%BIRTHDAY%' OR v_label LIKE '%ANNIVERSARY%'
  ) THEN
    RETURN true;
  END IF;

  v_mark := indus_one.admin_leave_primary_attendance_mark(p_leave_type_code);
  RETURN public.admin_attendance_mark_is_birthday_anniversary_leave(v_mark);
END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_request_enforce_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
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

  -- Only when becoming fully approved (attendance apply path).
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
      v_prev_type := public.admin_attendance_neighbor_pl_cl_sl_type(v_reg_code, v_date, -1);
      IF v_prev_type IS NOT NULL AND v_prev_type IS DISTINCT FROM v_type THEN
        RAISE EXCEPTION
          'Cannot combine different leave types on consecutive days: % next to existing %.',
          v_type,
          v_prev_type
          USING ERRCODE = 'check_violation';
      END IF;

      v_next_type := public.admin_attendance_neighbor_pl_cl_sl_type(v_reg_code, v_date, 1);
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
$$;

DROP TRIGGER IF EXISTS trg_admin_leave_request_business_rules
  ON indus_one.admin_leave_requests;

-- Name sorts before trg_admin_leave_request_status so validation runs first.
CREATE TRIGGER trg_admin_leave_request_business_rules
  BEFORE INSERT OR UPDATE OF status, overall_status ON indus_one.admin_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION indus_one.admin_leave_request_enforce_business_rules();

COMMENT ON FUNCTION indus_one.admin_leave_request_enforce_business_rules() IS
  'On leave approval, blocks Birthday/Anniversary leave without raw punch and mixed PL/CL/SL on consecutive dates. Does not modify request or register data by itself.';

NOTIFY pgrst, 'reload schema';

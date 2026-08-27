-- =============================================================================
-- Fix: manual Present (P) on Daily Register was rejected by Rule 2 even for HR
-- edits. Original examples target Half Day and P/* composites without a punch,
-- not HR manually marking plain Present (existing Admin Ops workflow).
--
-- DATA SAFETY: replaces validation functions/trigger body only — no row changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_requires_raw_punch(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- Half Day + Present/leave composites require a raw punch.
  -- Plain P / P(OD) stay allowed for manual HR marking (existing workflow).
  -- Do not treat PL / SPLA / PTL / etc. as Present-based.
  SELECT
    m IN ('HD', 'P/SL', 'P/CL', 'P/PL', 'P/LWP')
    OR m LIKE 'P/%'
  FROM (SELECT upper(btrim(coalesce(p_mark, ''))) AS m) s;
$$;

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

  -- Rule 2: no raw punch → no Half Day / P/* composites
  IF public.admin_attendance_mark_requires_raw_punch(NEW.mark) AND NOT v_has_punch THEN
    RAISE EXCEPTION
      'Half Day and Present+leave marks (P/SL, P/CL, P/PL) require a biometric punch on % for this employee.',
      to_char(NEW.register_date, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 3: Birthday / Anniversary leave requires raw punch
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

COMMENT ON FUNCTION public.admin_attendance_mark_requires_raw_punch(text) IS
  'True for HD and P/* composites that require a raw biometric punch. Plain P/P(OD) excluded so HR can mark Present manually.';

NOTIFY pgrst, 'reload schema';

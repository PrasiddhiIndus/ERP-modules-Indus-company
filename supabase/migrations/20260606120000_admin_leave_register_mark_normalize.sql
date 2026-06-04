-- Normalize leave attendance marks before writing admin_attendance_register.
-- Fixes mark_check violations when LMS leave_type / hr_leave_types.attendance_marks
-- use labels or legacy aliases (e.g. C/O, NHPH) not in admin_attendance_register_mark_check.

CREATE OR REPLACE FUNCTION indus_one.admin_leave_normalize_register_mark(p_mark text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_mark IS NULL OR btrim(p_mark) = '' THEN 'L'
    WHEN upper(btrim(p_mark)) IN ('NHPH', 'NH/PH') THEN 'NH/PH'
    WHEN upper(btrim(p_mark)) IN ('C/O', 'COMP OFF', 'COMPENSATORY OFF') THEN 'CO'
    WHEN upper(btrim(p_mark)) = 'P (OD)' THEN 'P(OD)'
    WHEN upper(btrim(p_mark)) IN (
      'P', 'P(OD)', 'T', 'L', 'WO', 'HD', 'WFH',
      'PL', 'CL', 'SL', 'SPLA', 'SPLB', 'SPLM', 'SBEL', 'CO', 'PTL', 'ML'
    ) THEN
      CASE upper(btrim(p_mark))
        WHEN 'P(OD)' THEN 'P(OD)'
        ELSE upper(btrim(p_mark))
      END
    WHEN upper(btrim(p_mark)) IN ('A', 'ABSENT', 'LEAVE') THEN 'L'
    WHEN upper(btrim(p_mark)) IN ('WEEK OFF', 'WEEKOFF') THEN 'WO'
    WHEN upper(btrim(p_mark)) IN ('HALF DAY', 'HALFDAY') THEN 'HD'
    WHEN upper(btrim(p_mark)) IN ('WORK FROM HOME', 'WFH') THEN 'WFH'
    ELSE 'L'
  END;
$$;

CREATE OR REPLACE FUNCTION indus_one.admin_leave_primary_attendance_mark(p_leave_type_code text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, indus_one
AS $$
  WITH resolved AS (
    SELECT lt.code, lt.label, (lt.attendance_marks)[1] AS attendance_mark
    FROM public.hr_leave_types lt
    WHERE upper(btrim(lt.code)) = upper(btrim(p_leave_type_code))
       OR upper(btrim(lt.label)) = upper(btrim(p_leave_type_code))
    ORDER BY CASE WHEN upper(btrim(lt.code)) = upper(btrim(p_leave_type_code)) THEN 0 ELSE 1 END
    LIMIT 1
  )
  SELECT indus_one.admin_leave_normalize_register_mark(
    coalesce(
      (SELECT r.code FROM resolved r),
      (
        SELECT indus_one.admin_leave_normalize_register_mark(r.attendance_mark)
        FROM resolved r
        WHERE upper(btrim(coalesce(r.attendance_mark, ''))) NOT IN ('L', 'LEAVE', 'A', '')
      ),
      indus_one.admin_leave_normalize_register_mark(p_leave_type_code)
    )
  );
$$;

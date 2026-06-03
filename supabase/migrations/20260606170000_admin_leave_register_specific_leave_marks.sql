-- On leave approval, write specific register marks (CL, PL, SL, …) not generic L when hr_leave_types.attendance_marks = L.

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

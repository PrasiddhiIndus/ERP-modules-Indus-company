-- Ensure NHPH legacy alias bridges PL/CL/SL consecutive-leave validation (WO / NH/PH / NHPH).

CREATE OR REPLACE FUNCTION public.admin_attendance_mark_is_leave_bridge(p_mark text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(coalesce(p_mark, ''))) IN ('WO', 'NH/PH', 'NHPH');
$$;

COMMENT ON FUNCTION public.admin_attendance_mark_is_leave_bridge(text) IS
  'Week-off and national/public holiday marks that bridge PL/CL/SL sequences without breaking them.';

NOTIFY pgrst, 'reload schema';

-- Allow LWP + half leave composites on the daily attendance register:
-- LWP/PL, LWP/SL, LWP/CL (present credit 0; 0.5 leave balance against PL/SL/CL).

ALTER TABLE public.admin_attendance_register
  DROP CONSTRAINT IF EXISTS admin_attendance_register_mark_check;

ALTER TABLE public.admin_attendance_register
  ADD CONSTRAINT admin_attendance_register_mark_check CHECK (
    mark IN (
      'P',
      'P(OD)',
      'T',
      'L',
      'WO',
      'NH/PH',
      'HD',
      'WFH',
      'PL',
      'CL',
      'SL',
      'SPLA',
      'SPLB',
      'SPLM',
      'SBEL',
      'CO',
      'PTL',
      'ML',
      'LWP',
      'Left',
      'P/SL',
      'P/CL',
      'P/PL',
      'LWP/PL',
      'LWP/SL',
      'LWP/CL'
    )
  );

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
    WHEN upper(btrim(p_mark)) IN ('P/SL', 'P/CL', 'P/PL', 'LWP/PL', 'LWP/SL', 'LWP/CL') THEN
      upper(btrim(p_mark))
    WHEN upper(btrim(p_mark)) IN (
      'P', 'P(OD)', 'T', 'L', 'WO', 'HD', 'WFH',
      'PL', 'CL', 'SL', 'SPLA', 'SPLB', 'SPLM', 'SBEL', 'CO', 'PTL', 'ML', 'LWP', 'LEFT'
    ) THEN
      CASE upper(btrim(p_mark))
        WHEN 'P(OD)' THEN 'P(OD)'
        WHEN 'LEFT' THEN 'Left'
        ELSE upper(btrim(p_mark))
      END
    WHEN upper(btrim(p_mark)) IN ('A', 'ABSENT', 'LEAVE') THEN 'L'
    WHEN upper(btrim(p_mark)) IN ('WEEK OFF', 'WEEKOFF') THEN 'WO'
    WHEN upper(btrim(p_mark)) IN ('HALF DAY', 'HALFDAY') THEN 'HD'
    WHEN upper(btrim(p_mark)) IN ('WORK FROM HOME', 'WFH') THEN 'WFH'
    ELSE 'L'
  END;
$$;

NOTIFY pgrst, 'reload schema';

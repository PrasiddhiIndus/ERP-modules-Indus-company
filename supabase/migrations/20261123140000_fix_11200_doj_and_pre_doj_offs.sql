-- =============================================================================
-- Fix employee 11200 Date of Joining (was 2026-11-20; correct is 2026-11-23).
-- With the wrong DOJ, 21 Nov (3rd Saturday) and 22 Nov (Sunday) WO correctly
-- passed the pre-DOJ exclusion filter — root cause was master data, not the
-- attendance engine.
--
-- Also clears any WO / NH·PH rows still stored before each employee's DOJ.
-- Does not change marks on/after DOJ.
-- Rollback: supabase/rollbacks/20261123140000_fix_11200_doj_and_pre_doj_offs_down.sql
-- =============================================================================

UPDATE public.admin_ifsp_employee_master
SET date_of_joining = date '2026-11-23'
WHERE public.normalize_attendance_employee_code(employee_code)
    = public.normalize_attendance_employee_code('11200')
  AND date_of_joining IS DISTINCT FROM date '2026-11-23';

DELETE FROM public.admin_attendance_register r
USING public.admin_ifsp_employee_master m
WHERE public.normalize_attendance_employee_code(m.employee_code)
    = public.normalize_attendance_employee_code(r.employee_code)
  AND m.date_of_joining IS NOT NULL
  AND r.register_date < m.date_of_joining
  AND (
    r.mark = 'WO'
    OR r.mark IN ('NH/PH', 'NHPH')
    OR coalesce(r.mark_source, '') IN ('auto_wo', 'auto_holiday')
  );

NOTIFY pgrst, 'reload schema';

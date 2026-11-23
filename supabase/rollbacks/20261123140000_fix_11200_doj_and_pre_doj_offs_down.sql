-- Restore previous DOJ for 11200 only. Pre-DOJ offs are not recreated here
-- (auto WO/NH sync regenerates valid offs on/after DOJ).

UPDATE public.admin_ifsp_employee_master
SET date_of_joining = date '2026-11-20'
WHERE public.normalize_attendance_employee_code(employee_code)
    = public.normalize_attendance_employee_code('11200')
  AND date_of_joining = date '2026-11-23';

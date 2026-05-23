-- Optional: remove strict FK if you must save marks before every employee_code is on master.
-- Prefer fixing Employee Master instead (see query below).

-- Orphan register codes (not on employee master):
-- select distinct r.employee_code
-- from public.admin_attendance_register r
-- left join public.admin_ifsp_employee_master m on m.employee_code = r.employee_code
-- where m.employee_code is null;

-- Active employees missing employee_code (hidden from register grid):
-- select employee_id, full_name, employee_code
-- from public.admin_ifsp_employee_master
-- where status = 'Active'
--   and (employee_code is null or btrim(employee_code) = '');

alter table public.admin_attendance_register
  drop constraint if exists admin_attendance_register_employee_code_fkey;

alter table public.erp_attendance_punches
  drop constraint if exists erp_attendance_punches_employee_code_fkey;

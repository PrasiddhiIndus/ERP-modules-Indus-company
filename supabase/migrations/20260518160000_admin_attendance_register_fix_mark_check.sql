-- Repair: normalize all marks, then apply check (run in SQL Editor if 23514 occurred).
-- Safe to run multiple times.

alter table public.admin_attendance_register
  drop constraint if exists admin_attendance_register_mark_check;

update public.admin_attendance_register
set mark = 'NH/PH', updated_at = now()
where mark in ('NHPH', 'nhph');

update public.admin_attendance_register
set mark = 'L', updated_at = now()
where mark in ('A', 'PL', 'SL', 'CL', 'HD');

update public.admin_attendance_register
set mark = 'L', updated_at = now()
where mark is not null
  and mark not in ('P', 'L', 'WO', 'NH/PH');

alter table public.admin_attendance_register
  add constraint admin_attendance_register_mark_check check (
    mark in ('P', 'L', 'WO', 'NH/PH')
  );

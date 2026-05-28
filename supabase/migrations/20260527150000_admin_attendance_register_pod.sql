-- Present on duty (P(OD)) with optional cell remark for daily attendance register.

alter table public.admin_attendance_register
  add column if not exists mark_remark text;

comment on column public.admin_attendance_register.mark_remark is
  'Remarks for P(OD) marks (Excel-style comment); null for other marks.';

alter table public.admin_attendance_register
  drop constraint if exists admin_attendance_register_mark_check;

alter table public.admin_attendance_register
  add constraint admin_attendance_register_mark_check check (
    mark in ('P', 'P(OD)', 'L', 'WO', 'NH/PH')
  );

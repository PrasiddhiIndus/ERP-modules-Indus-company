-- HD, WFH, and granular leave type codes for daily attendance register.

alter table public.admin_attendance_register
  drop constraint if exists admin_attendance_register_mark_check;

alter table public.admin_attendance_register
  add constraint admin_attendance_register_mark_check check (
    mark in (
      'P',
      'P(OD)',
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
      'ML'
    )
  );

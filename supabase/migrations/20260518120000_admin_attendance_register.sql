-- Daily attendance register marks (manual + overrides) for payroll / salary calculation.
-- Present from raw punches is derived at read time; stored rows are explicit marks (P, A, L, WO, …).

create table if not exists public.admin_attendance_register (
  id uuid primary key default gen_random_uuid(),
  emp_code text not null,
  register_date date not null,
  month_key text not null,
  mark text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_attendance_register_emp_date_unique unique (emp_code, register_date),
  constraint admin_attendance_register_mark_check check (
    mark in ('P', 'A', 'L', 'WO', 'NHPH', 'HD', 'PL', 'SL', 'CL')
  )
);

create index if not exists admin_attendance_register_month_idx
  on public.admin_attendance_register (month_key, emp_code);

create index if not exists admin_attendance_register_emp_date_idx
  on public.admin_attendance_register (emp_code, register_date desc);

alter table public.admin_attendance_register enable row level security;

drop policy if exists "admin_attendance_register_select_authenticated" on public.admin_attendance_register;
drop policy if exists "admin_attendance_register_insert_authenticated" on public.admin_attendance_register;
drop policy if exists "admin_attendance_register_update_authenticated" on public.admin_attendance_register;
drop policy if exists "admin_attendance_register_delete_authenticated" on public.admin_attendance_register;

create policy "admin_attendance_register_select_authenticated"
  on public.admin_attendance_register for select
  to authenticated
  using (true);

create policy "admin_attendance_register_insert_authenticated"
  on public.admin_attendance_register for insert
  to authenticated
  with check (true);

create policy "admin_attendance_register_update_authenticated"
  on public.admin_attendance_register for update
  to authenticated
  using (true)
  with check (true);

create policy "admin_attendance_register_delete_authenticated"
  on public.admin_attendance_register for delete
  to authenticated
  using (true);

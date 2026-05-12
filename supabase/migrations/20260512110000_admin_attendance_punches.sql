-- Admin attendance punch cache populated from eTimeOffice DownloadPunchData.
-- Run via `supabase db push` or paste into Dashboard -> SQL Editor.

create table if not exists public.erp_attendance_punches (
  id uuid primary key default gen_random_uuid(),
  punch_key text not null unique,
  emp_code text not null default '',
  employee_name text,
  punch_date date,
  punch_time time,
  device_name text,
  direction text,
  status text,
  source text not null default 'eTimeOffice',
  source_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_attendance_punches_emp_date_idx
  on public.erp_attendance_punches (emp_code, punch_date desc);

create index if not exists erp_attendance_punches_synced_at_idx
  on public.erp_attendance_punches (synced_at desc);

alter table public.erp_attendance_punches enable row level security;

drop policy if exists "erp_attendance_punches_select_authenticated" on public.erp_attendance_punches;
drop policy if exists "erp_attendance_punches_insert_authenticated" on public.erp_attendance_punches;
drop policy if exists "erp_attendance_punches_update_authenticated" on public.erp_attendance_punches;
drop policy if exists "erp_attendance_punches_delete_authenticated" on public.erp_attendance_punches;

create policy "erp_attendance_punches_select_authenticated"
  on public.erp_attendance_punches for select
  to authenticated
  using (true);

create policy "erp_attendance_punches_insert_authenticated"
  on public.erp_attendance_punches for insert
  to authenticated
  with check (true);

create policy "erp_attendance_punches_update_authenticated"
  on public.erp_attendance_punches for update
  to authenticated
  using (true)
  with check (true);

create policy "erp_attendance_punches_delete_authenticated"
  on public.erp_attendance_punches for delete
  to authenticated
  using (true);

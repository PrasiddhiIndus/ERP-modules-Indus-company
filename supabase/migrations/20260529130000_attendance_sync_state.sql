-- Tracks overlap-based eTimeOffice → erp_attendance_punches sync (server cron / POST /api/admin/attendance/sync).

create table if not exists public.erp_attendance_sync_state (
  id smallint primary key default 1 check (id = 1),
  last_sync_started_at timestamptz,
  last_sync_ended_at timestamptz,
  last_sync_from_date date,
  last_sync_to_date date,
  last_sync_record_count integer,
  last_sync_api_count integer,
  last_sync_error text,
  updated_at timestamptz not null default now()
);

comment on table public.erp_attendance_sync_state is
  'Singleton row for eTimeOffice attendance overlap sync cursor and last run stats.';

alter table public.erp_attendance_sync_state enable row level security;

drop policy if exists "erp_attendance_sync_state_select_authenticated" on public.erp_attendance_sync_state;
drop policy if exists "erp_attendance_sync_state_all_service" on public.erp_attendance_sync_state;

create policy "erp_attendance_sync_state_select_authenticated"
  on public.erp_attendance_sync_state for select
  to authenticated
  using (true);

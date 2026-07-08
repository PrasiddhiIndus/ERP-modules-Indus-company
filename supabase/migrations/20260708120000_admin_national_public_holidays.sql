-- National / Public holidays master for Admin Employee Administration.
-- Dates configured here auto-sync as NH/PH marks on the daily attendance register.

create table if not exists public.admin_national_public_holidays (
  id uuid primary key default gen_random_uuid(),
  sr_no integer,
  holiday_date date not null,
  calendar_year integer not null,
  holiday_type text not null,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_national_public_holidays_date_unique unique (holiday_date),
  constraint admin_national_public_holidays_type_check check (holiday_type in ('NH', 'PH'))
);

create index if not exists admin_national_public_holidays_year_idx
  on public.admin_national_public_holidays (calendar_year, holiday_date);

alter table public.admin_national_public_holidays enable row level security;

drop policy if exists "admin_national_public_holidays_select_authenticated"
  on public.admin_national_public_holidays;
drop policy if exists "admin_national_public_holidays_insert_authenticated"
  on public.admin_national_public_holidays;
drop policy if exists "admin_national_public_holidays_update_authenticated"
  on public.admin_national_public_holidays;
drop policy if exists "admin_national_public_holidays_delete_authenticated"
  on public.admin_national_public_holidays;

create policy "admin_national_public_holidays_select_authenticated"
  on public.admin_national_public_holidays for select
  to authenticated
  using (true);

create policy "admin_national_public_holidays_insert_authenticated"
  on public.admin_national_public_holidays for insert
  to authenticated
  with check (true);

create policy "admin_national_public_holidays_update_authenticated"
  on public.admin_national_public_holidays for update
  to authenticated
  using (true)
  with check (true);

create policy "admin_national_public_holidays_delete_authenticated"
  on public.admin_national_public_holidays for delete
  to authenticated
  using (true);

comment on table public.admin_national_public_holidays is
  'National and public holiday calendar; synced to admin_attendance_register as NH/PH.';

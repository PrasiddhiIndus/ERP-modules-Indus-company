-- Leave Management (carry forward + PL encashment) in `indus_one` schema.

create schema if not exists indus_one;

grant usage on schema indus_one to anon, authenticated, service_role;

-- Single-row carry forward configuration.
create table if not exists indus_one.leave_carry_forward_rules (
  id int primary key default 1,
  pl_carry_forward_max numeric not null default 7,
  sl_carry_forward_max numeric not null default 8,
  cl_carry_forward_max numeric not null default 0,
  updated_at timestamptz not null default now()
);

insert into indus_one.leave_carry_forward_rules (id)
values (1)
on conflict (id) do nothing;

-- Employee preference: encash PL instead of carrying it forward.
create table if not exists indus_one.employee_pl_encash_pref (
  emp_code text primary key,
  encash_pl_on_carry_forward boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Yearly computed balances (opening + entitlement - used, then carry/expire).
create table if not exists indus_one.employee_leave_balances_yearly (
  emp_code text not null,
  year int not null,
  opening_pl numeric not null default 0,
  opening_sl numeric not null default 0,
  opening_cl numeric not null default 0,
  pl_entitlement numeric not null default 18,
  sl_entitlement numeric not null default 8,
  cl_entitlement numeric not null default 8,
  used_pl numeric not null default 0,
  used_sl numeric not null default 0,
  used_cl numeric not null default 0,
  unused_pl numeric not null default 0,
  unused_sl numeric not null default 0,
  unused_cl numeric not null default 0,
  carried_pl numeric not null default 0,
  carried_sl numeric not null default 0,
  carried_cl numeric not null default 0,
  expired_pl numeric not null default 0,
  expired_sl numeric not null default 0,
  expired_cl numeric not null default 0,
  encashed_pl numeric not null default 0,
  processed_at timestamptz not null default now(),
  primary key (emp_code, year)
);

grant select, insert, update, delete on all tables in schema indus_one to authenticated, service_role;
grant select on all tables in schema indus_one to anon;
alter default privileges in schema indus_one
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema indus_one
  grant select on tables to anon;

create index if not exists employee_leave_balances_yearly_year_idx
  on indus_one.employee_leave_balances_yearly (year);

alter table indus_one.leave_carry_forward_rules enable row level security;
alter table indus_one.employee_pl_encash_pref enable row level security;
alter table indus_one.employee_leave_balances_yearly enable row level security;

drop policy if exists "leave_carry_forward_rules_select_authenticated" on indus_one.leave_carry_forward_rules;
drop policy if exists "leave_carry_forward_rules_write_authenticated" on indus_one.leave_carry_forward_rules;

create policy "leave_carry_forward_rules_select_authenticated"
  on indus_one.leave_carry_forward_rules for select
  to authenticated using (true);

create policy "leave_carry_forward_rules_write_authenticated"
  on indus_one.leave_carry_forward_rules for all
  to authenticated using (true)
  with check (true);

drop policy if exists "employee_pl_encash_pref_select_authenticated" on indus_one.employee_pl_encash_pref;
drop policy if exists "employee_pl_encash_pref_write_authenticated" on indus_one.employee_pl_encash_pref;

create policy "employee_pl_encash_pref_select_authenticated"
  on indus_one.employee_pl_encash_pref for select
  to authenticated using (true);

create policy "employee_pl_encash_pref_write_authenticated"
  on indus_one.employee_pl_encash_pref for all
  to authenticated using (true)
  with check (true);

drop policy if exists "employee_leave_balances_yearly_select_authenticated" on indus_one.employee_leave_balances_yearly;
drop policy if exists "employee_leave_balances_yearly_write_authenticated" on indus_one.employee_leave_balances_yearly;

create policy "employee_leave_balances_yearly_select_authenticated"
  on indus_one.employee_leave_balances_yearly for select
  to authenticated using (true);

create policy "employee_leave_balances_yearly_write_authenticated"
  on indus_one.employee_leave_balances_yearly for all
  to authenticated using (true)
  with check (true);


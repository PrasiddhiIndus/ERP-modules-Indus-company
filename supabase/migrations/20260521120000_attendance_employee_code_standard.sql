-- Standardize attendance joins on employee_code (eTimeOffice / raw punch code), not employee_id.
-- Renames emp_code → employee_code and links punches + register to employee master.

-- Canonical format: trim; numeric-only codes drop leading zeros (09750 → 9750).
create or replace function public.normalize_attendance_employee_code(raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
  n bigint;
begin
  s := btrim(coalesce(raw, ''));
  if s = '' then
    return '';
  end if;
  if s ~ '^[0-9]+$' then
    n := s::bigint;
    return n::text;
  end if;
  return s;
end;
$$;

comment on function public.normalize_attendance_employee_code(text) is
  'Attendance join key: trim; numeric codes stored without leading zeros.';

-- ---------------------------------------------------------------------------
-- Employee master: emp_code → employee_code (source of truth for attendance)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_ifsp_employee_master'
      and column_name = 'emp_code'
  ) then
    alter table public.admin_ifsp_employee_master rename column emp_code to employee_code;
  end if;
end;
$$;

update public.admin_ifsp_employee_master
set employee_code = public.normalize_attendance_employee_code(employee_code)
where employee_code is not null;

-- Empty codes → NULL (UNIQUE allows multiple NULLs; FK only matches non-null codes).
update public.admin_ifsp_employee_master
set employee_code = null
where employee_code is not null and btrim(employee_code) = '';

-- One master row per employee_code (keep lowest id); clear duplicate codes.
with dups as (
  select employee_code, min(id) as keep_id
  from public.admin_ifsp_employee_master
  where employee_code is not null
  group by employee_code
  having count(*) > 1
)
update public.admin_ifsp_employee_master m
set employee_code = null
from dups d
where m.employee_code = d.employee_code
  and m.id <> d.keep_id;

drop index if exists public.admin_ifsp_employee_master_employee_code_unique;

alter table public.admin_ifsp_employee_master
  drop constraint if exists admin_ifsp_employee_master_employee_code_key;

alter table public.admin_ifsp_employee_master
  add constraint admin_ifsp_employee_master_employee_code_key unique (employee_code);

comment on column public.admin_ifsp_employee_master.employee_code is
  'eTimeOffice / device punch code; join key for erp_attendance_punches and admin_attendance_register. Not the system employee_id.';

-- ---------------------------------------------------------------------------
-- Raw punches
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_attendance_punches'
      and column_name = 'emp_code'
  ) then
    alter table public.erp_attendance_punches rename column emp_code to employee_code;
  end if;
end;
$$;

update public.erp_attendance_punches
set employee_code = public.normalize_attendance_employee_code(employee_code);

delete from public.erp_attendance_punches
where btrim(employee_code) = '';

drop index if exists public.erp_attendance_punches_emp_date_idx;

create index erp_attendance_punches_employee_code_date_idx
  on public.erp_attendance_punches (employee_code, punch_date desc);

alter table public.erp_attendance_punches
  alter column employee_code set default '',
  alter column employee_code set not null;

-- ---------------------------------------------------------------------------
-- Daily register marks
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_attendance_register'
      and column_name = 'emp_code'
  ) then
    alter table public.admin_attendance_register rename column emp_code to employee_code;
  end if;
end;
$$;

update public.admin_attendance_register
set employee_code = public.normalize_attendance_employee_code(employee_code);

delete from public.admin_attendance_register
where btrim(employee_code) = '';

alter table public.admin_attendance_register
  drop constraint if exists admin_attendance_register_emp_date_unique;

alter table public.admin_attendance_register
  add constraint admin_attendance_register_employee_code_date_unique
  unique (employee_code, register_date);

drop index if exists public.admin_attendance_register_month_idx;
drop index if exists public.admin_attendance_register_emp_date_idx;

create index admin_attendance_register_month_employee_code_idx
  on public.admin_attendance_register (month_key, employee_code);

create index admin_attendance_register_employee_code_date_idx
  on public.admin_attendance_register (employee_code, register_date desc);

-- ---------------------------------------------------------------------------
-- Foreign keys: attendance rows → employee master by employee_code
-- ---------------------------------------------------------------------------
alter table public.erp_attendance_punches
  drop constraint if exists erp_attendance_punches_employee_code_fkey;

alter table public.admin_attendance_register
  drop constraint if exists admin_attendance_register_employee_code_fkey;

alter table public.erp_attendance_punches
  add constraint erp_attendance_punches_employee_code_fkey
  foreign key (employee_code)
  references public.admin_ifsp_employee_master (employee_code)
  on update cascade
  on delete restrict
  not valid;

alter table public.admin_attendance_register
  add constraint admin_attendance_register_employee_code_fkey
  foreign key (employee_code)
  references public.admin_ifsp_employee_master (employee_code)
  on update cascade
  on delete restrict
  not valid;

-- Validate only when every code exists on master (skip if legacy orphans remain).
do $$
begin
  if not exists (
    select 1
    from public.erp_attendance_punches p
    where not exists (
      select 1
      from public.admin_ifsp_employee_master m
      where m.employee_code = p.employee_code
    )
  ) then
    alter table public.erp_attendance_punches
      validate constraint erp_attendance_punches_employee_code_fkey;
  end if;

  if not exists (
    select 1
    from public.admin_attendance_register r
    where not exists (
      select 1
      from public.admin_ifsp_employee_master m
      where m.employee_code = r.employee_code
    )
  ) then
    alter table public.admin_attendance_register
      validate constraint admin_attendance_register_employee_code_fkey;
  end if;
end;
$$;

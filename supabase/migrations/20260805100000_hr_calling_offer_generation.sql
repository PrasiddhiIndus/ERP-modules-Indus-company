-- Offer Generation for Calling Database (Selected candidates).
-- Adds offer detail columns, sequence counters, and atomic allocation RPC.

-- ---------------------------------------------------------------------------
-- Candidate offer fields
-- ---------------------------------------------------------------------------
alter table public.hr_calling_candidates
  add column if not exists father_name text not null default '',
  add column if not exists address_line text not null default '',
  add column if not exists address_district text not null default '',
  add column if not exists address_state text not null default '',
  add column if not exists address_pincode text not null default '',
  add column if not exists duty_pattern text not null default '',
  add column if not exists site_full_name text not null default '',
  add column if not exists site_code text not null default '',
  add column if not exists employee_code text not null default '',
  add column if not exists offer_reference_no text not null default '',
  add column if not exists offer_generated_at timestamptz,
  add column if not exists offer_salutation text not null default 'Mr.';

comment on column public.hr_calling_candidates.father_name is
  'Father name for Offer of Employment letter.';
comment on column public.hr_calling_candidates.duty_pattern is
  'Duty pattern days for offer letter: 26 or 27.';
comment on column public.hr_calling_candidates.site_full_name is
  'Full site name and location text used on the offer letter.';
comment on column public.hr_calling_candidates.site_code is
  'Short site code used in offer reference number (e.g. NMDC).';
comment on column public.hr_calling_candidates.employee_code is
  'Auto-assigned sequential employee code on first offer generation; never reused.';
comment on column public.hr_calling_candidates.offer_reference_no is
  'Offer letter reference: IFSPL/HR/<SiteCode>/OL/<Year>/<Seq>.';
comment on column public.hr_calling_candidates.offer_status is
  'Offer workflow: empty/Not Generated/Generated.';

alter table public.hr_calling_candidates
  drop constraint if exists hr_calling_candidates_duty_pattern_check;

alter table public.hr_calling_candidates
  add constraint hr_calling_candidates_duty_pattern_check
  check (duty_pattern = '' or duty_pattern in ('26', '27'));

alter table public.hr_calling_candidates
  drop constraint if exists hr_calling_candidates_offer_salutation_check;

alter table public.hr_calling_candidates
  add constraint hr_calling_candidates_offer_salutation_check
  check (offer_salutation in ('Mr.', 'Ms.', 'Mrs.'));

-- Unique employee codes among rows that have one (never reuse).
create unique index if not exists hr_calling_candidates_employee_code_uidx
  on public.hr_calling_candidates (employee_code)
  where employee_code <> '';

create unique index if not exists hr_calling_candidates_offer_ref_uidx
  on public.hr_calling_candidates (offer_reference_no)
  where offer_reference_no <> '';

create index if not exists hr_calling_candidates_hiring_offer_idx
  on public.hr_calling_candidates (hiring_status, offer_status)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- Sequence counters (employee code global; offer ref per site+year)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_calling_offer_counters (
  counter_key text primary key,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.hr_calling_offer_counters is
  'Atomic counters for Calling offer employee codes (key=employee_code) and reference sequences (key=ref:<SITE>:<YEAR>).';

alter table public.hr_calling_offer_counters enable row level security;

drop policy if exists "hr_calling_offer_counters_select" on public.hr_calling_offer_counters;
drop policy if exists "hr_calling_offer_counters_insert" on public.hr_calling_offer_counters;
drop policy if exists "hr_calling_offer_counters_update" on public.hr_calling_offer_counters;

create policy "hr_calling_offer_counters_select"
  on public.hr_calling_offer_counters for select to authenticated
  using (public.current_user_can_access_module('hr'));

create policy "hr_calling_offer_counters_insert"
  on public.hr_calling_offer_counters for insert to authenticated
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_offer_counters_update"
  on public.hr_calling_offer_counters for update to authenticated
  using (public.current_user_can_access_module('hr'))
  with check (public.current_user_can_access_module('hr'));

grant select, insert, update on public.hr_calling_offer_counters to authenticated;

-- Seed employee_code counter from existing numeric codes (offer + employee master) when missing.
do $$
declare
  max_code bigint := 0;
  master_max bigint := 0;
  offer_max bigint := 0;
begin
  begin
    select coalesce(max(nullif(regexp_replace(trim(employee_code), '[^0-9]', '', 'g'), '')::bigint), 0)
      into master_max
    from public.admin_ifsp_employee_master
    where coalesce(trim(employee_code), '') <> ''
      and trim(employee_code) ~ '^[0-9]+$';
  exception
    when undefined_table then
      master_max := 0;
  end;

  select coalesce(max(nullif(regexp_replace(trim(employee_code), '[^0-9]', '', 'g'), '')::bigint), 0)
    into offer_max
  from public.hr_calling_candidates
  where coalesce(trim(employee_code), '') <> ''
    and trim(employee_code) ~ '^[0-9]+$';

  max_code := greatest(master_max, offer_max);

  insert into public.hr_calling_offer_counters (counter_key, last_value)
  values ('employee_code', max_code)
  on conflict (counter_key) do update
  set last_value = greatest(public.hr_calling_offer_counters.last_value, excluded.last_value),
      updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Allocate employee code + reference number (idempotent if already assigned)
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_allocate_offer_codes(
  p_candidate_id uuid,
  p_site_code text,
  p_year integer default null
)
returns table (
  employee_code text,
  offer_reference_no text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site text;
  v_year integer;
  v_emp text;
  v_ref text;
  v_emp_next bigint;
  v_ref_next bigint;
  v_ref_key text;
  v_row public.hr_calling_candidates%rowtype;
begin
  if p_candidate_id is null then
    raise exception 'Candidate is required.';
  end if;

  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  select * into v_row
  from public.hr_calling_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'Candidate not found.';
  end if;

  if v_row.is_active is not true then
    raise exception 'Candidate is inactive.';
  end if;

  v_site := upper(nullif(btrim(coalesce(p_site_code, v_row.site_code, '')), ''));
  if v_site is null then
    raise exception 'Site code is required for the offer reference number.';
  end if;

  v_year := coalesce(
    p_year,
    extract(year from timezone('Asia/Kolkata', now()))::integer
  );

  v_emp := nullif(btrim(coalesce(v_row.employee_code, '')), '');
  v_ref := nullif(btrim(coalesce(v_row.offer_reference_no, '')), '');

  if v_emp is null then
    insert into public.hr_calling_offer_counters (counter_key, last_value)
    values ('employee_code', 0)
    on conflict (counter_key) do nothing;

    update public.hr_calling_offer_counters
    set last_value = last_value + 1,
        updated_at = now()
    where counter_key = 'employee_code'
    returning last_value into v_emp_next;

    v_emp := v_emp_next::text;
  end if;

  if v_ref is null then
    v_ref_key := 'ref:' || v_site || ':' || v_year::text;

    insert into public.hr_calling_offer_counters (counter_key, last_value)
    values (v_ref_key, 0)
    on conflict (counter_key) do nothing;

    update public.hr_calling_offer_counters
    set last_value = last_value + 1,
        updated_at = now()
    where counter_key = v_ref_key
    returning last_value into v_ref_next;

    v_ref := format(
      'IFSPL/HR/%s/OL/%s/%s',
      v_site,
      v_year::text,
      lpad(v_ref_next::text, 4, '0')
    );
  end if;

  update public.hr_calling_candidates
  set
    employee_code = v_emp,
    offer_reference_no = v_ref,
    site_code = v_site,
    offer_status = 'Generated',
    offer_generated_at = coalesce(offer_generated_at, now()),
    updated_at = now()
  where id = p_candidate_id;

  employee_code := v_emp;
  offer_reference_no := v_ref;
  return next;
end;
$$;

revoke all on function public.hr_calling_allocate_offer_codes(uuid, text, integer) from public;
grant execute on function public.hr_calling_allocate_offer_codes(uuid, text, integer) to authenticated;

comment on function public.hr_calling_allocate_offer_codes(uuid, text, integer) is
  'Assigns sequential employee_code (global, never reused) and IFSPL/HR/<Site>/OL/<Year>/<Seq> reference on first offer generation.';

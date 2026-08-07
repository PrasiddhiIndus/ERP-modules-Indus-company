-- Post-offer recruitment workflow: Offer Response → Joining → IOM → Employee Master conversion.
-- Additive only — does not alter Calling → Shortlisted → Selected → Offer Generated flow.
-- Declined / Expired / No-show release allocated employee codes and offer references for reuse.

-- ---------------------------------------------------------------------------
-- Candidate post-offer columns
-- ---------------------------------------------------------------------------
alter table public.hr_calling_candidates
  add column if not exists offer_responded_at timestamptz,
  add column if not exists joining_status text not null default '',
  add column if not exists joining_checklist jsonb not null default '{}'::jsonb,
  add column if not exists actual_joining_date date,
  add column if not exists no_show_flagged_at timestamptz,
  add column if not exists iom_status text not null default '',
  add column if not exists iom_reference_no text not null default '',
  add column if not exists iom_generated_at timestamptz,
  add column if not exists iom_departments jsonb not null default '["IT","Admin","Payroll","Site","Accounts"]'::jsonb,
  add column if not exists conversion_status text not null default '',
  add column if not exists employee_master_id bigint,
  add column if not exists converted_at timestamptz;

comment on column public.hr_calling_candidates.offer_status is
  'Offer workflow: Not Generated / Generated / Accepted / Declined / Expired.';
comment on column public.hr_calling_candidates.offer_responded_at is
  'When HR recorded Accepted / Declined / Expired (or auto-expire).';
comment on column public.hr_calling_candidates.joining_status is
  'Joining workflow: empty / Pending / Joined / No-show.';
comment on column public.hr_calling_candidates.joining_checklist is
  'Fixed pre-joining checklist flags (aadhaar, pan, photo, bankDetails, educationCertificates, policeVerification).';
comment on column public.hr_calling_candidates.actual_joining_date is
  'Actual date the candidate joined (set when marked Joined).';
comment on column public.hr_calling_candidates.iom_status is
  'IOM workflow: empty / Issued.';
comment on column public.hr_calling_candidates.iom_reference_no is
  'IOM reference: IFSPL/HR/<SiteCode>/IOM/<Year>/<Seq>.';
comment on column public.hr_calling_candidates.iom_departments is
  'Departments notified on IOM (default IT, Admin, Payroll, Site, Accounts).';
comment on column public.hr_calling_candidates.conversion_status is
  'Employee Master conversion: empty / Converted.';
comment on column public.hr_calling_candidates.employee_master_id is
  'admin_ifsp_employee_master.id created from this candidate.';

alter table public.hr_calling_candidates
  drop constraint if exists hr_calling_candidates_joining_status_check;

alter table public.hr_calling_candidates
  add constraint hr_calling_candidates_joining_status_check
  check (joining_status = '' or joining_status in ('Pending', 'Joined', 'No-show'));

alter table public.hr_calling_candidates
  drop constraint if exists hr_calling_candidates_iom_status_check;

alter table public.hr_calling_candidates
  add constraint hr_calling_candidates_iom_status_check
  check (iom_status = '' or iom_status in ('Issued'));

alter table public.hr_calling_candidates
  drop constraint if exists hr_calling_candidates_conversion_status_check;

alter table public.hr_calling_candidates
  add constraint hr_calling_candidates_conversion_status_check
  check (conversion_status = '' or conversion_status in ('Converted'));

create unique index if not exists hr_calling_candidates_iom_ref_uidx
  on public.hr_calling_candidates (iom_reference_no)
  where iom_reference_no <> '';

create index if not exists hr_calling_candidates_offer_response_idx
  on public.hr_calling_candidates (offer_status, joining_status, iom_status, conversion_status)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- Settings (e.g. offer expiry days)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_calling_settings (
  setting_key text primary key,
  setting_value text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.hr_calling_settings is
  'Calling Database settings (offer_expiry_days, etc.).';

alter table public.hr_calling_settings enable row level security;

drop policy if exists "hr_calling_settings_select" on public.hr_calling_settings;
drop policy if exists "hr_calling_settings_upsert" on public.hr_calling_settings;

create policy "hr_calling_settings_select"
  on public.hr_calling_settings for select to authenticated
  using (public.current_user_can_access_module('hr'));

create policy "hr_calling_settings_insert"
  on public.hr_calling_settings for insert to authenticated
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_settings_update"
  on public.hr_calling_settings for update to authenticated
  using (public.current_user_can_access_module('hr'))
  with check (public.current_user_can_access_module('hr'));

grant select, insert, update on public.hr_calling_settings to authenticated;

insert into public.hr_calling_settings (setting_key, setting_value)
values ('offer_expiry_days', '7')
on conflict (setting_key) do nothing;

-- ---------------------------------------------------------------------------
-- Reusable pools for freed employee codes / offer references
-- ---------------------------------------------------------------------------
create table if not exists public.hr_calling_reusable_employee_codes (
  employee_code text primary key,
  freed_at timestamptz not null default now(),
  freed_from_candidate_id uuid,
  reason text not null default ''
);

create table if not exists public.hr_calling_reusable_offer_refs (
  offer_reference_no text primary key,
  site_code text not null default '',
  year_value integer,
  freed_at timestamptz not null default now(),
  freed_from_candidate_id uuid,
  reason text not null default ''
);

comment on table public.hr_calling_reusable_employee_codes is
  'Employee codes freed when offer Declined/Expired or joining No-show; preferred on next allocate.';
comment on table public.hr_calling_reusable_offer_refs is
  'Offer reference numbers freed for reuse on Declined/Expired/No-show.';

alter table public.hr_calling_reusable_employee_codes enable row level security;
alter table public.hr_calling_reusable_offer_refs enable row level security;

drop policy if exists "hr_calling_reusable_emp_select" on public.hr_calling_reusable_employee_codes;
drop policy if exists "hr_calling_reusable_ref_select" on public.hr_calling_reusable_offer_refs;

create policy "hr_calling_reusable_emp_select"
  on public.hr_calling_reusable_employee_codes for select to authenticated
  using (public.current_user_can_access_module('hr'));

create policy "hr_calling_reusable_ref_select"
  on public.hr_calling_reusable_offer_refs for select to authenticated
  using (public.current_user_can_access_module('hr'));

grant select on public.hr_calling_reusable_employee_codes to authenticated;
grant select on public.hr_calling_reusable_offer_refs to authenticated;

-- ---------------------------------------------------------------------------
-- Release allocated codes (Declined / Expired / No-show)
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_release_offer_codes(
  p_candidate_id uuid,
  p_reason text default 'released'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hr_calling_candidates%rowtype;
  v_emp text;
  v_ref text;
  v_site text;
  v_year integer;
  v_parts text[];
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

  v_emp := nullif(btrim(coalesce(v_row.employee_code, '')), '');
  v_ref := nullif(btrim(coalesce(v_row.offer_reference_no, '')), '');

  if v_emp is not null then
    insert into public.hr_calling_reusable_employee_codes (
      employee_code, freed_from_candidate_id, reason
    )
    values (v_emp, p_candidate_id, coalesce(nullif(btrim(p_reason), ''), 'released'))
    on conflict (employee_code) do update
    set freed_at = now(),
        freed_from_candidate_id = excluded.freed_from_candidate_id,
        reason = excluded.reason;
  end if;

  if v_ref is not null then
    v_parts := string_to_array(v_ref, '/');
    -- IFSPL/HR/<Site>/OL/<Year>/<Seq>
    v_site := coalesce(nullif(btrim(coalesce(v_row.site_code, '')), ''), upper(coalesce(v_parts[3], '')));
    begin
      v_year := nullif(btrim(coalesce(v_parts[5], '')), '')::integer;
    exception when others then
      v_year := null;
    end;

    insert into public.hr_calling_reusable_offer_refs (
      offer_reference_no, site_code, year_value, freed_from_candidate_id, reason
    )
    values (
      v_ref,
      coalesce(v_site, ''),
      v_year,
      p_candidate_id,
      coalesce(nullif(btrim(p_reason), ''), 'released')
    )
    on conflict (offer_reference_no) do update
    set freed_at = now(),
        freed_from_candidate_id = excluded.freed_from_candidate_id,
        reason = excluded.reason,
        site_code = excluded.site_code,
        year_value = excluded.year_value;
  end if;

  update public.hr_calling_candidates
  set
    employee_code = '',
    offer_reference_no = '',
    updated_at = now()
  where id = p_candidate_id;
end;
$$;

revoke all on function public.hr_calling_release_offer_codes(uuid, text) from public;
grant execute on function public.hr_calling_release_offer_codes(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Peek next employee code — prefer reusable pool, else counter+1
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_peek_next_employee_code()
returns table (
  last_used text,
  suggested_next text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last bigint := 0;
  v_free text;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  select r.employee_code
    into v_free
  from public.hr_calling_reusable_employee_codes r
  where not exists (
    select 1
    from public.hr_calling_candidates c
    where c.is_active = true
      and lower(btrim(c.employee_code)) = lower(btrim(r.employee_code))
  )
  order by r.freed_at asc
  limit 1;

  insert into public.hr_calling_offer_counters (counter_key, last_value)
  values ('employee_code', 0)
  on conflict (counter_key) do nothing;

  select coalesce(last_value, 0)
    into v_last
  from public.hr_calling_offer_counters
  where counter_key = 'employee_code';

  last_used := case when v_last > 0 then v_last::text else '' end;
  suggested_next := coalesce(nullif(btrim(v_free), ''), (v_last + 1)::text);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Allocate offer codes — prefer reusable pools when available
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_allocate_offer_codes(
  p_candidate_id uuid,
  p_site_code text,
  p_year integer default null,
  p_employee_code text default null
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
  v_manual text;
  v_manual_num bigint;
  v_free text;
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
    v_manual := nullif(btrim(coalesce(p_employee_code, '')), '');

    if v_manual is not null then
      if v_manual !~ '^[A-Za-z0-9]+$' then
        raise exception 'Employee code must contain only letters and numbers.';
      end if;

      if exists (
        select 1
        from public.hr_calling_candidates c
        where c.is_active = true
          and c.id <> p_candidate_id
          and lower(btrim(c.employee_code)) = lower(v_manual)
      ) then
        raise exception 'Employee code % is already taken. Please use a different one.', v_manual;
      end if;

      v_emp := v_manual;

      delete from public.hr_calling_reusable_employee_codes
      where lower(btrim(employee_code)) = lower(v_manual);

      insert into public.hr_calling_offer_counters (counter_key, last_value)
      values ('employee_code', 0)
      on conflict (counter_key) do nothing;

      v_manual_num := nullif(regexp_replace(v_manual, '[^0-9]', '', 'g'), '')::bigint;

      if v_manual_num is not null then
        update public.hr_calling_offer_counters
        set last_value = greatest(last_value, v_manual_num),
            updated_at = now()
        where counter_key = 'employee_code';
      end if;
    else
      select r.employee_code
        into v_free
      from public.hr_calling_reusable_employee_codes r
      where not exists (
        select 1
        from public.hr_calling_candidates c
        where c.is_active = true
          and c.id <> p_candidate_id
          and lower(btrim(c.employee_code)) = lower(btrim(r.employee_code))
      )
      order by r.freed_at asc
      limit 1
      for update skip locked;

      if v_free is not null then
        v_emp := v_free;
        delete from public.hr_calling_reusable_employee_codes
        where employee_code = v_free;
      else
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
    end if;
  end if;

  if v_ref is null then
    select r.offer_reference_no
      into v_ref
    from public.hr_calling_reusable_offer_refs r
    where upper(btrim(r.site_code)) = v_site
      and (r.year_value is null or r.year_value = v_year)
      and not exists (
        select 1
        from public.hr_calling_candidates c
        where c.is_active = true
          and c.id <> p_candidate_id
          and btrim(c.offer_reference_no) = btrim(r.offer_reference_no)
      )
    order by r.freed_at asc
    limit 1
    for update skip locked;

    if v_ref is not null then
      delete from public.hr_calling_reusable_offer_refs
      where offer_reference_no = v_ref;
    else
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
  end if;

  update public.hr_calling_candidates
  set
    employee_code = v_emp,
    offer_reference_no = v_ref,
    site_code = v_site,
    offer_status = case
      -- Fresh allocation after empty codes (re-offer / first generate)
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null
        then 'Generated'
      -- Keep Accepted if codes already present (letter re-download / regenerate)
      when btrim(coalesce(v_row.offer_status, '')) = 'Accepted'
        then 'Accepted'
      when btrim(coalesce(v_row.offer_status, '')) in ('Declined', 'Expired')
        then 'Generated'
      else 'Generated'
    end,
    offer_generated_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null
        then now()
      else coalesce(offer_generated_at, now())
    end,
    offer_responded_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      when btrim(coalesce(v_row.offer_status, '')) = 'Accepted' then offer_responded_at
      else offer_responded_at
    end,
    joining_status = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else joining_status
    end,
    joining_checklist = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then '{}'::jsonb
      else joining_checklist
    end,
    actual_joining_date = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else actual_joining_date
    end,
    no_show_flagged_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else no_show_flagged_at
    end,
    iom_status = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else iom_status
    end,
    iom_reference_no = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else iom_reference_no
    end,
    iom_generated_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else iom_generated_at
    end,
    conversion_status = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then ''
      else conversion_status
    end,
    employee_master_id = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else employee_master_id
    end,
    converted_at = case
      when nullif(btrim(coalesce(v_row.employee_code, '')), '') is null then null
      else converted_at
    end,
    updated_at = now()
  where id = p_candidate_id;

  employee_code := v_emp;
  offer_reference_no := v_ref;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record offer response (Accepted / Declined / Expired)
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_set_offer_response(
  p_candidate_id uuid,
  p_response text
)
returns public.hr_calling_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hr_calling_candidates%rowtype;
  v_response text;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  v_response := initcap(lower(btrim(coalesce(p_response, ''))));
  if v_response = 'Noshow' then
    v_response := 'No-show';
  end if;
  if v_response not in ('Accepted', 'Declined', 'Expired') then
    raise exception 'Offer response must be Accepted, Declined, or Expired.';
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

  if coalesce(nullif(btrim(v_row.offer_status), ''), 'Not Generated') not in (
    'Generated', 'Accepted', 'Declined', 'Expired'
  ) and coalesce(nullif(btrim(v_row.offer_reference_no), ''), '') = '' then
    raise exception 'Generate the offer letter before recording a response.';
  end if;

  if v_response = 'Accepted' then
    update public.hr_calling_candidates
    set
      offer_status = 'Accepted',
      offer_responded_at = now(),
      joining_status = case
        when joining_status in ('Joined', 'No-show') then joining_status
        else 'Pending'
      end,
      updated_at = now()
    where id = p_candidate_id
    returning * into v_row;
  else
    -- Declined / Expired: free codes for reuse
    perform public.hr_calling_release_offer_codes(p_candidate_id, v_response);

    update public.hr_calling_candidates
    set
      offer_status = v_response,
      offer_responded_at = now(),
      joining_status = '',
      joining_checklist = '{}'::jsonb,
      actual_joining_date = null,
      no_show_flagged_at = null,
      iom_status = '',
      iom_reference_no = '',
      iom_generated_at = null,
      conversion_status = '',
      employee_master_id = null,
      converted_at = null,
      updated_at = now()
    where id = p_candidate_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.hr_calling_set_offer_response(uuid, text) from public;
grant execute on function public.hr_calling_set_offer_response(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-expire Generated offers past configurable days
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_auto_expire_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := 7;
  v_count integer := 0;
  v_id uuid;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  select nullif(regexp_replace(coalesce(setting_value, '7'), '[^0-9]', '', 'g'), '')::integer
    into v_days
  from public.hr_calling_settings
  where setting_key = 'offer_expiry_days';

  if v_days is null or v_days < 1 then
    v_days := 7;
  end if;

  for v_id in
    select c.id
    from public.hr_calling_candidates c
    where c.is_active = true
      and btrim(coalesce(c.offer_status, '')) = 'Generated'
      and c.offer_generated_at is not null
      and c.offer_generated_at < (timezone('Asia/Kolkata', now()) - make_interval(days => v_days))
  loop
    perform public.hr_calling_set_offer_response(v_id, 'Expired');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.hr_calling_auto_expire_offers() from public;
grant execute on function public.hr_calling_auto_expire_offers() to authenticated;

-- ---------------------------------------------------------------------------
-- Allocate IOM reference (idempotent if already assigned)
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_allocate_iom_reference(
  p_candidate_id uuid,
  p_site_code text default null,
  p_year integer default null,
  p_departments jsonb default null
)
returns table (
  iom_reference_no text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hr_calling_candidates%rowtype;
  v_site text;
  v_year integer;
  v_ref text;
  v_ref_key text;
  v_ref_next bigint;
  v_depts jsonb;
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

  if btrim(coalesce(v_row.offer_status, '')) <> 'Accepted' then
    raise exception 'Only accepted candidates can receive an IOM.';
  end if;

  if btrim(coalesce(v_row.joining_status, '')) <> 'Joined' then
    raise exception 'Mark the candidate as Joined before issuing an IOM.';
  end if;

  v_site := upper(nullif(btrim(coalesce(p_site_code, v_row.site_code, '')), ''));
  if v_site is null then
    raise exception 'Site code is required for the IOM reference number.';
  end if;

  v_year := coalesce(
    p_year,
    extract(year from timezone('Asia/Kolkata', now()))::integer
  );

  v_depts := coalesce(
    p_departments,
    v_row.iom_departments,
    '["IT","Admin","Payroll","Site","Accounts"]'::jsonb
  );

  v_ref := nullif(btrim(coalesce(v_row.iom_reference_no, '')), '');

  if v_ref is null then
    v_ref_key := 'iom:' || v_site || ':' || v_year::text;

    insert into public.hr_calling_offer_counters (counter_key, last_value)
    values (v_ref_key, 0)
    on conflict (counter_key) do nothing;

    update public.hr_calling_offer_counters
    set last_value = last_value + 1,
        updated_at = now()
    where counter_key = v_ref_key
    returning last_value into v_ref_next;

    v_ref := format(
      'IFSPL/HR/%s/IOM/%s/%s',
      v_site,
      v_year::text,
      lpad(v_ref_next::text, 4, '0')
    );
  end if;

  update public.hr_calling_candidates
  set
    iom_reference_no = v_ref,
    iom_status = 'Issued',
    iom_generated_at = coalesce(iom_generated_at, now()),
    iom_departments = v_depts,
    site_code = v_site,
    updated_at = now()
  where id = p_candidate_id;

  iom_reference_no := v_ref;
  return next;
end;
$$;

revoke all on function public.hr_calling_allocate_iom_reference(uuid, text, integer, jsonb) from public;
grant execute on function public.hr_calling_allocate_iom_reference(uuid, text, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Convert joined+IOM candidate into Employee Master (HR-callable; security definer)
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_convert_to_employee_master(
  p_candidate_id uuid
)
returns table (
  employee_master_id bigint,
  employee_id text,
  employee_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hr_calling_candidates%rowtype;
  v_emp_code text;
  v_sys_id text;
  v_max_seq integer := 0;
  v_seq integer;
  v_new_id bigint;
  v_address text;
  v_user uuid;
  v_email text;
begin
  if p_candidate_id is null then
    raise exception 'Candidate is required.';
  end if;

  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  v_user := auth.uid();
  select email into v_email from auth.users where id = v_user;

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

  if btrim(coalesce(v_row.conversion_status, '')) = 'Converted'
     and v_row.employee_master_id is not null then
    employee_master_id := v_row.employee_master_id;
    select e.employee_id, e.employee_code
      into employee_id, employee_code
    from public.admin_ifsp_employee_master e
    where e.id = v_row.employee_master_id;
    return next;
    return;
  end if;

  if btrim(coalesce(v_row.iom_status, '')) <> 'Issued' then
    raise exception 'Issue the IOM before converting to Employee Master.';
  end if;

  if btrim(coalesce(v_row.joining_status, '')) <> 'Joined' then
    raise exception 'Candidate must be Joined before conversion.';
  end if;

  v_emp_code := nullif(btrim(coalesce(v_row.employee_code, '')), '');
  if v_emp_code is null then
    raise exception 'Employee code is required for conversion.';
  end if;

  if exists (
    select 1
    from public.admin_ifsp_employee_master e
    where lower(btrim(coalesce(e.employee_code, ''))) = lower(v_emp_code)
  ) then
    raise exception 'Employee code % already exists in Employee Master.', v_emp_code;
  end if;

  -- Next permanent-style system employee_id (00001…)
  select coalesce(max(
    case
      when trim(coalesce(e.employee_id, '')) ~ '^\d+$'
        then trim(e.employee_id)::integer
      when trim(coalesce(e.employee_id, '')) ~* '^IFSPL-EMP-(\d+)$'
        then substring(trim(e.employee_id) from '(?i)IFSPL-EMP-(\d+)')::integer
      else 0
    end
  ), 0)
    into v_max_seq
  from public.admin_ifsp_employee_master e;

  v_seq := v_max_seq + 1;
  loop
    v_sys_id := lpad(v_seq::text, 5, '0');
    exit when not exists (
      select 1 from public.admin_ifsp_employee_master e where e.employee_id = v_sys_id
    );
    v_seq := v_seq + 1;
    if v_seq > 99999 then
      raise exception 'Employee ID limit reached.';
    end if;
  end loop;

  v_address := nullif(btrim(concat_ws(
    ', ',
    nullif(btrim(coalesce(v_row.address_line, '')), ''),
    nullif(btrim(coalesce(v_row.address_district, '')), ''),
    nullif(btrim(coalesce(v_row.address_state, '')), ''),
    nullif(btrim(coalesce(v_row.address_pincode, '')), '')
  )), '');

  insert into public.admin_ifsp_employee_master (
    user_id,
    employee_id,
    employment_type,
    employee_code,
    full_name,
    father_name,
    designation,
    date_of_joining,
    address,
    full_address,
    personal_no,
    location,
    qualification,
    educational_qualification,
    other_experience,
    years_of_experience,
    department,
    status,
    created_by,
    updated_by
  )
  values (
    v_user,
    v_sys_id,
    'contract',
    v_emp_code,
    coalesce(nullif(btrim(coalesce(v_row.candidate_name, '')), ''), 'Unknown'),
    nullif(btrim(coalesce(v_row.father_name, '')), ''),
    coalesce(nullif(btrim(coalesce(v_row.designation, '')), ''), 'Pending'),
    coalesce(v_row.actual_joining_date, v_row.joining_date, (timezone('Asia/Kolkata', now()))::date),
    nullif(btrim(coalesce(v_row.address_line, '')), ''),
    v_address,
    nullif(btrim(coalesce(v_row.phone_number, '')), ''),
    coalesce(
      nullif(btrim(coalesce(v_row.site_full_name, '')), ''),
      nullif(btrim(coalesce(v_row.site_suitable, '')), '')
    ),
    nullif(btrim(coalesce(v_row.academic_qualification, '')), ''),
    nullif(btrim(coalesce(v_row.academic_qualification, '')), ''),
    v_row.total_experience,
    v_row.total_experience,
    -- department is required on Employee Master; left as placeholder for HR to edit
    '',
    'Active',
    coalesce(v_email, ''),
    coalesce(v_email, '')
  )
  returning id into v_new_id;

  update public.hr_calling_candidates
  set
    conversion_status = 'Converted',
    employee_master_id = v_new_id,
    converted_at = now(),
    updated_at = now()
  where id = p_candidate_id;

  employee_master_id := v_new_id;
  employee_id := v_sys_id;
  employee_code := v_emp_code;
  return next;
end;
$$;

revoke all on function public.hr_calling_convert_to_employee_master(uuid) from public;
grant execute on function public.hr_calling_convert_to_employee_master(uuid) to authenticated;

comment on function public.hr_calling_convert_to_employee_master(uuid) is
  'Creates an Employee Master row from a joined candidate with IOM issued; missing fields left blank.';

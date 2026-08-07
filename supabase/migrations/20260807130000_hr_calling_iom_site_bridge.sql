-- Bridge recruitment Calling Master IOM → Site Employee IOM (same column set).
-- Open IOM entry is editable until a single Confirm: allocates IOM ref, creates
-- confirmed Site IOM (rotation = New), and locks the recruitment entry as history.
-- Adds bank_name for Excel parity.

-- ---------------------------------------------------------------------------
-- Bank name (Site IOM Excel parity)
-- ---------------------------------------------------------------------------
alter table public.hr_site_iom_entries
  add column if not exists bank_name text not null default '';

alter table public.people_sensitive_details
  add column if not exists bank_name text not null default '';

alter table public.hr_site_iom_entries
  add column if not exists source_calling_candidate_id uuid
    references public.hr_calling_candidates (id) on delete set null;

comment on column public.hr_site_iom_entries.bank_name is
  'Bank name captured on the IOM (alongside account no / IFSC).';
comment on column public.hr_site_iom_entries.source_calling_candidate_id is
  'When set, confirm may reuse this candidate''s already-allocated employee code.';

create index if not exists hr_site_iom_entries_calling_candidate_idx
  on public.hr_site_iom_entries (source_calling_candidate_id)
  where source_calling_candidate_id is not null;

-- ---------------------------------------------------------------------------
-- Candidate IOM entry snapshot + link to Site IOM
-- ---------------------------------------------------------------------------
alter table public.hr_calling_candidates
  add column if not exists iom_entry_payload jsonb not null default '{}'::jsonb,
  add column if not exists site_iom_entry_id uuid
    references public.hr_site_iom_entries (id) on delete set null;

comment on column public.hr_calling_candidates.iom_entry_payload is
  'Recruitment IOM form snapshot (Site IOM column set) used to issue the memo and Site IOM row.';
comment on column public.hr_calling_candidates.site_iom_entry_id is
  'Site Employee IOM entry auto-created when recruitment IOM is confirmed.';

create index if not exists hr_calling_candidates_site_iom_idx
  on public.hr_calling_candidates (site_iom_entry_id)
  where site_iom_entry_id is not null;

-- ---------------------------------------------------------------------------
-- Shared emp code allocator — allow a specific calling candidate to keep their code
-- ---------------------------------------------------------------------------
drop function if exists public.hr_allocate_shared_employee_code(text);

create or replace function public.hr_allocate_shared_employee_code(
  p_requested text default null,
  p_allow_calling_candidate_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manual text;
  v_free text;
  v_next bigint;
  v_code text;
  v_manual_num bigint;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  v_manual := nullif(btrim(coalesce(p_requested, '')), '');

  if v_manual is not null then
    if v_manual !~ '^[A-Za-z0-9]+$' then
      raise exception 'Employee code must contain only letters and numbers.';
    end if;

    if exists (
      select 1 from public.admin_ifsp_employee_master m
      where lower(btrim(coalesce(m.employee_code, ''))) = lower(v_manual)
    ) or exists (
      select 1 from public.people p
      where lower(btrim(coalesce(p.unique_code, ''))) = lower(v_manual)
    ) or (
      to_regclass('public.hr_calling_candidates') is not null
      and exists (
        select 1 from public.hr_calling_candidates c
        where c.is_active = true
          and lower(btrim(coalesce(c.employee_code, ''))) = lower(v_manual)
          and (p_allow_calling_candidate_id is null or c.id <> p_allow_calling_candidate_id)
      )
    ) then
      raise exception 'Employee code % is already taken.', v_manual;
    end if;

    if to_regclass('public.hr_calling_reusable_employee_codes') is not null then
      delete from public.hr_calling_reusable_employee_codes
      where lower(btrim(employee_code)) = lower(v_manual);
    end if;

    if to_regclass('public.hr_calling_offer_counters') is not null then
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
    end if;

    return v_manual;
  end if;

  if to_regclass('public.hr_calling_reusable_employee_codes') is not null then
    select r.employee_code into v_free
    from public.hr_calling_reusable_employee_codes r
    where not exists (
      select 1 from public.admin_ifsp_employee_master m
      where lower(btrim(coalesce(m.employee_code, ''))) = lower(btrim(r.employee_code))
    )
    and not exists (
      select 1 from public.people p
      where lower(btrim(coalesce(p.unique_code, ''))) = lower(btrim(r.employee_code))
    )
    and (
      to_regclass('public.hr_calling_candidates') is null
      or not exists (
        select 1 from public.hr_calling_candidates c
        where c.is_active = true
          and lower(btrim(coalesce(c.employee_code, ''))) = lower(btrim(r.employee_code))
          and (p_allow_calling_candidate_id is null or c.id <> p_allow_calling_candidate_id)
      )
    )
    order by r.freed_at asc
    limit 1
    for update skip locked;

    if v_free is not null then
      delete from public.hr_calling_reusable_employee_codes
      where employee_code = v_free;
      return v_free;
    end if;
  end if;

  if to_regclass('public.hr_calling_offer_counters') is not null then
    insert into public.hr_calling_offer_counters (counter_key, last_value)
    values ('employee_code', 0)
    on conflict (counter_key) do nothing;

    update public.hr_calling_offer_counters c
    set last_value = greatest(
      c.last_value,
      coalesce((
        select max(nullif(regexp_replace(btrim(m.employee_code), '[^0-9]', '', 'g'), '')::bigint)
        from public.admin_ifsp_employee_master m
        where coalesce(btrim(m.employee_code), '') ~ '^[0-9]+$'
      ), 0),
      coalesce((
        select max(nullif(regexp_replace(btrim(p.unique_code), '[^0-9]', '', 'g'), '')::bigint)
        from public.people p
        where coalesce(btrim(p.unique_code), '') ~ '^[0-9]+$'
      ), 0)
    ),
    updated_at = now()
    where c.counter_key = 'employee_code';

    loop
      update public.hr_calling_offer_counters
      set last_value = last_value + 1,
          updated_at = now()
      where counter_key = 'employee_code'
      returning last_value into v_next;

      v_code := v_next::text;

      exit when not exists (
        select 1 from public.admin_ifsp_employee_master m
        where lower(btrim(coalesce(m.employee_code, ''))) = lower(v_code)
      ) and not exists (
        select 1 from public.people p
        where lower(btrim(coalesce(p.unique_code, ''))) = lower(v_code)
      ) and (
        to_regclass('public.hr_calling_candidates') is null
        or not exists (
          select 1 from public.hr_calling_candidates c
          where c.is_active = true
            and lower(btrim(coalesce(c.employee_code, ''))) = lower(v_code)
            and (p_allow_calling_candidate_id is null or c.id <> p_allow_calling_candidate_id)
        )
      );
    end loop;

    return v_code;
  end if;

  select coalesce(max(v), 0) + 1 into v_next
  from (
    select nullif(regexp_replace(btrim(m.employee_code), '[^0-9]', '', 'g'), '')::bigint as v
    from public.admin_ifsp_employee_master m
    where coalesce(btrim(m.employee_code), '') ~ '^[0-9]+$'
    union all
    select nullif(regexp_replace(btrim(p.unique_code), '[^0-9]', '', 'g'), '')::bigint
    from public.people p
    where coalesce(btrim(p.unique_code), '') ~ '^[0-9]+$'
  ) s;

  return v_next::text;
end;
$$;

revoke all on function public.hr_allocate_shared_employee_code(text, uuid) from public;
grant execute on function public.hr_allocate_shared_employee_code(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Confirm Site IOM — pass through source calling candidate for code reuse
-- ---------------------------------------------------------------------------
create or replace function public.hr_site_iom_confirm_entry(p_entry_id uuid)
returns public.hr_site_iom_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hr_site_iom_entries%rowtype;
  v_person public.people%rowtype;
  v_code text;
  v_site_id bigint;
  v_site_name text;
  v_today date := (timezone('Asia/Kolkata', now()))::date;
  v_user uuid := auth.uid();
  v_has_dob boolean;
  v_has_bank_name boolean;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  if p_entry_id is null then
    raise exception 'Entry is required.';
  end if;

  select * into v_row
  from public.hr_site_iom_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'IOM entry not found.';
  end if;

  if v_row.entry_status = 'confirmed' then
    return v_row;
  end if;

  if v_row.entry_status <> 'draft' then
    raise exception 'Only draft entries can be confirmed.';
  end if;

  if nullif(btrim(v_row.employee_name), '') is null then
    raise exception 'Employee name is required.';
  end if;

  if nullif(btrim(v_row.site_name), '') is null and v_row.site_id is null then
    raise exception 'Site is required.';
  end if;

  if v_row.site_id is not null then
    select s.id, s.site_name into v_site_id, v_site_name
    from public.sites s where s.id = v_row.site_id;
  end if;

  if v_site_id is null and nullif(btrim(v_row.site_name), '') is not null then
    select s.id, s.site_name into v_site_id, v_site_name
    from public.sites s
    where lower(btrim(s.site_name)) = lower(btrim(v_row.site_name))
    order by s.id
    limit 1;
  end if;

  if v_site_id is null then
    raise exception 'Site not found. Pick a site from the master list.';
  end if;

  v_site_name := coalesce(nullif(btrim(v_site_name), ''), btrim(v_row.site_name));

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'people' and column_name = 'date_of_birth'
  ) into v_has_dob;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'people_sensitive_details' and column_name = 'bank_name'
  ) into v_has_bank_name;

  if v_row.rotation_type = 'New' then
    v_code := nullif(btrim(v_row.employee_code), '');
    v_code := public.hr_allocate_shared_employee_code(v_code, v_row.source_calling_candidate_id);

    insert into public.people (
      unique_code,
      full_name,
      designation,
      father_name,
      phone_no,
      joining_date,
      pf_no,
      salary_basic,
      is_active
    ) values (
      v_code,
      btrim(v_row.employee_name),
      coalesce(nullif(btrim(v_row.designation), ''), ''),
      coalesce(nullif(btrim(v_row.father_name), ''), ''),
      coalesce(nullif(btrim(v_row.contact_number), ''), ''),
      coalesce(v_row.date_of_joining, v_row.event_date, v_today),
      coalesce(nullif(btrim(v_row.pf_no), ''), ''),
      v_row.salary_amount,
      true
    )
    returning * into v_person;

    if v_has_dob and v_row.date_of_birth is not null then
      update public.people
      set date_of_birth = v_row.date_of_birth
      where id = v_person.id;
    end if;

    insert into public.site_assignments (person_id, site_id, from_date, to_date)
    values (v_person.id, v_site_id, coalesce(v_row.event_date, v_today), null);

  else
    if v_row.person_id is null then
      raise exception 'Select the existing site employee for this change.';
    end if;

    select * into v_person from public.people where id = v_row.person_id for update;
    if not found then
      raise exception 'Site employee not found.';
    end if;

    v_code := coalesce(nullif(btrim(v_person.unique_code), ''), nullif(btrim(v_row.employee_code), ''));

    if nullif(btrim(v_row.previous_designation), '') is null then
      v_row.previous_designation := coalesce(v_person.designation, '');
    end if;
    if v_row.previous_salary_amount is null then
      v_row.previous_salary_amount := v_person.salary_basic;
    end if;
    if nullif(btrim(v_row.previous_site_name), '') is null then
      select s.site_name into v_row.previous_site_name
      from public.site_assignments a
      join public.sites s on s.id = a.site_id
      where a.person_id = v_person.id
        and (a.to_date is null or a.to_date >= v_today)
      order by a.from_date desc nulls last
      limit 1;
      v_row.previous_site_name := coalesce(v_row.previous_site_name, '');
    end if;

    update public.people
    set
      full_name = coalesce(nullif(btrim(v_row.employee_name), ''), full_name),
      designation = case
        when v_row.rotation_type in ('Promotion', 'Demotion', 'Transferred')
          then coalesce(nullif(btrim(v_row.designation), ''), designation)
        else designation
      end,
      father_name = coalesce(nullif(btrim(v_row.father_name), ''), father_name),
      phone_no = coalesce(nullif(btrim(v_row.contact_number), ''), phone_no),
      pf_no = coalesce(nullif(btrim(v_row.pf_no), ''), pf_no),
      salary_basic = case
        when v_row.rotation_type in ('Revision of Salary', 'Promotion', 'Demotion', 'Transferred')
             and v_row.salary_amount is not null
          then v_row.salary_amount
        else salary_basic
      end,
      joining_date = coalesce(joining_date, v_row.date_of_joining),
      is_active = true
    where id = v_person.id
    returning * into v_person;

    if v_has_dob and v_row.date_of_birth is not null then
      update public.people
      set date_of_birth = v_row.date_of_birth
      where id = v_person.id;
    end if;

    if v_row.rotation_type = 'Transferred' then
      update public.site_assignments
      set to_date = greatest(coalesce(v_row.event_date, v_today) - 1, from_date)
      where person_id = v_person.id
        and (to_date is null or to_date >= coalesce(v_row.event_date, v_today));

      insert into public.site_assignments (person_id, site_id, from_date, to_date)
      values (v_person.id, v_site_id, coalesce(v_row.event_date, v_today), null);
    end if;
  end if;

  if v_has_bank_name then
    insert into public.people_sensitive_details (
      person_id, date_of_birth, aadhaar_no, pan_no, uan_no,
      bank_account_no, ifsc_code, bank_name, updated_at, updated_by
    ) values (
      v_person.id,
      v_row.date_of_birth,
      coalesce(nullif(btrim(v_row.aadhaar_no), ''), ''),
      coalesce(nullif(btrim(v_row.pan_no), ''), ''),
      coalesce(nullif(btrim(v_row.uan_no), ''), ''),
      coalesce(nullif(btrim(v_row.bank_account_no), ''), ''),
      coalesce(nullif(btrim(v_row.ifsc_code), ''), ''),
      coalesce(nullif(btrim(v_row.bank_name), ''), ''),
      now(),
      v_user
    )
    on conflict (person_id) do update set
      date_of_birth = coalesce(excluded.date_of_birth, public.people_sensitive_details.date_of_birth),
      aadhaar_no = case
        when nullif(btrim(excluded.aadhaar_no), '') is not null then excluded.aadhaar_no
        else public.people_sensitive_details.aadhaar_no
      end,
      pan_no = case
        when nullif(btrim(excluded.pan_no), '') is not null then excluded.pan_no
        else public.people_sensitive_details.pan_no
      end,
      uan_no = case
        when nullif(btrim(excluded.uan_no), '') is not null then excluded.uan_no
        else public.people_sensitive_details.uan_no
      end,
      bank_account_no = case
        when nullif(btrim(excluded.bank_account_no), '') is not null then excluded.bank_account_no
        else public.people_sensitive_details.bank_account_no
      end,
      ifsc_code = case
        when nullif(btrim(excluded.ifsc_code), '') is not null then excluded.ifsc_code
        else public.people_sensitive_details.ifsc_code
      end,
      bank_name = case
        when nullif(btrim(excluded.bank_name), '') is not null then excluded.bank_name
        else public.people_sensitive_details.bank_name
      end,
      updated_at = now(),
      updated_by = v_user;
  else
    insert into public.people_sensitive_details (
      person_id, date_of_birth, aadhaar_no, pan_no, uan_no,
      bank_account_no, ifsc_code, updated_at, updated_by
    ) values (
      v_person.id,
      v_row.date_of_birth,
      coalesce(nullif(btrim(v_row.aadhaar_no), ''), ''),
      coalesce(nullif(btrim(v_row.pan_no), ''), ''),
      coalesce(nullif(btrim(v_row.uan_no), ''), ''),
      coalesce(nullif(btrim(v_row.bank_account_no), ''), ''),
      coalesce(nullif(btrim(v_row.ifsc_code), ''), ''),
      now(),
      v_user
    )
    on conflict (person_id) do update set
      date_of_birth = coalesce(excluded.date_of_birth, public.people_sensitive_details.date_of_birth),
      aadhaar_no = case
        when nullif(btrim(excluded.aadhaar_no), '') is not null then excluded.aadhaar_no
        else public.people_sensitive_details.aadhaar_no
      end,
      pan_no = case
        when nullif(btrim(excluded.pan_no), '') is not null then excluded.pan_no
        else public.people_sensitive_details.pan_no
      end,
      uan_no = case
        when nullif(btrim(excluded.uan_no), '') is not null then excluded.uan_no
        else public.people_sensitive_details.uan_no
      end,
      bank_account_no = case
        when nullif(btrim(excluded.bank_account_no), '') is not null then excluded.bank_account_no
        else public.people_sensitive_details.bank_account_no
      end,
      ifsc_code = case
        when nullif(btrim(excluded.ifsc_code), '') is not null then excluded.ifsc_code
        else public.people_sensitive_details.ifsc_code
      end,
      updated_at = now(),
      updated_by = v_user;
  end if;

  update public.hr_site_iom_entries
  set
    entry_status = 'confirmed',
    person_id = v_person.id,
    employee_code = coalesce(v_code, v_person.unique_code, employee_code),
    site_id = v_site_id,
    site_name = v_site_name,
    previous_site_name = coalesce(v_row.previous_site_name, previous_site_name),
    previous_designation = coalesce(v_row.previous_designation, previous_designation),
    previous_salary_amount = coalesce(v_row.previous_salary_amount, previous_salary_amount),
    confirmed_at = now(),
    confirmed_by = v_user,
    updated_at = now(),
    updated_by = v_user
  where id = p_entry_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirm open recruitment IOM (single finalize step) → Site IOM New + lock
-- ---------------------------------------------------------------------------
drop function if exists public.hr_calling_issue_iom_with_site_entry(uuid, jsonb);

create or replace function public.hr_calling_confirm_iom_entry(
  p_candidate_id uuid,
  p_entry jsonb default '{}'::jsonb
)
returns public.hr_calling_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cand public.hr_calling_candidates%rowtype;
  v_site_id bigint;
  v_site_name text;
  v_site_code text;
  v_entry_id uuid;
  v_event_date date;
  v_payload jsonb;
  v_user uuid := auth.uid();
  v_year integer;
  v_doj date;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  if p_candidate_id is null then
    raise exception 'Candidate is required.';
  end if;

  select * into v_cand
  from public.hr_calling_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'Candidate not found.';
  end if;

  if v_cand.is_active is not true then
    raise exception 'Candidate is inactive.';
  end if;

  if btrim(coalesce(v_cand.offer_status, '')) <> 'Accepted' then
    raise exception 'Only accepted candidates can confirm an IOM.';
  end if;

  if btrim(coalesce(v_cand.joining_status, '')) = 'No-show' then
    raise exception 'No-show candidates cannot confirm an IOM.';
  end if;

  -- Already confirmed → idempotent return (locked history)
  if btrim(coalesce(v_cand.iom_status, '')) = 'Issued' and v_cand.site_iom_entry_id is not null then
    return v_cand;
  end if;

  if btrim(coalesce(v_cand.iom_status, '')) = 'Issued' then
    raise exception 'This IOM is already confirmed and cannot be edited.';
  end if;

  v_payload := coalesce(p_entry, '{}'::jsonb);

  v_site_id := nullif(v_payload->>'siteId', '')::bigint;
  v_site_name := nullif(btrim(coalesce(v_payload->>'siteName', '')), '');

  if v_site_id is not null then
    select s.id, s.site_name into v_site_id, v_site_name
    from public.sites s where s.id = v_site_id;
  elsif v_site_name is not null then
    select s.id, s.site_name into v_site_id, v_site_name
    from public.sites s
    where lower(btrim(s.site_name)) = lower(v_site_name)
    order by s.id
    limit 1;
  end if;

  if v_site_id is null then
    raise exception 'Site is required. Select a site from the master list.';
  end if;

  v_site_code := upper(nullif(btrim(coalesce(
    v_payload->>'siteCode',
    v_cand.site_code,
    ''
  )), ''));

  if v_site_code is null then
    -- Fall back to a short code derived from site name initials if needed
    v_site_code := upper(regexp_replace(coalesce(v_site_name, 'SITE'), '[^A-Za-z0-9]', '', 'g'));
    if length(v_site_code) > 8 then
      v_site_code := left(v_site_code, 8);
    end if;
  end if;

  begin
    v_event_date := nullif(btrim(coalesce(v_payload->>'eventDate', '')), '')::date;
  exception when others then
    v_event_date := null;
  end;
  v_event_date := coalesce(
    v_event_date,
    v_cand.actual_joining_date,
    v_cand.joining_date,
    (timezone('Asia/Kolkata', now()))::date
  );

  -- Final open-entry payload (always New for recruitment)
  v_payload := v_payload || jsonb_build_object(
    'rotationType', 'New',
    'siteId', v_site_id::text,
    'siteName', v_site_name,
    'siteCode', v_site_code,
    'eventDate', v_event_date::text,
    'employeeCode', coalesce(nullif(btrim(coalesce(v_payload->>'employeeCode', '')), ''), v_cand.employee_code),
    'employeeName', coalesce(nullif(btrim(coalesce(v_payload->>'employeeName', '')), ''), v_cand.candidate_name)
  );

  begin
    v_doj := nullif(btrim(coalesce(v_payload->>'dateOfJoining', '')), '')::date;
  exception when others then
    v_doj := null;
  end;
  v_doj := coalesce(v_doj, v_cand.actual_joining_date, v_cand.joining_date, v_event_date);

  -- Confirm may finalize joining if HR skipped Mark Joined
  update public.hr_calling_candidates
  set
    iom_entry_payload = v_payload,
    site_code = v_site_code,
    site_full_name = coalesce(nullif(btrim(v_site_name), ''), site_full_name),
    joining_status = case
      when btrim(coalesce(joining_status, '')) = 'Joined' then joining_status
      else 'Joined'
    end,
    actual_joining_date = coalesce(actual_joining_date, v_doj),
    updated_at = now()
  where id = p_candidate_id;

  -- Allocate IOM reference only on Confirm (locks as Issued)
  v_year := extract(year from timezone('Asia/Kolkata', now()))::integer;
  perform public.hr_calling_allocate_iom_reference(
    p_candidate_id,
    v_site_code,
    v_year,
    coalesce(v_cand.iom_departments, '["IT","Admin","Payroll","Site","Accounts"]'::jsonb)
  );

  -- Create Site IOM only once
  if v_cand.site_iom_entry_id is null then
    insert into public.hr_site_iom_entries (
      entry_status,
      rotation_type,
      event_date,
      site_id,
      site_name,
      employee_code,
      employee_name,
      designation,
      salary_amount,
      father_name,
      bank_account_no,
      ifsc_code,
      bank_name,
      date_of_birth,
      date_of_joining,
      remarks,
      contact_number,
      aadhaar_no,
      pan_no,
      uan_no,
      pf_no,
      source_calling_candidate_id,
      created_by,
      updated_by
    ) values (
      'draft',
      'New',
      v_event_date,
      v_site_id,
      v_site_name,
      coalesce(nullif(btrim(coalesce(v_payload->>'employeeCode', '')), ''), v_cand.employee_code, ''),
      coalesce(nullif(btrim(coalesce(v_payload->>'employeeName', '')), ''), v_cand.candidate_name, ''),
      coalesce(nullif(btrim(coalesce(v_payload->>'designation', '')), ''), v_cand.designation, ''),
      case
        when nullif(btrim(coalesce(v_payload->>'salaryAmount', '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then nullif(btrim(v_payload->>'salaryAmount'), '')::numeric
        else v_cand.salary_gross
      end,
      coalesce(nullif(btrim(coalesce(v_payload->>'fatherName', '')), ''), v_cand.father_name, ''),
      coalesce(nullif(btrim(coalesce(v_payload->>'bankAccountNo', '')), ''), ''),
      upper(coalesce(nullif(btrim(coalesce(v_payload->>'ifscCode', '')), ''), '')),
      coalesce(nullif(btrim(coalesce(v_payload->>'bankName', '')), ''), ''),
      case
        when nullif(btrim(coalesce(v_payload->>'dateOfBirth', '')), '') ~ '^\d{4}-\d{2}-\d{2}$'
          then (v_payload->>'dateOfBirth')::date
        else null
      end,
      coalesce(
        case
          when nullif(btrim(coalesce(v_payload->>'dateOfJoining', '')), '') ~ '^\d{4}-\d{2}-\d{2}$'
            then (v_payload->>'dateOfJoining')::date
          else null
        end,
        v_cand.actual_joining_date,
        v_cand.joining_date,
        v_event_date
      ),
      coalesce(nullif(btrim(coalesce(v_payload->>'remarks', '')), ''), ''),
      coalesce(nullif(btrim(coalesce(v_payload->>'contactNumber', '')), ''), v_cand.phone_number, ''),
      coalesce(nullif(btrim(coalesce(v_payload->>'aadhaarNo', '')), ''), ''),
      upper(coalesce(nullif(btrim(coalesce(v_payload->>'panNo', '')), ''), '')),
      coalesce(nullif(btrim(coalesce(v_payload->>'uanNo', '')), ''), ''),
      coalesce(nullif(btrim(coalesce(v_payload->>'pfNo', '')), ''), ''),
      p_candidate_id,
      v_user,
      v_user
    )
    returning id into v_entry_id;

    perform public.hr_site_iom_confirm_entry(v_entry_id);

    update public.hr_calling_candidates
    set
      site_iom_entry_id = v_entry_id,
      updated_at = now()
    where id = p_candidate_id;
  end if;

  select * into v_cand
  from public.hr_calling_candidates
  where id = p_candidate_id;

  return v_cand;
end;
$$;

revoke all on function public.hr_calling_confirm_iom_entry(uuid, jsonb) from public;
grant execute on function public.hr_calling_confirm_iom_entry(uuid, jsonb) to authenticated;

comment on function public.hr_calling_confirm_iom_entry(uuid, jsonb) is
  'Single Confirm for an open recruitment IOM: allocates IOM reference, creates confirmed Site IOM (New), and locks the entry.';

comment on column public.hr_calling_candidates.iom_entry_payload is
  'Open IOM entry fields (editable until Confirm). Locked when iom_status = Issued.';

notify pgrst, 'reload schema';

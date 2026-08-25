-- Referral candidate entry for Calling Database.
-- Additive: new source column + referred-by FK + create RPC.
-- Does not alter offer / joining / IOM / conversion RPCs or status defaults.

-- ---------------------------------------------------------------------------
-- Source enum + referred-by columns
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'hr_calling_candidate_source'
      and n.nspname = 'public'
  ) then
    create type public.hr_calling_candidate_source as enum ('Calling', 'Referral');
  end if;
end
$$;

alter table public.hr_calling_candidates
  add column if not exists candidate_source public.hr_calling_candidate_source not null default 'Calling',
  add column if not exists referred_by_employee_id bigint
    references public.admin_ifsp_employee_master (id) on delete set null,
  add column if not exists referred_by_note text;

comment on column public.hr_calling_candidates.candidate_source is
  'How the candidate entered the register: Calling (pipeline) or Referral (direct to Selected).';
comment on column public.hr_calling_candidates.referred_by_employee_id is
  'Employee Master id of the referrer (Active employees; same table as Calling By).';
comment on column public.hr_calling_candidates.referred_by_note is
  'Optional note from HR about the referral.';

create index if not exists hr_calling_candidates_source_idx
  on public.hr_calling_candidates (candidate_source)
  where is_active = true;

create index if not exists hr_calling_candidates_referred_by_idx
  on public.hr_calling_candidates (referred_by_employee_id)
  where referred_by_employee_id is not null;

-- ---------------------------------------------------------------------------
-- Create a referral candidate already at Selected, offer not generated.
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_create_referral_candidate(
  p_payload jsonb
)
returns public.hr_calling_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_phone text;
  v_name text;
  v_referrer_id bigint;
  v_referrer_name text;
  v_referrer_status text;
  v_duty text;
  v_salutation text;
  v_salary numeric;
  v_joining date;
  v_year_completed integer;
  v_row public.hr_calling_candidates%rowtype;
begin
  if not public.current_user_can_access_module('hr') then
    raise exception 'Permission denied.';
  end if;

  v_phone := regexp_replace(coalesce(v_payload->>'phone_number', ''), '\D', '', 'g');
  v_name := nullif(btrim(coalesce(v_payload->>'candidate_name', '')), '');
  v_referrer_id := nullif(btrim(coalesce(v_payload->>'referred_by_employee_id', '')), '')::bigint;

  if v_name is null then
    raise exception 'Candidate name is required.';
  end if;

  if v_phone is null or v_phone = '' then
    raise exception 'Mobile number is required.';
  end if;

  if v_phone !~ '^[0-9]{10,15}$' then
    raise exception 'Mobile number must be 10 to 15 digits.';
  end if;

  if exists (
    select 1
    from public.hr_calling_candidates c
    where c.phone_number = v_phone
      and c.is_active = true
  ) then
    raise exception 'This mobile number already exists in Calling Master.';
  end if;

  if v_referrer_id is null then
    raise exception 'Referred by is required.';
  end if;

  select e.full_name, e.status
    into v_referrer_name, v_referrer_status
  from public.admin_ifsp_employee_master e
  where e.id = v_referrer_id;

  if not found then
    raise exception 'Referred-by employee was not found.';
  end if;

  if btrim(coalesce(v_referrer_status, '')) <> 'Active' then
    raise exception 'Referred-by employee must be Active in Employee Master.';
  end if;

  v_duty := nullif(btrim(coalesce(v_payload->>'duty_pattern', '')), '');
  if v_duty is not null and v_duty not in ('26', '27') then
    raise exception 'Duty pattern must be 26 or 27 days.';
  end if;

  v_salutation := coalesce(nullif(btrim(coalesce(v_payload->>'offer_salutation', '')), ''), 'Mr.');
  if v_salutation not in ('Mr.', 'Ms.', 'Mrs.') then
    v_salutation := 'Mr.';
  end if;

  begin
    v_salary := nullif(btrim(coalesce(v_payload->>'salary_gross', '')), '')::numeric;
  exception
    when invalid_text_representation then
      raise exception 'Gross salary must be numeric.';
  end;

  begin
    v_joining := nullif(btrim(coalesce(v_payload->>'joining_date', '')), '')::date;
  exception
    when invalid_datetime_format then
      raise exception 'Date of joining is invalid.';
  end;

  begin
    v_year_completed := nullif(btrim(coalesce(v_payload->>'year_completed', '')), '')::integer;
  exception
    when invalid_text_representation then
      v_year_completed := null;
  end;

  insert into public.hr_calling_candidates (
    phone_number,
    call_date,
    calling_by,
    candidate_name,
    cv_submitted,
    academic_qualification,
    fire_course,
    year_completed,
    currently_working,
    designation,
    company,
    salary_gross,
    remarks,
    site_suitable,
    attachments,
    hiring_status,
    candidate_source,
    referred_by_employee_id,
    referred_by_note,
    father_name,
    address_line,
    address_district,
    address_state,
    address_pincode,
    duty_pattern,
    site_full_name,
    site_code,
    joining_date,
    offer_salutation
  )
  values (
    v_phone,
    coalesce(
      case
        when nullif(btrim(coalesce(v_payload->>'call_date', '')), '') is null then null
        else (v_payload->>'call_date')::date
      end,
      (timezone('Asia/Kolkata', now()))::date
    ),
    coalesce(nullif(btrim(coalesce(v_payload->>'calling_by', '')), ''), coalesce(v_referrer_name, '')),
    v_name,
    coalesce(v_payload->>'cv_submitted', ''),
    coalesce(v_payload->>'academic_qualification', ''),
    coalesce(v_payload->>'fire_course', ''),
    v_year_completed,
    coalesce(v_payload->>'currently_working', ''),
    coalesce(v_payload->>'designation', ''),
    coalesce(v_payload->>'company', ''),
    v_salary,
    coalesce(v_payload->>'remarks', ''),
    coalesce(v_payload->>'site_suitable', ''),
    case
      when jsonb_typeof(v_payload->'attachments') = 'array' then v_payload->'attachments'
      else '[]'::jsonb
    end,
    'Selected',
    'Referral',
    v_referrer_id,
    nullif(btrim(coalesce(v_payload->>'referred_by_note', '')), ''),
    coalesce(v_payload->>'father_name', ''),
    coalesce(v_payload->>'address_line', ''),
    coalesce(v_payload->>'address_district', ''),
    coalesce(v_payload->>'address_state', ''),
    coalesce(v_payload->>'address_pincode', ''),
    coalesce(v_duty, ''),
    coalesce(v_payload->>'site_full_name', ''),
    upper(coalesce(v_payload->>'site_code', '')),
    v_joining,
    v_salutation
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.hr_calling_create_referral_candidate(jsonb) from public;
grant execute on function public.hr_calling_create_referral_candidate(jsonb) to authenticated;

comment on function public.hr_calling_create_referral_candidate(jsonb) is
  'Insert a referral candidate at hiring_status=Selected with offer fields pre-filled. Does not allocate codes or change offer/joining/IOM/conversion statuses.';

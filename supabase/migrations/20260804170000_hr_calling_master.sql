-- HR Calling Master (Calling Database)
-- Public schema: candidates + dropdown masters/options.
-- No seed candidate or option values — masters only define dropdown categories.

-- ---------------------------------------------------------------------------
-- Dropdown masters (categories used by Calling Master forms/filters)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_calling_dropdown_masters (
  master_key text primary key,
  label text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint hr_calling_dropdown_masters_key_check
    check (master_key ~ '^[a-z][a-zA-Z0-9_]*$')
);

create index if not exists hr_calling_dropdown_masters_active_sort_idx
  on public.hr_calling_dropdown_masters (is_active, sort_order, label);

comment on table public.hr_calling_dropdown_masters is
  'Calling Database dropdown categories (Calling By, Home State, etc.).';

-- ---------------------------------------------------------------------------
-- Dropdown options (dynamic values managed in Dropdown Master UI)
-- ---------------------------------------------------------------------------
create table if not exists public.hr_calling_dropdown_options (
  id uuid primary key default gen_random_uuid(),
  master_key text not null
    references public.hr_calling_dropdown_masters (master_key) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint hr_calling_dropdown_options_label_check
    check (length(btrim(label)) > 0),
  constraint hr_calling_dropdown_options_master_label_unique
    unique (master_key, label)
);

create index if not exists hr_calling_dropdown_options_master_sort_idx
  on public.hr_calling_dropdown_options (master_key, is_active, sort_order, label);

create unique index if not exists hr_calling_dropdown_options_master_label_ci_uidx
  on public.hr_calling_dropdown_options (master_key, lower(btrim(label)));

comment on table public.hr_calling_dropdown_options is
  'Selectable values for Calling Database dropdown masters.';

-- ---------------------------------------------------------------------------
-- Candidate calling register
-- phone_number is the business unique key (future natural identity).
-- ---------------------------------------------------------------------------
create table if not exists public.hr_calling_candidates (
  id uuid primary key default gen_random_uuid(),
  phone_number varchar(15) not null,
  call_date date not null default (timezone('Asia/Kolkata', now()))::date,
  calling_by text not null default '',
  candidate_name text not null,
  cv_submitted text not null default '',
  academic_qualification text not null default '',
  fire_course text not null default '',
  year_completed integer,
  height_cm numeric(6, 2),
  weight_kg numeric(6, 2),
  home_state text not null default '',
  home_town text not null default '',
  currently_working text not null default '',
  designation text not null default '',
  company text not null default '',
  working_state text not null default '',
  contractor text not null default '',
  industry_worked text not null default '',
  salary_gross numeric(12, 2),
  facilities_provided text not null default '',
  total_experience numeric(5, 2),
  hmv_lmv text not null default '',
  driving_license_year integer,
  remarks text not null default '',
  site_suitable text not null default '',
  -- Future-ready recruiter workflow columns (nullable until used)
  resume_url text,
  interview_status text not null default '',
  follow_up_date date,
  recruiter_notes text not null default '',
  hiring_status text not null default '',
  offer_status text not null default '',
  joining_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint hr_calling_candidates_phone_format_check
    check (phone_number ~ '^[0-9]{10,15}$'),
  constraint hr_calling_candidates_candidate_name_check
    check (length(btrim(candidate_name)) > 0),
  constraint hr_calling_candidates_year_completed_check
    check (year_completed is null or (year_completed >= 1950 and year_completed <= 2100)),
  constraint hr_calling_candidates_license_year_check
    check (driving_license_year is null or (driving_license_year >= 1950 and driving_license_year <= 2100)),
  constraint hr_calling_candidates_height_check
    check (height_cm is null or (height_cm >= 0 and height_cm <= 300)),
  constraint hr_calling_candidates_weight_check
    check (weight_kg is null or (weight_kg >= 0 and weight_kg <= 500)),
  constraint hr_calling_candidates_salary_check
    check (salary_gross is null or salary_gross >= 0),
  constraint hr_calling_candidates_experience_check
    check (total_experience is null or (total_experience >= 0 and total_experience <= 60))
);

create unique index if not exists hr_calling_candidates_phone_active_uidx
  on public.hr_calling_candidates (phone_number)
  where is_active = true;

create index if not exists hr_calling_candidates_call_date_idx
  on public.hr_calling_candidates (call_date desc);

create index if not exists hr_calling_candidates_calling_by_idx
  on public.hr_calling_candidates (calling_by);

create index if not exists hr_calling_candidates_home_state_idx
  on public.hr_calling_candidates (home_state);

create index if not exists hr_calling_candidates_working_state_idx
  on public.hr_calling_candidates (working_state);

create index if not exists hr_calling_candidates_site_suitable_idx
  on public.hr_calling_candidates (site_suitable);

create index if not exists hr_calling_candidates_industry_idx
  on public.hr_calling_candidates (industry_worked);

create index if not exists hr_calling_candidates_active_updated_idx
  on public.hr_calling_candidates (is_active, updated_at desc);

create index if not exists hr_calling_candidates_search_idx
  on public.hr_calling_candidates
  using gin (
    to_tsvector(
      'simple',
      coalesce(candidate_name, '') || ' ' ||
      coalesce(phone_number, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(designation, '')
    )
  );

comment on table public.hr_calling_candidates is
  'HR Calling Database candidate register digitized from the calling sheet.';
comment on column public.hr_calling_candidates.phone_number is
  'Business unique mobile number for active candidates.';

-- ---------------------------------------------------------------------------
-- Audit helpers
-- ---------------------------------------------------------------------------
create or replace function public.hr_calling_set_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    new.updated_by := coalesce(new.updated_by, auth.uid());
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
  elsif tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists hr_calling_dropdown_masters_audit on public.hr_calling_dropdown_masters;
create trigger hr_calling_dropdown_masters_audit
  before insert or update on public.hr_calling_dropdown_masters
  for each row execute function public.hr_calling_set_audit_fields();

drop trigger if exists hr_calling_dropdown_options_audit on public.hr_calling_dropdown_options;
create trigger hr_calling_dropdown_options_audit
  before insert or update on public.hr_calling_dropdown_options
  for each row execute function public.hr_calling_set_audit_fields();

drop trigger if exists hr_calling_candidates_audit on public.hr_calling_candidates;
create trigger hr_calling_candidates_audit
  before insert or update on public.hr_calling_candidates
  for each row execute function public.hr_calling_set_audit_fields();

drop trigger if exists hr_calling_dropdown_masters_updated_at on public.hr_calling_dropdown_masters;
create trigger hr_calling_dropdown_masters_updated_at
  before update on public.hr_calling_dropdown_masters
  for each row execute function public.set_updated_at();

drop trigger if exists hr_calling_dropdown_options_updated_at on public.hr_calling_dropdown_options;
create trigger hr_calling_dropdown_options_updated_at
  before update on public.hr_calling_dropdown_options
  for each row execute function public.set_updated_at();

drop trigger if exists hr_calling_candidates_updated_at on public.hr_calling_candidates;
create trigger hr_calling_candidates_updated_at
  before update on public.hr_calling_candidates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — HR module access
-- ---------------------------------------------------------------------------
alter table public.hr_calling_dropdown_masters enable row level security;
alter table public.hr_calling_dropdown_options enable row level security;
alter table public.hr_calling_candidates enable row level security;

drop policy if exists "hr_calling_dropdown_masters_select" on public.hr_calling_dropdown_masters;
drop policy if exists "hr_calling_dropdown_masters_insert" on public.hr_calling_dropdown_masters;
drop policy if exists "hr_calling_dropdown_masters_update" on public.hr_calling_dropdown_masters;
drop policy if exists "hr_calling_dropdown_masters_delete" on public.hr_calling_dropdown_masters;

create policy "hr_calling_dropdown_masters_select"
  on public.hr_calling_dropdown_masters for select to authenticated
  using (public.current_user_can_access_module('hr'));

create policy "hr_calling_dropdown_masters_insert"
  on public.hr_calling_dropdown_masters for insert to authenticated
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_dropdown_masters_update"
  on public.hr_calling_dropdown_masters for update to authenticated
  using (public.current_user_can_access_module('hr'))
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_dropdown_masters_delete"
  on public.hr_calling_dropdown_masters for delete to authenticated
  using (public.current_user_can_access_module('hr'));

drop policy if exists "hr_calling_dropdown_options_select" on public.hr_calling_dropdown_options;
drop policy if exists "hr_calling_dropdown_options_insert" on public.hr_calling_dropdown_options;
drop policy if exists "hr_calling_dropdown_options_update" on public.hr_calling_dropdown_options;
drop policy if exists "hr_calling_dropdown_options_delete" on public.hr_calling_dropdown_options;

create policy "hr_calling_dropdown_options_select"
  on public.hr_calling_dropdown_options for select to authenticated
  using (public.current_user_can_access_module('hr'));

create policy "hr_calling_dropdown_options_insert"
  on public.hr_calling_dropdown_options for insert to authenticated
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_dropdown_options_update"
  on public.hr_calling_dropdown_options for update to authenticated
  using (public.current_user_can_access_module('hr'))
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_dropdown_options_delete"
  on public.hr_calling_dropdown_options for delete to authenticated
  using (public.current_user_can_access_module('hr'));

drop policy if exists "hr_calling_candidates_select" on public.hr_calling_candidates;
drop policy if exists "hr_calling_candidates_insert" on public.hr_calling_candidates;
drop policy if exists "hr_calling_candidates_update" on public.hr_calling_candidates;
drop policy if exists "hr_calling_candidates_delete" on public.hr_calling_candidates;

create policy "hr_calling_candidates_select"
  on public.hr_calling_candidates for select to authenticated
  using (public.current_user_can_access_module('hr'));

create policy "hr_calling_candidates_insert"
  on public.hr_calling_candidates for insert to authenticated
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_candidates_update"
  on public.hr_calling_candidates for update to authenticated
  using (public.current_user_can_access_module('hr'))
  with check (public.current_user_can_access_module('hr'));

create policy "hr_calling_candidates_delete"
  on public.hr_calling_candidates for delete to authenticated
  using (public.current_user_can_access_module('hr'));

grant select, insert, update, delete on public.hr_calling_dropdown_masters to authenticated;
grant select, insert, update, delete on public.hr_calling_dropdown_options to authenticated;
grant select, insert, update, delete on public.hr_calling_candidates to authenticated;

-- ---------------------------------------------------------------------------
-- Structural master categories only (no option/candidate dummy rows)
-- ---------------------------------------------------------------------------
insert into public.hr_calling_dropdown_masters (master_key, label, description, sort_order)
values
  ('callingBy', 'Calling By', 'Recruiters / callers who log candidate calls', 10),
  ('cvSubmitted', 'CV Submitted', 'Whether the candidate shared a CV', 20),
  ('academicQualification', 'Academic Qualification', 'Education levels used in screening', 30),
  ('fireCourse', 'Fire Course', 'Fire / safety course options', 40),
  ('homeState', 'Home State', 'Candidate home states', 50),
  ('currentlyWorking', 'Currently Working', 'Employment status options', 60),
  ('workingState', 'Working State', 'States where candidates currently work', 70),
  ('industryWorked', 'Industry Worked', 'Industries for candidate experience', 80),
  ('hmvLmv', 'HMV / LMV', 'Driving license categories', 90),
  ('siteSuitable', 'Site Suitable', 'Deployment suitability outcomes', 100)
on conflict (master_key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

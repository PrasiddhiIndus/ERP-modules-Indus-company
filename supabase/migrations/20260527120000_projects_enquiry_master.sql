-- Projects module schema (Enquiry Master).
-- Expose in Supabase Dashboard → Settings → API → Exposed schemas: projects
-- App: supabase.schema('projects').from('enquiries')

create schema if not exists projects;

grant usage on schema projects to postgres, anon, authenticated, service_role;
grant all on all tables in schema projects to authenticated, service_role;
grant all on all sequences in schema projects to authenticated, service_role;
alter default privileges in schema projects
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema projects
  grant usage, select on sequences to authenticated, service_role;

-- Remove legacy public tables if an earlier draft migration was applied.
drop table if exists public.projects_enquiry_dropdowns cascade;
drop table if exists public.projects_enquiries cascade;

-- ---------------------------------------------------------------------------
-- Dropdown kinds & options (fully dynamic — add kinds/values from Enquiry Dropdown UI)
-- ---------------------------------------------------------------------------
create table if not exists projects.enquiry_dropdown_kinds (
  id uuid primary key default gen_random_uuid(),
  kind_key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists projects.enquiry_dropdown_options (
  id uuid primary key default gen_random_uuid(),
  kind_id uuid not null references projects.enquiry_dropdown_kinds (id) on delete cascade,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint enquiry_dropdown_options_kind_value_unique unique (kind_id, value)
);

create index if not exists enquiry_dropdown_options_kind_idx
  on projects.enquiry_dropdown_options (kind_id, sort_order, value);

-- ---------------------------------------------------------------------------
-- Field definitions drive Enquiry Entry form + Enquiry Database columns
-- ---------------------------------------------------------------------------
create table if not exists projects.enquiry_field_definitions (
  id uuid primary key default gen_random_uuid(),
  field_key text not null unique,
  label text not null,
  field_type text not null,
  section text,
  show_in_entry boolean not null default true,
  show_in_database boolean not null default true,
  read_only boolean not null default false,
  required boolean not null default false,
  sort_order integer not null default 0,
  entry_hint text,
  default_value text,
  dropdown_kind_id uuid references projects.enquiry_dropdown_kinds (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint enquiry_field_definitions_field_type_check check (
    field_type in ('text', 'textarea', 'date', 'number', 'dropdown')
  )
);

create index if not exists enquiry_field_definitions_sort_idx
  on projects.enquiry_field_definitions (sort_order, label);

-- ---------------------------------------------------------------------------
-- Enquiry records (flexible payload in data jsonb)
-- ---------------------------------------------------------------------------
create table if not exists projects.enquiries (
  id uuid primary key default gen_random_uuid(),
  serial_number bigint generated always as identity,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enquiries_serial_number_idx
  on projects.enquiries (serial_number desc);

create index if not exists enquiries_data_gin_idx
  on projects.enquiries using gin (data);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table projects.enquiry_dropdown_kinds enable row level security;
alter table projects.enquiry_dropdown_options enable row level security;
alter table projects.enquiry_field_definitions enable row level security;
alter table projects.enquiries enable row level security;

drop policy if exists "enquiry_dropdown_kinds_auth" on projects.enquiry_dropdown_kinds;
create policy "enquiry_dropdown_kinds_auth"
  on projects.enquiry_dropdown_kinds for all to authenticated using (true) with check (true);

drop policy if exists "enquiry_dropdown_options_auth" on projects.enquiry_dropdown_options;
create policy "enquiry_dropdown_options_auth"
  on projects.enquiry_dropdown_options for all to authenticated using (true) with check (true);

drop policy if exists "enquiry_field_definitions_auth" on projects.enquiry_field_definitions;
create policy "enquiry_field_definitions_auth"
  on projects.enquiry_field_definitions for all to authenticated using (true) with check (true);

drop policy if exists "enquiries_auth" on projects.enquiries;
create policy "enquiries_auth"
  on projects.enquiries for all to authenticated using (true) with check (true);

drop trigger if exists enquiries_updated_at on projects.enquiries;
create trigger enquiries_updated_at
  before update on projects.enquiries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed dropdown kinds
-- ---------------------------------------------------------------------------
insert into projects.enquiry_dropdown_kinds (kind_key, label, sort_order) values
  ('enquiry_from', 'Enquiry From', 1),
  ('assigned_to_person', 'Assigned to Person', 2),
  ('current_status', 'Current Status', 3),
  ('priority', 'Priority', 4)
on conflict (kind_key) do nothing;

-- Seed dropdown options
insert into projects.enquiry_dropdown_options (kind_id, value, sort_order)
select k.id, v.value, v.sort_order
from projects.enquiry_dropdown_kinds k
cross join (
  values
    ('enquiry_from', 'Direct E mail by client', 1),
    ('enquiry_from', 'Direct on line tender', 2),
    ('enquiry_from', 'Marketing Department', 3),
    ('enquiry_from', 'Tender by Marketing Department', 4),
    ('enquiry_from', 'Project Department', 5),
    ('enquiry_from', 'Tender by Project Department', 6),
    ('enquiry_from', 'Others', 7),
    ('enquiry_from', 'Tenders by Others', 8),
    ('enquiry_from', 'From Reception', 9),
    ('assigned_to_person', 'Dhaval', 1),
    ('assigned_to_person', 'Sashi', 2),
    ('assigned_to_person', 'Aswin', 3),
    ('assigned_to_person', 'Javed', 4),
    ('assigned_to_person', 'Ankur', 5),
    ('assigned_to_person', 'Mehul sir', 6),
    ('assigned_to_person', 'Kashyap', 7),
    ('assigned_to_person', 'Alka', 8),
    ('assigned_to_person', 'Yash', 9),
    ('assigned_to_person', 'Dipen', 10),
    ('assigned_to_person', 'Sreenath', 11),
    ('current_status', 'Not Started', 1),
    ('current_status', 'Work in Progress', 2),
    ('current_status', 'Completed', 3),
    ('current_status', 'Regret', 4),
    ('priority', 'High (>80%)', 1),
    ('priority', 'Medium (>50%)', 2),
    ('priority', 'Low (<50%)', 3)
) as v(kind_key, value, sort_order)
where k.kind_key = v.kind_key
on conflict (kind_id, value) do nothing;

-- Seed field definitions (form + database driven from this table)
insert into projects.enquiry_field_definitions (
  field_key, label, field_type, section, show_in_entry, show_in_database,
  read_only, required, sort_order, entry_hint, default_value, dropdown_kind_id
)
select
  f.field_key,
  f.label,
  f.field_type,
  f.section,
  f.show_in_entry,
  f.show_in_database,
  f.read_only,
  f.required,
  f.sort_order,
  f.entry_hint,
  f.default_value,
  dk.id
from (
  values
    ('serial_number', 'Serial Number', 'number', null::text, false, true, true, false, 0, null::text, null::text, null::text),
    ('enquiry_receipt_date', 'Enquiry Receipt Date', 'date', 'main', true, true, false, false, 10, 'Fill manually', null::text, null::text),
    ('enquiry_from', 'Enquiry From', 'dropdown', 'main', true, true, false, false, 20, 'Drop down', null::text, 'enquiry_from'),
    ('client_name', 'Client Name', 'text', 'main', true, true, false, true, 30, 'Fill manually', null::text, null::text),
    ('location', 'Location', 'text', 'main', true, true, false, false, 40, 'Fill manually', null::text, null::text),
    ('scope_of_work', 'Scope of Work', 'textarea', 'main', true, true, false, false, 50, 'Fill manually', null::text, null::text),
    ('contact_person', 'Contact Person', 'text', 'contact', true, true, false, false, 60, 'Fill manually', null::text, null::text),
    ('phone_number', 'Phone Number', 'text', 'contact', true, true, false, false, 70, 'Fill manually', null::text, null::text),
    ('email_address', 'Email Address', 'text', 'contact', true, true, false, false, 80, 'Fill manually', null::text, null::text),
    ('target_date', 'Target Date', 'date', 'assignment', true, true, false, false, 90, 'Fill manually', null::text, null::text),
    ('assigned_to_person', 'Assigned To Person', 'dropdown', 'assignment', true, true, false, false, 100, 'Drop down', null::text, 'assigned_to_person'),
    ('assigned_on_date', 'Assigned on Date', 'date', 'assignment', true, true, false, false, 110, 'Fill manually', null::text, null::text),
    ('priority', 'Priority', 'dropdown', 'assignment', true, true, false, false, 120, 'Drop down', null::text, 'priority'),
    ('current_status', 'Current Status', 'dropdown', null::text, false, true, false, false, 130, null::text, 'Not Started', 'current_status'),
    ('remarks', 'Remarks', 'textarea', null::text, false, true, false, false, 140, null::text, null::text, null::text)
) as f(field_key, label, field_type, section, show_in_entry, show_in_database, read_only, required, sort_order, entry_hint, default_value, kind_key)
left join projects.enquiry_dropdown_kinds dk on dk.kind_key = f.kind_key
on conflict (field_key) do nothing;

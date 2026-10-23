-- Quotation Maker: hierarchical rows + maker fields on projects.quotations.
-- Additive / idempotent — safe if legacy Offer Format columns already exist.

create schema if not exists projects;

grant usage on schema projects to postgres, anon, authenticated, service_role;
grant all on all tables in schema projects to authenticated, service_role;
grant all on all sequences in schema projects to authenticated, service_role;
alter default privileges in schema projects
  grant all on tables to authenticated, service_role;
alter default privileges in schema projects
  grant all on sequences to authenticated, service_role;

-- Ensure header table exists (legacy environments may already have a richer shape).
create table if not exists projects.quotations (
  id uuid primary key default gen_random_uuid(),
  offer_no text,
  offer_date date,
  client_name text,
  location text,
  contact_person text,
  contact_no text,
  email_id text,
  quoted_rate numeric(14, 2),
  offer_status text default 'Draft',
  offer_type text,
  subject text,
  scope text,
  terms_text text,
  cover_letter_text text,
  prepared_by_name text,
  prepared_by_designation text,
  owner_name text,
  branch_code text,
  client_code text,
  job_no integer,
  fiscal_year text,
  revision_no integer default 0,
  superseded boolean default false,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'quotation_type'
  ) then
    alter table projects.quotations
      add column quotation_type text
      check (quotation_type is null or quotation_type in ('normal', 'supply', 'installation', 'supply_installation'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'client_address'
  ) then
    alter table projects.quotations add column client_address text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'signatory_name'
  ) then
    alter table projects.quotations add column signatory_name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'signatory_designation'
  ) then
    alter table projects.quotations add column signatory_designation text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'terms'
  ) then
    alter table projects.quotations add column terms jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'maker_status'
  ) then
    alter table projects.quotations
      add column maker_status text
      check (maker_status is null or maker_status in ('draft', 'sent', 'accepted', 'rejected', 'expired'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'grand_total'
  ) then
    alter table projects.quotations add column grand_total numeric(14, 2) default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'supply_total'
  ) then
    alter table projects.quotations add column supply_total numeric(14, 2) default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'install_total'
  ) then
    alter table projects.quotations add column install_total numeric(14, 2) default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'version'
  ) then
    alter table projects.quotations add column version integer default 1;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'quotations' and column_name = 'client_id'
  ) then
    alter table projects.quotations add column client_id uuid;
  end if;
end $$;

create table if not exists projects.quotation_rows (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references projects.quotations (id) on delete cascade,
  parent_row_id uuid references projects.quotation_rows (id) on delete cascade,
  row_type text not null check (row_type in ('heading', 'item')),
  sort_order integer not null default 0,
  description text,
  unit text,
  qty numeric(14, 3) not null default 0,
  rate numeric(14, 2) not null default 0,
  supply_rate numeric(14, 2) not null default 0,
  install_rate numeric(14, 2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint quotation_rows_qty_nonneg check (qty >= 0),
  constraint quotation_rows_rate_nonneg check (rate >= 0 and supply_rate >= 0 and install_rate >= 0)
);

create index if not exists idx_quotation_rows_quotation_sort
  on projects.quotation_rows (quotation_id, sort_order);

create index if not exists idx_quotation_rows_parent
  on projects.quotation_rows (parent_row_id);

create table if not exists projects.quotation_maker_audit (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid references projects.quotations (id) on delete set null,
  action text not null,
  detail jsonb,
  actor_id uuid,
  actor_name text,
  created_at timestamptz default now()
);

create index if not exists idx_quotation_maker_audit_quotation
  on projects.quotation_maker_audit (quotation_id, created_at desc);

alter table projects.quotations enable row level security;
alter table projects.quotation_rows enable row level security;
alter table projects.quotation_maker_audit enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects' and tablename = 'quotations' and policyname = 'quotation_maker_auth_all'
  ) then
    create policy quotation_maker_auth_all on projects.quotations
      for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects' and tablename = 'quotation_rows' and policyname = 'quotation_rows_auth_all'
  ) then
    create policy quotation_rows_auth_all on projects.quotation_rows
      for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects' and tablename = 'quotation_maker_audit' and policyname = 'quotation_maker_audit_auth_all'
  ) then
    create policy quotation_maker_audit_auth_all on projects.quotation_maker_audit
      for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on projects.quotations to authenticated, service_role;
grant select, insert, update, delete on projects.quotation_rows to authenticated, service_role;
grant select, insert, update, delete on projects.quotation_maker_audit to authenticated, service_role;

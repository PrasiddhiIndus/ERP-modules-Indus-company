-- App access config (roles/teams/modules) stored in Supabase.
-- Run this in Supabase SQL Editor.

create table if not exists public.erp_app_access_config (
  id text primary key default 'default',
  updated_at timestamptz not null default now(),
  teams jsonb not null default '[]'::jsonb,
  modules jsonb not null default '[]'::jsonb,
  module_path_prefixes jsonb not null default '{}'::jsonb
);

-- Seed a default config row (safe to re-run).
insert into public.erp_app_access_config (id, teams, modules, module_path_prefixes)
values (
  'default',
  '[
    {"value":"hr","label":"HR"},
    {"value":"compliance","label":"Compliance"},
    {"value":"admin","label":"Admin"},
    {"value":"marketing","label":"Marketing"},
    {"value":"commercialMt","label":"Commercial — Manpower / Training"},
    {"value":"commercialRm","label":"Commercial — R&M / M&M / AMC / IEV"},
    {"value":"billing","label":"Billing"},
    {"value":"operations","label":"Operations"},
    {"value":"projects","label":"Projects"},
    {"value":"procurement","label":"Procurement"},
    {"value":"amc","label":"AMC"},
    {"value":"finance","label":"Finance/Accounts"},
    {"value":"fireTender","label":"Fire Tender"}
  ]'::jsonb,
  '[
    {"value":"hr","label":"HR"},
    {"value":"compliance","label":"Compliance"},
    {"value":"admin","label":"Admin"},
    {"value":"marketing","label":"Marketing"},
    {"value":"commercialMt","label":"Commercial — Manpower / Training"},
    {"value":"commercialRm","label":"Commercial — R&M / M&M / AMC / IEV"},
    {"value":"billing","label":"Billing"},
    {"value":"tracking","label":"Tracking"},
    {"value":"operations","label":"Operations"},
    {"value":"projects","label":"Projects"},
    {"value":"procurement","label":"Procurement"},
    {"value":"amc","label":"AMC"},
    {"value":"finance","label":"Finance/Accounts"},
    {"value":"fireTender","label":"Fire Tender"},
    {"value":"settings","label":"Settings"}
  ]'::jsonb,
  '{}'::jsonb
)
on conflict (id) do nothing;

alter table public.erp_app_access_config enable row level security;

-- Read-only for authenticated users (safe defaults).
drop policy if exists "read app access config" on public.erp_app_access_config;
create policy "read app access config"
on public.erp_app_access_config
for select
to authenticated
using (true);

-- Only super admins should edit config (enforce on server side as needed).
-- For now, do not grant update/insert policies here.


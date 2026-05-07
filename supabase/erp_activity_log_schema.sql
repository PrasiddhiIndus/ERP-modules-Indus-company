-- Activity log table for the ERP UI.
-- Stores all activities; UI should query only last 1 hour by default.
--
-- Suggested setup:
-- 1) Run this in Supabase SQL editor.
-- 2) Enable RLS and add policy to allow authenticated users to insert/select their tenant's rows
--    (if multi-tenant), or global select for admins.
--
-- Minimal version (single-tenant):

create table if not exists public.erp_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null,
  user_email text null,
  action text not null,          -- INSERT | UPDATE | DELETE | UPSERT | RPC | OTHER
  entity text null,              -- e.g. "marketing_enquiries"
  route text null,               -- window.location.pathname
  success boolean not null default true,
  status_code int null,
  details jsonb null             -- minimal payload metadata (no PII)
);

create index if not exists erp_activity_log_created_at_idx on public.erp_activity_log (created_at desc);
create index if not exists erp_activity_log_entity_idx on public.erp_activity_log (entity);
create index if not exists erp_activity_log_user_id_idx on public.erp_activity_log (user_id);

alter table public.erp_activity_log enable row level security;

-- Simple policies (adjust as needed):
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='erp_activity_log' and policyname='erp_activity_log_select'
  ) then
    create policy erp_activity_log_select on public.erp_activity_log
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='erp_activity_log' and policyname='erp_activity_log_insert'
  ) then
    create policy erp_activity_log_insert on public.erp_activity_log
      for insert to authenticated
      with check (true);
  end if;
end$$;

-- Optional: live Activity drawer updates (Realtime). In Supabase SQL editor:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.erp_activity_log;


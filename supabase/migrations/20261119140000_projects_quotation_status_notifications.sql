-- Projects Quotation Master: in-app notifications when offer_status changes.
-- Separate from enquiry_notifications. Recipients: Projects access + Manager/Executive only
-- (Admin / Super Admin excluded). Inserted only AFTER a successful status UPDATE.

create table if not exists projects.quotation_notifications (
  id bigint generated always as identity primary key,
  quotation_id uuid references projects.quotations (id) on delete set null,
  offer_no text,
  client_name text,
  previous_status text,
  new_status text not null,
  kind text not null default 'status_change'
    check (kind in ('status_change')),
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text
);

comment on table projects.quotation_notifications is
  'In-app feed of quotation offer_status changes for Projects Manager/Executive users. Separate from enquiry_notifications.';

create index if not exists quotation_notifications_created_idx
  on projects.quotation_notifications (created_at desc);

create index if not exists quotation_notifications_kind_created_idx
  on projects.quotation_notifications (kind, created_at desc);

create index if not exists quotation_notifications_quotation_idx
  on projects.quotation_notifications (quotation_id, created_at desc);

-- Deduplicate identical transitions in the same UTC second (retry / double-submit safety).
alter table projects.quotation_notifications
  add column if not exists dedupe_key text;

create unique index if not exists quotation_notifications_dedupe_idx
  on projects.quotation_notifications (dedupe_key)
  where dedupe_key is not null;

alter table projects.quotation_notifications enable row level security;

-- Manager / Executive with Projects access (Indus One hierarchy: Manager level or below).
-- Explicitly excludes Admin, HOD, Super Admin, Super Admin Pro.
create or replace function public.current_user_can_receive_quotation_status_notifications()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and public.normalize_erp_role(p.role) in ('executive', 'manager')
        and (
          public.current_user_can_access_module('projects')
          or public.current_user_can_access_projects_data()
        )
    );
$$;

comment on function public.current_user_can_receive_quotation_status_notifications() is
  'True for active Executive/Manager with Projects access. Admin and Super Admin never receive quotation status notifications.';

revoke all on function public.current_user_can_receive_quotation_status_notifications() from public;
grant execute on function public.current_user_can_receive_quotation_status_notifications() to authenticated, service_role;

drop policy if exists "quotation_notifications_select" on projects.quotation_notifications;
create policy "quotation_notifications_select" on projects.quotation_notifications
  for select to authenticated
  using (public.current_user_can_receive_quotation_status_notifications());

revoke all on projects.quotation_notifications from anon, authenticated;
grant select on projects.quotation_notifications to authenticated;
grant all on projects.quotation_notifications to service_role;

create or replace function projects.quotations_notify_status_change()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  if new.offer_status is not distinct from old.offer_status then
    return new;
  end if;

  begin
    insert into projects.quotation_notifications (
      quotation_id,
      offer_no,
      client_name,
      previous_status,
      new_status,
      kind,
      created_by,
      created_by_name,
      dedupe_key
    ) values (
      new.id,
      nullif(btrim(coalesce(new.offer_no, '')), ''),
      nullif(btrim(coalesce(new.client_name, '')), ''),
      nullif(btrim(coalesce(old.offer_status, '')), ''),
      coalesce(nullif(btrim(coalesce(new.offer_status, '')), ''), '—'),
      'status_change',
      auth.uid(),
      projects.current_user_display_name(),
      concat_ws(
        '|',
        new.id::text,
        coalesce(nullif(btrim(coalesce(old.offer_status, '')), ''), ''),
        coalesce(nullif(btrim(coalesce(new.offer_status, '')), ''), ''),
        coalesce(auth.uid()::text, ''),
        to_char((now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS')
      )
    );
  exception
    when unique_violation then
      -- Same status transition already recorded this second — keep the first.
      null;
  end;

  return new;
end;
$$;

revoke all on function projects.quotations_notify_status_change() from public;

drop trigger if exists quotations_notify_status_change on projects.quotations;
create trigger quotations_notify_status_change
  after update of offer_status on projects.quotations
  for each row
  execute function projects.quotations_notify_status_change();

notify pgrst, 'reload schema';

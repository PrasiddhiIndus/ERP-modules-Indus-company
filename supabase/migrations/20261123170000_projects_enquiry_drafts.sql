-- Enquiry Registration drafts ("Save as Draft" on Projects → Enquiry Master → Add Enquiry).
--
-- One draft per user. A draft is the raw form state (field_key → value); it is NOT an
-- enquiry: no serial number, not visible in the Enquiry Database, no approval flow.
-- Registering the enquiry deletes the draft (client side).
--
-- RLS: each user sees and writes only their own row (user_id = auth.uid()).
-- View-only Enquiry Master users cannot create enquiries, so they cannot keep drafts either.
-- Rollback: supabase/rollbacks/20261123170000_projects_enquiry_drafts_down.sql

create table if not exists projects.enquiry_drafts (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  form       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enquiry_drafts_form_is_object check (jsonb_typeof(form) = 'object'),
  constraint enquiry_drafts_form_size check (pg_column_size(form) <= 65536)
);

comment on table projects.enquiry_drafts is
  'Unsubmitted Add Enquiry form per user (Save as Draft). Own-row RLS. Deleted when the enquiry is registered.';

create or replace function projects.enquiry_drafts_touch()
returns trigger
language plpgsql
set search_path = projects, pg_temp
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists enquiry_drafts_touch on projects.enquiry_drafts;
create trigger enquiry_drafts_touch
  before insert or update on projects.enquiry_drafts
  for each row execute function projects.enquiry_drafts_touch();

alter table projects.enquiry_drafts enable row level security;

drop policy if exists enquiry_drafts_own_select on projects.enquiry_drafts;
create policy enquiry_drafts_own_select on projects.enquiry_drafts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists enquiry_drafts_own_insert on projects.enquiry_drafts;
create policy enquiry_drafts_own_insert on projects.enquiry_drafts
  for insert to authenticated
  with check (user_id = auth.uid() and not projects.current_user_enquiry_view_only());

drop policy if exists enquiry_drafts_own_update on projects.enquiry_drafts;
create policy enquiry_drafts_own_update on projects.enquiry_drafts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not projects.current_user_enquiry_view_only());

drop policy if exists enquiry_drafts_own_delete on projects.enquiry_drafts;
create policy enquiry_drafts_own_delete on projects.enquiry_drafts
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table projects.enquiry_drafts from anon;
grant select, insert, update, delete on table projects.enquiry_drafts to authenticated, service_role;

notify pgrst, 'reload schema';

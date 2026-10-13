-- Enquiry Master: deleting an enquiry needs a manager.
--   Manager / Admin / Super Admin (with Projects access) delete directly.
--   Everyone else raises a deletion request; a manager approves (enquiry is
--   deleted) or rejects it (enquiry stays).
-- Viewing, adding and editing enquiries are unchanged.

create or replace function projects.current_user_is_enquiry_approver()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and public.normalize_erp_role(p.role) in ('manager', 'admin', 'super_admin', 'super_admin_pro')
    )
    and public.current_user_can_access_module('projects')
$$;

revoke all on function projects.current_user_is_enquiry_approver() from public;
grant execute on function projects.current_user_is_enquiry_approver() to authenticated, service_role;

-- Enquiries: same open access as before, except delete.
drop policy if exists "enquiries_auth" on projects.enquiries;
drop policy if exists "enquiries_select" on projects.enquiries;
drop policy if exists "enquiries_insert" on projects.enquiries;
drop policy if exists "enquiries_update" on projects.enquiries;
drop policy if exists "enquiries_delete_approver" on projects.enquiries;
create policy "enquiries_select" on projects.enquiries for select to authenticated using (true);
create policy "enquiries_insert" on projects.enquiries for insert to authenticated with check (true);
create policy "enquiries_update" on projects.enquiries for update to authenticated using (true) with check (true);
create policy "enquiries_delete_approver" on projects.enquiries for delete to authenticated
  using ((select projects.current_user_is_enquiry_approver()));

create table if not exists projects.enquiry_deletion_requests (
  id bigint generated always as identity primary key,
  enquiry_id uuid references projects.enquiries (id) on delete set null,
  enquiry_serial bigint,
  enquiry_client text,
  reason text,
  status text not null default 'pending',
  requested_by uuid not null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  constraint enquiry_deletion_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

create unique index if not exists enquiry_deletion_requests_one_pending
  on projects.enquiry_deletion_requests (enquiry_id) where status = 'pending';
create index if not exists enquiry_deletion_requests_status_idx
  on projects.enquiry_deletion_requests (status, requested_at desc);

alter table projects.enquiry_deletion_requests enable row level security;
drop policy if exists "enquiry_deletion_requests_select" on projects.enquiry_deletion_requests;
create policy "enquiry_deletion_requests_select" on projects.enquiry_deletion_requests
  for select to authenticated
  using (requested_by = auth.uid() or (select projects.current_user_is_enquiry_approver()));

revoke all on projects.enquiry_deletion_requests from anon, authenticated;
grant select on projects.enquiry_deletion_requests to authenticated;
grant all on projects.enquiry_deletion_requests to service_role;

create or replace function projects.current_user_display_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select coalesce(nullif(btrim(p.username), ''), p.email::text)
  from public.profiles p where p.id = auth.uid()
$$;

revoke all on function projects.current_user_display_name() from public;

create or replace function projects.request_enquiry_deletion(p_enquiry_id uuid, p_reason text default null)
returns bigint
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_enquiry projects.enquiries%rowtype;
  v_id bigint;
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Enquiry Master.' using errcode = '42501';
  end if;

  select * into v_enquiry from projects.enquiries where id = p_enquiry_id;
  if not found then
    raise exception 'This enquiry no longer exists.';
  end if;

  select id into v_id from projects.enquiry_deletion_requests
   where enquiry_id = p_enquiry_id and status = 'pending';
  if found then
    return v_id;
  end if;

  insert into projects.enquiry_deletion_requests
    (enquiry_id, enquiry_serial, enquiry_client, reason, requested_by, requested_by_name)
  values (
    p_enquiry_id,
    v_enquiry.serial_number,
    nullif(btrim(v_enquiry.data->>'client_name'), ''),
    nullif(btrim(p_reason), ''),
    auth.uid(),
    projects.current_user_display_name()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function projects.request_enquiry_deletion(uuid, text) from public;
grant execute on function projects.request_enquiry_deletion(uuid, text) to authenticated, service_role;

create or replace function projects.decide_enquiry_deletion(p_request_id bigint, p_approve boolean, p_note text default null)
returns text
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_req projects.enquiry_deletion_requests%rowtype;
begin
  if not projects.current_user_is_enquiry_approver() then
    raise exception 'Only a manager can approve or reject enquiry deletions.' using errcode = '42501';
  end if;

  select * into v_req from projects.enquiry_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'This deletion request no longer exists.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This deletion request was already %.', v_req.status;
  end if;

  update projects.enquiry_deletion_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decided_by_name = projects.current_user_display_name(),
         decided_at = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_request_id;

  if p_approve and v_req.enquiry_id is not null then
    delete from projects.enquiries where id = v_req.enquiry_id;
  end if;

  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function projects.decide_enquiry_deletion(bigint, boolean, text) from public;
grant execute on function projects.decide_enquiry_deletion(bigint, boolean, text) to authenticated, service_role;

-- A manager deleting an enquiry directly also settles any pending request for it.
create or replace function projects.enquiries_settle_deletion_requests()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  update projects.enquiry_deletion_requests
     set status = 'approved',
         decided_by = auth.uid(),
         decided_by_name = projects.current_user_display_name(),
         decided_at = now()
   where enquiry_id = old.id and status = 'pending';
  return old;
end;
$$;

revoke all on function projects.enquiries_settle_deletion_requests() from public;

drop trigger if exists enquiries_settle_deletion_requests on projects.enquiries;
create trigger enquiries_settle_deletion_requests
  before delete on projects.enquiries
  for each row
  execute function projects.enquiries_settle_deletion_requests();

notify pgrst, 'reload schema';

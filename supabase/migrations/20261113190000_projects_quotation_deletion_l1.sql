-- Quotation Master: delete requires L1 approval (Employee Master reporting manager).
-- Admin / Super Admin can still approve any request. Soft-fail friendly if EM L1 missing.

create table if not exists projects.quotation_deletion_requests (
  id bigint generated always as identity primary key,
  quotation_id uuid references projects.quotations (id) on delete set null,
  offer_no text,
  client_name text,
  reason text,
  status text not null default 'pending',
  requested_by uuid not null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  l1_manager_code text,
  l2_manager_code text,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  constraint quotation_deletion_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create unique index if not exists quotation_deletion_requests_one_pending
  on projects.quotation_deletion_requests (quotation_id)
  where status = 'pending';

create index if not exists quotation_deletion_requests_status_idx
  on projects.quotation_deletion_requests (status, requested_at desc);

create index if not exists quotation_deletion_requests_l1_idx
  on projects.quotation_deletion_requests (l1_manager_code, requested_at)
  where status = 'pending';

alter table projects.quotation_deletion_requests enable row level security;

drop policy if exists "quotation_deletion_requests_select" on projects.quotation_deletion_requests;
create policy "quotation_deletion_requests_select" on projects.quotation_deletion_requests
  for select to authenticated
  using (
    requested_by = auth.uid()
    or projects.current_user_is_enquiry_edit_decider(requested_by, l1_manager_code)
  );

revoke all on projects.quotation_deletion_requests from anon, authenticated;
grant select on projects.quotation_deletion_requests to authenticated;
grant all on projects.quotation_deletion_requests to service_role;

create or replace function projects.request_quotation_deletion(
  p_quotation_id uuid,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_q projects.quotations%rowtype;
  v_id bigint;
  v_l1 text;
  v_l2 text;
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Quotation Master.' using errcode = '42501';
  end if;

  select * into v_q from projects.quotations where id = p_quotation_id;
  if not found then
    raise exception 'This quotation no longer exists.';
  end if;

  select id into v_id
  from projects.quotation_deletion_requests
  where quotation_id = p_quotation_id and status = 'pending';
  if found then
    return v_id;
  end if;

  select m.l1_manager_code, m.l2_manager_code
    into v_l1, v_l2
  from projects.enquiry_employee_manager_codes(auth.uid()) m;

  if nullif(btrim(coalesce(v_l1, '')), '') is null then
    raise exception
      'Your reporting manager is not set in Employee Master. Ask HR to set your L1 manager before requesting deletion.';
  end if;

  insert into projects.quotation_deletion_requests (
    quotation_id, offer_no, client_name, reason,
    requested_by, requested_by_name, l1_manager_code, l2_manager_code
  ) values (
    p_quotation_id,
    nullif(btrim(v_q.offer_no), ''),
    nullif(btrim(v_q.client_name), ''),
    nullif(btrim(p_reason), ''),
    auth.uid(),
    projects.current_user_display_name(),
    v_l1,
    v_l2
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function projects.request_quotation_deletion(uuid, text) from public;
grant execute on function projects.request_quotation_deletion(uuid, text) to authenticated, service_role;

create or replace function projects.decide_quotation_deletion(
  p_request_id bigint,
  p_approve boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_req projects.quotation_deletion_requests%rowtype;
begin
  select * into v_req
  from projects.quotation_deletion_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'This deletion request no longer exists.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This deletion request was already %.', v_req.status;
  end if;

  if not projects.current_user_is_enquiry_edit_decider(v_req.requested_by, v_req.l1_manager_code) then
    raise exception 'Only this employee''s L1 manager can approve or reject quotation deletions.'
      using errcode = '42501';
  end if;

  update projects.quotation_deletion_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decided_by_name = projects.current_user_display_name(),
         decided_at = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_request_id;

  if p_approve and v_req.quotation_id is not null then
    if to_regclass('projects.quotation_followups') is not null then
      execute 'delete from projects.quotation_followups where quotation_id = $1' using v_req.quotation_id;
    end if;
    if to_regclass('projects.quotation_attachments') is not null then
      execute 'delete from projects.quotation_attachments where quotation_id = $1' using v_req.quotation_id;
    end if;
    if to_regclass('projects.quotation_line_items') is not null then
      execute 'delete from projects.quotation_line_items where quotation_id = $1' using v_req.quotation_id;
    end if;
    if to_regclass('projects.quotation_maker_audit') is not null then
      execute 'delete from projects.quotation_maker_audit where quotation_id = $1' using v_req.quotation_id;
    end if;
    if to_regclass('projects.quotation_rows') is not null then
      execute 'delete from projects.quotation_rows where quotation_id = $1' using v_req.quotation_id;
    end if;
    delete from projects.quotations where id = v_req.quotation_id;
  end if;

  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function projects.decide_quotation_deletion(bigint, boolean, text) from public;
grant execute on function projects.decide_quotation_deletion(bigint, boolean, text) to authenticated, service_role;

create or replace function projects.quotations_settle_deletion_requests()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  update projects.quotation_deletion_requests
     set status = 'approved',
         decided_by = auth.uid(),
         decided_by_name = projects.current_user_display_name(),
         decided_at = now()
   where quotation_id = old.id and status = 'pending';
  return old;
end;
$$;

drop trigger if exists quotations_settle_deletion_requests on projects.quotations;
create trigger quotations_settle_deletion_requests
  before delete on projects.quotations
  for each row
  execute function projects.quotations_settle_deletion_requests();

-- Super Admin / Super Admin Pro: delete immediately (no L1 request).
create or replace function projects.delete_quotation_as_super_admin(p_quotation_id uuid)
returns text
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_role text;
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Quotation Master.' using errcode = '42501';
  end if;

  select public.normalize_erp_role(p.role) into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is distinct from 'super_admin' and v_role is distinct from 'super_admin_pro' then
    raise exception 'Only a Super Admin can delete a quotation without L1 approval.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from projects.quotations where id = p_quotation_id) then
    raise exception 'This quotation no longer exists.';
  end if;

  if to_regclass('projects.quotation_followups') is not null then
    execute 'delete from projects.quotation_followups where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_attachments') is not null then
    execute 'delete from projects.quotation_attachments where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_line_items') is not null then
    execute 'delete from projects.quotation_line_items where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_maker_audit') is not null then
    execute 'delete from projects.quotation_maker_audit where quotation_id = $1' using p_quotation_id;
  end if;
  if to_regclass('projects.quotation_rows') is not null then
    execute 'delete from projects.quotation_rows where quotation_id = $1' using p_quotation_id;
  end if;

  delete from projects.quotations where id = p_quotation_id;
  return 'deleted';
end;
$$;

revoke all on function projects.delete_quotation_as_super_admin(uuid) from public;
grant execute on function projects.delete_quotation_as_super_admin(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

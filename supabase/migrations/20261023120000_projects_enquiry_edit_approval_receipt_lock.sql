-- Enquiry Master:
--   1) Lock Enquiry Receipt Date once it has been saved (same idea as Assigned on Date).
--   2) After the first save, non-manager edits go to L1 (manager) for approval.
--   3) Applied field changes are kept in a history log for the history icon.

-- ---------------------------------------------------------------------------
-- Lock enquiry_receipt_date once filled
-- ---------------------------------------------------------------------------
create or replace function projects.enquiries_keep_enquiry_receipt_date()
returns trigger
language plpgsql
set search_path = projects, pg_temp
as $$
begin
  if coalesce(btrim(old.data->>'enquiry_receipt_date'), '') <> ''
     and (new.data->>'enquiry_receipt_date') is distinct from (old.data->>'enquiry_receipt_date') then
    new.data := jsonb_set(
      coalesce(new.data, '{}'::jsonb),
      '{enquiry_receipt_date}',
      old.data->'enquiry_receipt_date',
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists enquiries_keep_enquiry_receipt_date on projects.enquiries;
create trigger enquiries_keep_enquiry_receipt_date
  before update on projects.enquiries
  for each row
  execute function projects.enquiries_keep_enquiry_receipt_date();

-- ---------------------------------------------------------------------------
-- Field change history (written whenever enquiry data actually changes)
-- ---------------------------------------------------------------------------
create table if not exists projects.enquiry_field_change_history (
  id bigint generated always as identity primary key,
  enquiry_id uuid not null references projects.enquiries (id) on delete cascade,
  field_key text not null,
  field_label text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  source text not null default 'direct',
  edit_request_id bigint,
  constraint enquiry_field_change_history_source_check
    check (source in ('direct', 'approved_request'))
);

create index if not exists enquiry_field_change_history_enquiry_idx
  on projects.enquiry_field_change_history (enquiry_id, changed_at desc);

alter table projects.enquiry_field_change_history enable row level security;
drop policy if exists "enquiry_field_change_history_select" on projects.enquiry_field_change_history;
create policy "enquiry_field_change_history_select" on projects.enquiry_field_change_history
  for select to authenticated using (true);

revoke all on projects.enquiry_field_change_history from anon, authenticated;
grant select on projects.enquiry_field_change_history to authenticated;
grant all on projects.enquiry_field_change_history to service_role;

create or replace function projects.enquiries_log_field_changes()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_key text;
  v_old text;
  v_new text;
  v_label text;
  v_source text;
  v_req_id bigint;
  v_name text;
begin
  if old.data is not distinct from new.data then
    return new;
  end if;

  v_source := coalesce(nullif(current_setting('projects.enquiry_edit_source', true), ''), 'direct');
  begin
    v_req_id := nullif(current_setting('projects.enquiry_edit_request_id', true), '')::bigint;
  exception when others then
    v_req_id := null;
  end;
  v_name := projects.current_user_display_name();

  for v_key in
    select distinct k
    from (
      select jsonb_object_keys(coalesce(old.data, '{}'::jsonb)) as k
      union
      select jsonb_object_keys(coalesce(new.data, '{}'::jsonb)) as k
    ) keys
  loop
    v_old := nullif(btrim(coalesce(old.data->>v_key, '')), '');
    v_new := nullif(btrim(coalesce(new.data->>v_key, '')), '');
    if v_old is not distinct from v_new then
      continue;
    end if;
    select label into v_label
      from projects.enquiry_field_definitions
     where field_key = v_key;
    insert into projects.enquiry_field_change_history (
      enquiry_id, field_key, field_label, old_value, new_value,
      changed_by, changed_by_name, source, edit_request_id
    ) values (
      new.id, v_key, coalesce(v_label, v_key), v_old, v_new,
      auth.uid(), v_name, v_source, v_req_id
    );
  end loop;

  -- A direct save by L1 replaces any outstanding edit request.
  if v_source is distinct from 'approved_request' then
    update projects.enquiry_edit_requests
       set status = 'rejected',
           decided_by = auth.uid(),
           decided_by_name = v_name,
           decided_at = now(),
           decision_note = coalesce(nullif(btrim(decision_note), ''), 'Superseded by a later save')
     where enquiry_id = new.id
       and status = 'pending';
  end if;

  return new;
end;
$$;

revoke all on function projects.enquiries_log_field_changes() from public;

drop trigger if exists enquiries_log_field_changes on projects.enquiries;
create trigger enquiries_log_field_changes
  after update on projects.enquiries
  for each row
  execute function projects.enquiries_log_field_changes();

-- ---------------------------------------------------------------------------
-- Only L1 (manager / admin / super admin) may update enquiries directly.
-- Everyone else submits an edit request.
-- ---------------------------------------------------------------------------
drop policy if exists "enquiries_update" on projects.enquiries;
create policy "enquiries_update" on projects.enquiries
  for update to authenticated
  using ((select projects.current_user_is_enquiry_approver()))
  with check ((select projects.current_user_is_enquiry_approver()));

create table if not exists projects.enquiry_edit_requests (
  id bigint generated always as identity primary key,
  enquiry_id uuid not null references projects.enquiries (id) on delete cascade,
  enquiry_serial bigint,
  enquiry_client text,
  proposed_data jsonb not null default '{}'::jsonb,
  changes jsonb not null default '[]'::jsonb,
  reason text,
  status text not null default 'pending',
  requested_by uuid not null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  constraint enquiry_edit_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

create unique index if not exists enquiry_edit_requests_one_pending
  on projects.enquiry_edit_requests (enquiry_id) where status = 'pending';
create index if not exists enquiry_edit_requests_status_idx
  on projects.enquiry_edit_requests (status, requested_at desc);

alter table projects.enquiry_edit_requests enable row level security;
drop policy if exists "enquiry_edit_requests_select" on projects.enquiry_edit_requests;
create policy "enquiry_edit_requests_select" on projects.enquiry_edit_requests
  for select to authenticated
  using (requested_by = auth.uid() or (select projects.current_user_is_enquiry_approver()));

revoke all on projects.enquiry_edit_requests from anon, authenticated;
grant select on projects.enquiry_edit_requests to authenticated;
grant all on projects.enquiry_edit_requests to service_role;

create or replace function projects.enquiry_data_changes(p_old jsonb, p_new jsonb)
returns jsonb
language plpgsql
stable
set search_path = projects, pg_temp
as $$
declare
  v_key text;
  v_old text;
  v_new text;
  v_label text;
  v_out jsonb := '[]'::jsonb;
begin
  for v_key in
    select distinct k
    from (
      select jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) as k
      union
      select jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) as k
    ) keys
  loop
    v_old := nullif(btrim(coalesce(p_old->>v_key, '')), '');
    v_new := nullif(btrim(coalesce(p_new->>v_key, '')), '');
    if v_old is not distinct from v_new then
      continue;
    end if;
    select label into v_label
      from projects.enquiry_field_definitions
     where field_key = v_key;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'field_key', v_key,
      'label', coalesce(v_label, v_key),
      'old_value', to_jsonb(v_old),
      'new_value', to_jsonb(v_new)
    ));
  end loop;
  return v_out;
end;
$$;

revoke all on function projects.enquiry_data_changes(jsonb, jsonb) from public;
grant execute on function projects.enquiry_data_changes(jsonb, jsonb) to authenticated, service_role;

create or replace function projects.request_enquiry_edit(
  p_enquiry_id uuid,
  p_proposed_data jsonb,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_enquiry projects.enquiries%rowtype;
  v_changes jsonb;
  v_id bigint;
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Enquiry Master.' using errcode = '42501';
  end if;

  if projects.current_user_is_enquiry_approver() then
    raise exception 'Managers can save enquiry edits directly.' using errcode = 'P0001';
  end if;

  select * into v_enquiry from projects.enquiries where id = p_enquiry_id;
  if not found then
    raise exception 'This enquiry no longer exists.';
  end if;

  v_changes := projects.enquiry_data_changes(v_enquiry.data, coalesce(p_proposed_data, '{}'::jsonb));
  if jsonb_array_length(v_changes) = 0 then
    raise exception 'No field changes to send for approval.';
  end if;

  select id into v_id from projects.enquiry_edit_requests
   where enquiry_id = p_enquiry_id and status = 'pending';
  if found then
    update projects.enquiry_edit_requests
       set proposed_data = coalesce(p_proposed_data, '{}'::jsonb),
           changes = v_changes,
           reason = nullif(btrim(p_reason), ''),
           requested_by = auth.uid(),
           requested_by_name = projects.current_user_display_name(),
           requested_at = now()
     where id = v_id;
    return v_id;
  end if;

  insert into projects.enquiry_edit_requests (
    enquiry_id, enquiry_serial, enquiry_client, proposed_data, changes,
    reason, requested_by, requested_by_name
  ) values (
    p_enquiry_id,
    v_enquiry.serial_number,
    nullif(btrim(v_enquiry.data->>'client_name'), ''),
    coalesce(p_proposed_data, '{}'::jsonb),
    v_changes,
    nullif(btrim(p_reason), ''),
    auth.uid(),
    projects.current_user_display_name()
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function projects.request_enquiry_edit(uuid, jsonb, text) from public;
grant execute on function projects.request_enquiry_edit(uuid, jsonb, text) to authenticated, service_role;

create or replace function projects.decide_enquiry_edit(
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
  v_req projects.enquiry_edit_requests%rowtype;
begin
  if not projects.current_user_is_enquiry_approver() then
    raise exception 'Only a manager can approve or reject enquiry edits.' using errcode = '42501';
  end if;

  select * into v_req from projects.enquiry_edit_requests where id = p_request_id for update;
  if not found then
    raise exception 'This edit request no longer exists.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This edit request was already %.', v_req.status;
  end if;

  update projects.enquiry_edit_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decided_by_name = projects.current_user_display_name(),
         decided_at = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_request_id;

  if p_approve then
    perform set_config('projects.enquiry_edit_source', 'approved_request', true);
    perform set_config('projects.enquiry_edit_request_id', p_request_id::text, true);
    update projects.enquiries
       set data = coalesce(v_req.proposed_data, '{}'::jsonb),
           updated_at = now()
     where id = v_req.enquiry_id;
  end if;

  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function projects.decide_enquiry_edit(bigint, boolean, text) from public;
grant execute on function projects.decide_enquiry_edit(bigint, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';

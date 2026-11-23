-- Enquiry Master: Target Date + Completed Date always require L1 for non-managers.
-- Pending proposed dates stay on enquiry_edit_requests until decide_enquiry_edit.
-- Reject notifies the requester; live enquiries.data is unchanged on reject.

-- ---------------------------------------------------------------------------
-- Notifications: allow edit decision kinds + optional recipient
-- ---------------------------------------------------------------------------
alter table projects.enquiry_notifications
  add column if not exists recipient_user_id uuid;

alter table projects.enquiry_notifications
  drop constraint if exists enquiry_notifications_kind_check;

alter table projects.enquiry_notifications
  add constraint enquiry_notifications_kind_check
  check (kind in ('completed', 'edit_approved', 'edit_rejected'));

create index if not exists enquiry_notifications_recipient_created_idx
  on projects.enquiry_notifications (recipient_user_id, created_at desc)
  where recipient_user_id is not null;

drop policy if exists "enquiry_notifications_select" on projects.enquiry_notifications;
create policy "enquiry_notifications_select" on projects.enquiry_notifications
  for select to authenticated
  using (
    public.current_user_can_access_module('projects')
    and (recipient_user_id is null or recipient_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- decide_enquiry_edit: notify requester; dates apply only on approve
-- ---------------------------------------------------------------------------
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
  v_status text;
begin
  select * into v_req from projects.enquiry_edit_requests where id = p_request_id for update;
  if not found then
    raise exception 'This edit request no longer exists.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This edit request was already %.', v_req.status;
  end if;

  if not projects.current_user_is_enquiry_edit_decider(v_req.requested_by, v_req.l1_manager_code) then
    raise exception 'Only this employee''s L1 manager can approve or reject enquiry edits.' using errcode = '42501';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update projects.enquiry_edit_requests
     set status = v_status,
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

  if v_req.requested_by is not null then
    insert into projects.enquiry_notifications (
      enquiry_id, enquiry_serial, enquiry_client, kind,
      created_by, created_by_name, recipient_user_id
    ) values (
      v_req.enquiry_id,
      v_req.enquiry_serial,
      v_req.enquiry_client,
      case when p_approve then 'edit_approved' else 'edit_rejected' end,
      auth.uid(),
      projects.current_user_display_name(),
      v_req.requested_by
    );
  end if;

  return v_status;
end;
$$;

revoke all on function projects.decide_enquiry_edit(bigint, boolean, text) from public;
grant execute on function projects.decide_enquiry_edit(bigint, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_enquiry_progress: block Target Date / Completed Date bypass
-- ---------------------------------------------------------------------------
create or replace function projects.apply_enquiry_progress(
  p_enquiry_id uuid,
  p_proposed_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_enquiry projects.enquiries%rowtype;
  v_data jsonb;
  v_status text;
  v_old_target text;
  v_new_target text;
  v_old_completed text;
  v_new_completed text;
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Enquiry Master.' using errcode = '42501';
  end if;

  select * into v_enquiry from projects.enquiries where id = p_enquiry_id for update;
  if not found then
    raise exception 'This enquiry no longer exists.';
  end if;

  v_data := coalesce(p_proposed_data, v_enquiry.data, '{}'::jsonb);
  v_status := projects.enquiry_status_lower(v_data);

  if v_status not in ('not started', 'work in progress') then
    raise exception 'Only Not Started or Work in Progress can be applied without L1 approval.';
  end if;

  v_old_target := nullif(btrim(coalesce(v_enquiry.data->>'target_date', '')), '');
  v_new_target := nullif(btrim(coalesce(v_data->>'target_date', '')), '');
  if v_old_target is distinct from v_new_target then
    raise exception 'Target Date changes must be sent for L1 approval.';
  end if;

  v_old_completed := nullif(btrim(coalesce(v_enquiry.data->>'completed_on', '')), '');
  v_new_completed := nullif(btrim(coalesce(v_data->>'completed_on', '')), '');
  if v_old_completed is distinct from v_new_completed then
    raise exception 'Completed Date changes must be sent for L1 approval.';
  end if;

  -- Keep locked receipt / assigned-on dates from the existing row.
  if nullif(btrim(coalesce(v_enquiry.data->>'enquiry_receipt_date', '')), '') is not null then
    v_data := jsonb_set(v_data, '{enquiry_receipt_date}', v_enquiry.data->'enquiry_receipt_date');
  end if;
  if nullif(btrim(coalesce(v_enquiry.data->>'assigned_on_date', '')), '') is not null then
    v_data := jsonb_set(v_data, '{assigned_on_date}', v_enquiry.data->'assigned_on_date');
  end if;

  update projects.enquiries
     set data = v_data,
         updated_at = now()
   where id = p_enquiry_id
   returning * into v_enquiry;

  return jsonb_build_object(
    'id', v_enquiry.id,
    'serial_number', v_enquiry.serial_number,
    'status', v_status
  );
end;
$$;

revoke all on function projects.apply_enquiry_progress(uuid, jsonb) from public;
grant execute on function projects.apply_enquiry_progress(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_enquiry_completed: block Target Date / Completed Date bypass
-- ---------------------------------------------------------------------------
create or replace function projects.apply_enquiry_completed(
  p_enquiry_id uuid,
  p_proposed_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_enquiry projects.enquiries%rowtype;
  v_data jsonb;
  v_status text;
  v_old_target text;
  v_new_target text;
  v_old_completed text;
  v_new_completed text;
begin
  if auth.uid() is null or not public.current_user_can_access_module('projects') then
    raise exception 'You do not have access to Enquiry Master.' using errcode = '42501';
  end if;

  select * into v_enquiry from projects.enquiries where id = p_enquiry_id for update;
  if not found then
    raise exception 'This enquiry no longer exists.';
  end if;

  v_data := coalesce(p_proposed_data, v_enquiry.data, '{}'::jsonb);
  v_status := projects.enquiry_status_lower(v_data);

  if v_status = 'regret' then
    raise exception 'Regret must be sent for L1 approval.';
  end if;
  if v_status <> 'completed' then
    raise exception 'Only Completed status can be applied without L1 approval.';
  end if;

  v_old_target := nullif(btrim(coalesce(v_enquiry.data->>'target_date', '')), '');
  v_new_target := nullif(btrim(coalesce(v_data->>'target_date', '')), '');
  if v_old_target is distinct from v_new_target then
    raise exception 'Target Date changes must be sent for L1 approval.';
  end if;

  v_old_completed := nullif(btrim(coalesce(v_enquiry.data->>'completed_on', '')), '');
  v_new_completed := nullif(btrim(coalesce(v_data->>'completed_on', '')), '');

  -- Entering or changing Completed Date always needs L1 (no silent auto-fill).
  if v_old_completed is null and v_new_completed is null then
    raise exception 'Completed Date must be sent for L1 approval.';
  end if;

  if v_old_completed is distinct from v_new_completed then
    raise exception 'Completed Date changes must be sent for L1 approval.';
  end if;

  -- Keep locked receipt / assigned-on dates from the existing row.
  if nullif(btrim(coalesce(v_enquiry.data->>'enquiry_receipt_date', '')), '') is not null then
    v_data := jsonb_set(v_data, '{enquiry_receipt_date}', v_enquiry.data->'enquiry_receipt_date');
  end if;
  if nullif(btrim(coalesce(v_enquiry.data->>'assigned_on_date', '')), '') is not null then
    v_data := jsonb_set(v_data, '{assigned_on_date}', v_enquiry.data->'assigned_on_date');
  end if;

  -- Preserve existing completed_on (must already match proposed).
  if v_old_completed is not null then
    v_data := jsonb_set(v_data, '{completed_on}', v_enquiry.data->'completed_on');
  end if;

  update projects.enquiries
     set data = v_data,
         updated_at = now()
   where id = p_enquiry_id
   returning * into v_enquiry;

  return jsonb_build_object(
    'id', v_enquiry.id,
    'serial_number', v_enquiry.serial_number,
    'status', 'completed'
  );
end;
$$;

revoke all on function projects.apply_enquiry_completed(uuid, jsonb) from public;
grant execute on function projects.apply_enquiry_completed(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Enquiry Master approval:
--   1) Progress statuses (Not Started / Work in Progress) apply without L1.
--   2) A past Completed Date must go for L1 approval.
--   3) L1 is the requester's reporting manager from admin_ifsp_employee_master
--      (l1_manager_code; l2_manager_code stored for reference).

-- ---------------------------------------------------------------------------
-- Edit requests: store the employee's L1 / L2 at request time
-- ---------------------------------------------------------------------------
alter table projects.enquiry_edit_requests
  add column if not exists l1_manager_code text,
  add column if not exists l2_manager_code text;

comment on column projects.enquiry_edit_requests.l1_manager_code is
  'Requester L1 manager employee code from admin_ifsp_employee_master at request time.';
comment on column projects.enquiry_edit_requests.l2_manager_code is
  'Requester L2 manager employee code from admin_ifsp_employee_master at request time.';

create index if not exists enquiry_edit_requests_l1_pending_idx
  on projects.enquiry_edit_requests (l1_manager_code, requested_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Helpers: employee hierarchy + who may decide an edit request
-- ---------------------------------------------------------------------------
create or replace function projects.enquiry_employee_manager_codes(p_user_id uuid)
returns table (l1_manager_code text, l2_manager_code text)
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select
    nullif(btrim(m.l1_manager_code), ''),
    nullif(btrim(m.l2_manager_code), '')
  from public.profiles p
  join public.admin_ifsp_employee_master m
    on lower(btrim(m.employee_code)) = lower(btrim(p.employee_code))
  where p.id = p_user_id
    and nullif(btrim(p.employee_code), '') is not null
  order by m.updated_at desc nulls last
  limit 1;
$$;

revoke all on function projects.enquiry_employee_manager_codes(uuid) from public;
grant execute on function projects.enquiry_employee_manager_codes(uuid) to authenticated, service_role;

create or replace function projects.current_user_is_enquiry_edit_decider(p_requested_by uuid, p_l1_manager_code text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_my_code text := lower(btrim(coalesce(public.current_user_employee_code(), '')));
  v_l1 text := lower(btrim(coalesce(p_l1_manager_code, '')));
  v_role text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select public.normalize_erp_role(p.role) into v_role
  from public.profiles p
  where p.id = auth.uid();

  -- Ops override
  if v_role in ('admin', 'super_admin', 'super_admin_pro') then
    return public.current_user_can_access_module('projects');
  end if;

  if v_my_code = '' then
    return false;
  end if;

  if v_l1 <> '' and v_l1 = v_my_code then
    return public.current_user_can_access_module('projects');
  end if;

  -- Fall back to live Employee Master if the request row has no stored L1
  if v_l1 = '' and p_requested_by is not null then
    return exists (
      select 1
      from projects.enquiry_employee_manager_codes(p_requested_by) m
      where lower(btrim(coalesce(m.l1_manager_code, ''))) = v_my_code
    )
    and public.current_user_can_access_module('projects');
  end if;

  return false;
end;
$$;

revoke all on function projects.current_user_is_enquiry_edit_decider(uuid, text) from public;
grant execute on function projects.current_user_is_enquiry_edit_decider(uuid, text) to authenticated, service_role;

drop policy if exists "enquiry_edit_requests_select" on projects.enquiry_edit_requests;
create policy "enquiry_edit_requests_select" on projects.enquiry_edit_requests
  for select to authenticated
  using (
    requested_by = auth.uid()
    or projects.current_user_is_enquiry_edit_decider(requested_by, l1_manager_code)
  );

-- ---------------------------------------------------------------------------
-- request_enquiry_edit: resolve L1/L2 from employee master
-- ---------------------------------------------------------------------------
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
  v_l1 text;
  v_l2 text;
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

  select m.l1_manager_code, m.l2_manager_code
    into v_l1, v_l2
  from projects.enquiry_employee_manager_codes(auth.uid()) m;

  if nullif(btrim(coalesce(v_l1, '')), '') is null then
    raise exception
      'Your reporting manager is not set in Employee Master. Ask HR to set your L1 manager before sending for approval.';
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
           requested_at = now(),
           l1_manager_code = v_l1,
           l2_manager_code = v_l2
     where id = v_id;
    return v_id;
  end if;

  insert into projects.enquiry_edit_requests (
    enquiry_id, enquiry_serial, enquiry_client, proposed_data, changes,
    reason, requested_by, requested_by_name, l1_manager_code, l2_manager_code
  ) values (
    p_enquiry_id,
    v_enquiry.serial_number,
    nullif(btrim(v_enquiry.data->>'client_name'), ''),
    coalesce(p_proposed_data, '{}'::jsonb),
    v_changes,
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

revoke all on function projects.request_enquiry_edit(uuid, jsonb, text) from public;
grant execute on function projects.request_enquiry_edit(uuid, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- decide_enquiry_edit: only that employee's L1 (or admin override)
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

-- ---------------------------------------------------------------------------
-- Direct apply: progress statuses (Not Started / Work in Progress)
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
  v_completed text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
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

  v_completed := nullif(btrim(coalesce(v_data->>'completed_on', '')), '');
  if v_completed is not null then
    begin
      if v_completed::date < v_today then
        raise exception 'A past completed date must be sent for L1 approval.';
      end if;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Completed date is not a valid date.';
    end;
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
-- Completed without L1: block past completed dates
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
  v_completed text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
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

  if nullif(btrim(coalesce(v_data->>'completed_on', '')), '') is null then
    v_data := jsonb_set(
      v_data,
      '{completed_on}',
      to_jsonb(to_char(v_today, 'YYYY-MM-DD'))
    );
  end if;

  v_completed := nullif(btrim(coalesce(v_data->>'completed_on', '')), '');
  if v_completed is not null then
    begin
      if v_completed::date < v_today then
        raise exception 'A past completed date must be sent for L1 approval.';
      end if;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Completed date is not a valid date.';
    end;
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
    'status', 'completed'
  );
end;
$$;

revoke all on function projects.apply_enquiry_completed(uuid, jsonb) from public;
grant execute on function projects.apply_enquiry_completed(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

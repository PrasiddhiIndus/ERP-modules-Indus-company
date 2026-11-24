-- Quotation notifications → Projects Department L1 authority.
--
-- Recipients are resolved dynamically from Employee Master:
--   department = Projects (aliases) AND (L1 authority designation OR listed as
--   l1_manager_code for active Projects staff). No employee name/code hardcoding.
--
-- Reuses projects.quotation_notifications. Adds approval / rejection kinds and
-- inserts from decide_quotation_order_lost / decide_quotation_deletion so reject
-- (which does not change offer_status) still notifies. Existing status_change
-- trigger is unchanged for other workflows.
--
-- Rollback: supabase/rollbacks/20261124100000_projects_quotation_l1_notifications_down.sql

-- ---------------------------------------------------------------------------
-- Department + designation / authority mapping (no hardcoded people)
-- ---------------------------------------------------------------------------
create or replace function projects.is_projects_department(p_department text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(regexp_replace(coalesce(p_department, ''), '\s+', ' ', 'g')))
    in ('projects', 'project');
$$;

comment on function projects.is_projects_department(text) is
  'True when Employee Master department is Projects (including Project alias).';

revoke all on function projects.is_projects_department(text) from public;
grant execute on function projects.is_projects_department(text) to authenticated, service_role;

-- Manager / Senior Manager (and "Manager - …" variants). Excludes Assistant / Asst.
create or replace function projects.is_projects_l1_authority_designation(p_designation text)
returns boolean
language sql
immutable
as $$
  select
    v <> ''
    and v !~ '(^|[^a-z])(assistant|asst\.?)([^a-z]|$)'
    and (
      v in ('manager', 'senior manager')
      or v ~ '^(senior[[:space:]]+)?manager([[:space:]]|$|-|/)'
    )
  from (
    select lower(btrim(regexp_replace(coalesce(p_designation, ''), '\s+', ' ', 'g'))) as v
  ) s;
$$;

comment on function projects.is_projects_l1_authority_designation(text) is
  'True for Projects L1 authority designations (Manager / Senior Manager family). Not Assistant Manager.';

revoke all on function projects.is_projects_l1_authority_designation(text) from public;
grant execute on function projects.is_projects_l1_authority_designation(text) to authenticated, service_role;

create or replace function projects.normalize_employee_code_key(p_code text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p_code, ''))), '');
$$;

revoke all on function projects.normalize_employee_code_key(text) from public;
grant execute on function projects.normalize_employee_code_key(text) to authenticated, service_role;

-- Profile user ids for active Projects Department L1 authorities.
create or replace function projects.projects_department_l1_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
  with active_projects as (
    select
      projects.normalize_employee_code_key(em.employee_code::text) as code_key,
      em.designation,
      projects.normalize_employee_code_key(em.l1_manager_code::text) as l1_code_key
    from public.admin_ifsp_employee_master em
    where projects.is_projects_department(em.department)
      and lower(btrim(coalesce(em.status, 'active'))) = 'active'
      and projects.normalize_employee_code_key(em.employee_code::text) is not null
  ),
  l1_codes as (
    -- By designation / authority title within Projects
    select distinct code_key
    from active_projects
    where projects.is_projects_l1_authority_designation(designation)

    union

    -- By hierarchy: people who are L1 for active Projects staff and are themselves in Projects
    select distinct ap.l1_code_key
    from active_projects ap
    join active_projects mgr on mgr.code_key = ap.l1_code_key
    where ap.l1_code_key is not null
  )
  select distinct p.id
  from public.profiles p
  join l1_codes c
    on projects.normalize_employee_code_key(p.employee_code::text) = c.code_key
  where coalesce(p.is_active, true)
    and p.id is not null;
$$;

comment on function projects.projects_department_l1_user_ids() is
  'Auth user ids of Projects Department L1 authorities from Employee Master (department + designation/hierarchy). No hardcoded codes.';

revoke all on function projects.projects_department_l1_user_ids() from public;
grant execute on function projects.projects_department_l1_user_ids() to authenticated, service_role;

create or replace function public.current_user_is_projects_department_l1()
returns boolean
language sql
stable
security definer
set search_path = public, projects, pg_temp
set row_security = off
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from projects.projects_department_l1_user_ids() u
      where u = auth.uid()
    );
$$;

comment on function public.current_user_is_projects_department_l1() is
  'True when the signed-in user is a Projects Department L1 authority (Employee Master mapping).';

revoke all on function public.current_user_is_projects_department_l1() from public;
grant execute on function public.current_user_is_projects_department_l1() to authenticated, service_role;

-- Manager / Executive (unchanged) OR Projects Department L1, with Projects access.
create or replace function public.current_user_can_receive_quotation_status_notifications()
returns boolean
language sql
stable
security definer
set search_path = public, projects, pg_temp
set row_security = off
as $$
  select auth.uid() is not null
    and (
      public.current_user_can_access_module('projects')
      or public.current_user_can_access_projects_data()
    )
    and (
      public.current_user_is_projects_department_l1()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and coalesce(p.is_active, true)
          and public.normalize_erp_role(p.role) in ('executive', 'manager')
      )
    );
$$;

comment on function public.current_user_can_receive_quotation_status_notifications() is
  'True for Projects Manager/Executive, or Projects Department L1 (Employee Master). Admin/SA only if they are Projects L1.';

-- ---------------------------------------------------------------------------
-- Notification table: kinds + optional recipient
-- ---------------------------------------------------------------------------
alter table projects.quotation_notifications
  add column if not exists recipient_user_id uuid;

alter table projects.quotation_notifications
  drop constraint if exists quotation_notifications_kind_check;

alter table projects.quotation_notifications
  add constraint quotation_notifications_kind_check
  check (kind in ('status_change', 'approved', 'rejected'));

create index if not exists quotation_notifications_recipient_created_idx
  on projects.quotation_notifications (recipient_user_id, created_at desc)
  where recipient_user_id is not null;

drop policy if exists "quotation_notifications_select" on projects.quotation_notifications;
create policy "quotation_notifications_select" on projects.quotation_notifications
  for select to authenticated
  using (
    public.current_user_can_receive_quotation_status_notifications()
    and (recipient_user_id is null or recipient_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Notify every Projects Department L1 (one row each; safe if none configured)
-- ---------------------------------------------------------------------------
create or replace function projects.notify_quotation_l1_activity(
  p_quotation_id uuid,
  p_offer_no text,
  p_client_name text,
  p_previous_status text,
  p_new_status text,
  p_kind text,
  p_activity_key text default null
)
returns integer
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_uid uuid;
  v_count integer := 0;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
begin
  if v_kind not in ('approved', 'rejected', 'status_change') then
    raise exception 'Unsupported quotation notification kind: %', p_kind;
  end if;

  for v_uid in select projects.projects_department_l1_user_ids()
  loop
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
        recipient_user_id,
        dedupe_key
      ) values (
        p_quotation_id,
        nullif(btrim(coalesce(p_offer_no, '')), ''),
        nullif(btrim(coalesce(p_client_name, '')), ''),
        nullif(btrim(coalesce(p_previous_status, '')), ''),
        coalesce(nullif(btrim(coalesce(p_new_status, '')), ''), '—'),
        v_kind,
        auth.uid(),
        projects.current_user_display_name(),
        v_uid,
        concat_ws(
          '|',
          'l1',
          v_kind,
          coalesce(p_activity_key, ''),
          coalesce(p_quotation_id::text, ''),
          v_uid::text,
          coalesce(auth.uid()::text, ''),
          to_char((now() at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS')
        )
      );
      v_count := v_count + 1;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return v_count;
end;
$$;

comment on function projects.notify_quotation_l1_activity(uuid, text, text, text, text, text, text) is
  'Inserts quotation_notifications rows for each Projects Department L1 user (approve/reject/status).';

revoke all on function projects.notify_quotation_l1_activity(uuid, text, text, text, text, text, text) from public;
grant execute on function projects.notify_quotation_l1_activity(uuid, text, text, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Order Lost decide: notify L1 on approve and reject
-- ---------------------------------------------------------------------------
create or replace function projects.decide_quotation_order_lost(
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
  v_req projects.quotation_status_change_requests%rowtype;
  v_q projects.quotations%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fail text;
begin
  select * into v_req
  from projects.quotation_status_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'This Order Lost request no longer exists.' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This Order Lost request was already %.', v_req.status using errcode = 'P0001';
  end if;

  if not projects.current_user_is_enquiry_edit_decider(v_req.requested_by, v_req.l1_manager_code) then
    raise exception 'Only this employee''s L1 manager can approve or reject Order Lost.'
      using errcode = '42501';
  end if;

  if not p_approve then
    update projects.quotation_status_change_requests
       set status = 'rejected',
           decided_by = auth.uid(),
           decided_by_name = projects.current_user_display_name(),
           decided_at = now(),
           decision_note = v_note
     where id = p_request_id;

    perform projects.notify_quotation_l1_activity(
      v_req.quotation_id,
      v_req.offer_no,
      v_req.client_name,
      coalesce(nullif(btrim(coalesce(v_req.requested_status, '')), ''), 'Order Lost') || ' request',
      'Rejected',
      'rejected',
      'order_lost:' || p_request_id::text || ':rejected'
    );
    return 'rejected';
  end if;

  if v_req.quotation_id is not null then
    select * into v_q from projects.quotations where id = v_req.quotation_id for update;
  end if;

  if v_req.quotation_id is null or v_q.id is null then
    v_fail := 'The quotation was deleted before approval.';
  elsif v_q.offer_status in ('Order Converted', 'Order Converted on Revised Value', 'Superseded') then
    v_fail := format('The quotation is now %s, so it was not marked Order Lost.', v_q.offer_status);
  end if;

  if v_fail is not null then
    update projects.quotation_status_change_requests
       set status = 'failed',
           decided_by = auth.uid(),
           decided_by_name = projects.current_user_display_name(),
           decided_at = now(),
           decision_note = concat_ws(' ', v_fail, v_note)
     where id = p_request_id;
    return 'failed';
  end if;

  update projects.quotation_status_change_requests
     set status = 'approved',
         decided_by = auth.uid(),
         decided_by_name = projects.current_user_display_name(),
         decided_at = now(),
         decision_note = v_note
   where id = p_request_id;

  if v_q.offer_status is distinct from 'Order Lost' then
    perform set_config('projects.quotation_status_source', 'approved_order_lost', true);
    update projects.quotations
       set offer_status = 'Order Lost',
           status_changed_at = now(),
           remark = concat_ws(E'\n', nullif(btrim(coalesce(remark, '')), ''), '[Status → Order Lost] ' || v_req.reason),
           updated_at = now()
     where id = v_q.id;
    perform set_config('projects.quotation_status_source', '', true);
  end if;

  -- Explicit approve notify (status_change trigger may also fire for Manager/Executive feed).
  perform projects.notify_quotation_l1_activity(
    v_req.quotation_id,
    v_req.offer_no,
    v_req.client_name,
    coalesce(nullif(btrim(coalesce(v_req.previous_status, '')), ''), '—'),
    'Order Lost approved',
    'approved',
    'order_lost:' || p_request_id::text || ':approved'
  );

  return 'approved';
end;
$$;

revoke all on function projects.decide_quotation_order_lost(bigint, boolean, text) from public;
grant execute on function projects.decide_quotation_order_lost(bigint, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deletion decide: notify L1 on approve and reject
-- ---------------------------------------------------------------------------
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
  v_kind text;
  v_new text;
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

  v_kind := case when p_approve then 'approved' else 'rejected' end;
  v_new := case when p_approve then 'Deletion approved' else 'Deletion rejected' end;

  -- Notify before delete so quotation_id still satisfies the notifications FK.
  perform projects.notify_quotation_l1_activity(
    v_req.quotation_id,
    v_req.offer_no,
    v_req.client_name,
    'Deletion request',
    v_new,
    v_kind,
    'deletion:' || p_request_id::text || ':' || v_kind
  );

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

  return v_kind;
end;
$$;

revoke all on function projects.decide_quotation_deletion(bigint, boolean, text) from public;
grant execute on function projects.decide_quotation_deletion(bigint, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';

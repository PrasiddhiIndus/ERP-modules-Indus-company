-- Projects module: Activity Log / History.
--
-- One append-only table, projects.activity_log, filled by database triggers so every
-- write path is captured (UI, API, SECURITY DEFINER RPCs, approvals, imports, backend jobs):
--   * projects.quotations   (Quotation Master)       entity_type = 'quotation'
--   * public.pj_oc_master   (Projects PO At Glance)  entity_type = 'po_at_glance'
-- Each row records: the record (id + reference no. + client), action (create / update /
-- status_change / delete), field name, previous value, new value, who (user id, name,
-- employee code) and when.
--
-- Not duplicated here (already have their own history tables):
--   * Enquiry Master field changes      → projects.enquiry_field_change_history
--   * PO At Glance sign-off / approvals → public.pj_oc_approval_log
--   * Quotation deletion / Order Lost   → projects.quotation_deletion_requests /
--                                         projects.quotation_status_change_requests
--
-- Protection: app users can only SELECT (scoped to Projects / PO At Glance access). No
-- INSERT / UPDATE / DELETE grants; a trigger also blocks UPDATE / DELETE / TRUNCATE for
-- every role, so history cannot be altered through the API. Identity and time are stamped
-- by the database.
-- Rollback: supabase/rollbacks/20261118183000_projects_activity_log_down.sql

create table if not exists projects.activity_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  entity_ref text,
  entity_label text,
  action text not null,
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_by_employee_code text,
  changed_at timestamptz not null default now(),
  source text not null default 'app',
  txid bigint not null default txid_current(),
  constraint activity_log_entity_type_check check (entity_type in ('quotation', 'po_at_glance')),
  constraint activity_log_action_check check (action in ('create', 'update', 'status_change', 'delete')),
  constraint activity_log_source_check check (source in ('app', 'system'))
);

comment on table projects.activity_log is
  'Append-only change history for Projects records (Quotation Master, Projects PO At Glance). Written only by triggers.';

create index if not exists activity_log_entity_idx
  on projects.activity_log (entity_type, entity_id, changed_at desc, id desc);
create index if not exists activity_log_changed_at_idx
  on projects.activity_log (changed_at desc);

alter table projects.activity_log enable row level security;

drop policy if exists activity_log_select on projects.activity_log;
create policy activity_log_select on projects.activity_log
  for select to authenticated
  using (
    case entity_type
      when 'quotation' then public.current_user_can_access_projects_data()
      when 'po_at_glance' then public.pj_oc_current_user_has_access()
      else false
    end
  );

revoke all on projects.activity_log from anon, authenticated;
grant select on projects.activity_log to authenticated;
revoke insert, update, delete, truncate on projects.activity_log from service_role;
grant select on projects.activity_log to service_role;

-- History cannot be changed or removed, by anyone going through SQL roles.
create or replace function projects.activity_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Activity log entries cannot be changed or deleted.' using errcode = '42501';
end;
$$;

drop trigger if exists activity_log_immutable on projects.activity_log;
create trigger activity_log_immutable
  before update or delete on projects.activity_log
  for each row
  execute function projects.activity_log_immutable();

drop trigger if exists activity_log_no_truncate on projects.activity_log;
create trigger activity_log_no_truncate
  before truncate on projects.activity_log
  for each statement
  execute function projects.activity_log_immutable();

-- ---------------------------------------------------------------------------
-- Generic row-change logger.
-- Trigger args: entity_type, reference column, label column, status column(s) (comma list),
--               ignored columns (comma list).
-- ---------------------------------------------------------------------------
create or replace function projects.activity_log_value(p_value jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_value is null or p_value = 'null'::jsonb then null
    when jsonb_typeof(p_value) = 'string' then left(p_value #>> '{}', 4000)
    else left(p_value::text, 4000)
  end;
$$;

create or replace function projects.log_row_activity()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_entity text := tg_argv[0];
  v_ref_col text := tg_argv[1];
  v_label_col text := tg_argv[2];
  v_status_cols text[] := string_to_array(coalesce(tg_argv[3], ''), ',');
  v_ignore text[] := string_to_array(coalesce(tg_argv[4], ''), ',');
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_key text;
  v_uid uuid := auth.uid();
  v_name text;
  v_code text;
  v_source text;
  v_id uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row := coalesce(v_new, v_old);
  v_id := (v_row ->> 'id')::uuid;

  v_source := case when v_uid is null then 'system' else 'app' end;
  if v_uid is not null then
    v_name := projects.current_user_display_name();
    begin
      v_code := nullif(btrim(public.current_user_employee_code()), '');
    exception when others then
      v_code := null;
    end;
  end if;

  if tg_op = 'INSERT' then
    insert into projects.activity_log (
      entity_type, entity_id, entity_ref, entity_label, action, field_name, old_value, new_value,
      changed_by, changed_by_name, changed_by_employee_code, source
    ) values (
      v_entity, v_id, v_row ->> v_ref_col, v_row ->> v_label_col, 'create', null, null,
      nullif(concat_ws(' · ', v_row ->> v_ref_col, v_row ->> v_label_col), ''),
      v_uid, v_name, v_code, v_source
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into projects.activity_log (
      entity_type, entity_id, entity_ref, entity_label, action, field_name, old_value, new_value,
      changed_by, changed_by_name, changed_by_employee_code, source
    ) values (
      v_entity, v_id, v_row ->> v_ref_col, v_row ->> v_label_col, 'delete', null,
      nullif(concat_ws(' · ', v_row ->> v_ref_col, v_row ->> v_label_col), ''), null,
      v_uid, v_name, v_code, v_source
    );
    return old;
  end if;

  for v_key in select jsonb_object_keys(v_new) loop
    if v_key = any (v_ignore) then
      continue;
    end if;
    if (v_old -> v_key) is not distinct from (v_new -> v_key) then
      continue;
    end if;
    insert into projects.activity_log (
      entity_type, entity_id, entity_ref, entity_label, action, field_name, old_value, new_value,
      changed_by, changed_by_name, changed_by_employee_code, source
    ) values (
      v_entity, v_id, v_new ->> v_ref_col, v_new ->> v_label_col,
      case when v_key = any (v_status_cols) then 'status_change' else 'update' end,
      v_key,
      projects.activity_log_value(v_old -> v_key),
      projects.activity_log_value(v_new -> v_key),
      v_uid, v_name, v_code, v_source
    );
  end loop;
  return new;
end;
$$;

revoke all on function projects.log_row_activity() from public;

-- Quotation Master
drop trigger if exists quotations_activity_log on projects.quotations;
create trigger quotations_activity_log
  after insert or update or delete on projects.quotations
  for each row
  execute function projects.log_row_activity(
    'quotation', 'offer_no', 'client_name', 'offer_status,maker_status',
    'id,created_at,updated_at,status_changed_at'
  );

-- Projects PO At Glance
do $$
begin
  if to_regclass('public.pj_oc_master') is null then
    raise notice 'public.pj_oc_master does not exist — skipping PO At Glance activity log.';
    return;
  end if;
  execute 'drop trigger if exists pj_oc_master_activity_log on public.pj_oc_master';
  execute $t$
    create trigger pj_oc_master_activity_log
      after insert or update or delete on public.pj_oc_master
      for each row
      execute function projects.log_row_activity(
        'po_at_glance', 'oc_no', 'client_name', '',
        'id,created_at,updated_at,created_by,updated_by'
      )
  $t$;
end $$;

notify pgrst, 'reload schema';

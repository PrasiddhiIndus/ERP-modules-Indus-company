-- Enquiry Master:
--   Completed → projects-module notification (shown only under /app/projects).
--   Regret for non-managers continues through L1 edit approval (request_enquiry_edit).

create table if not exists projects.enquiry_notifications (
  id bigint generated always as identity primary key,
  enquiry_id uuid references projects.enquiries (id) on delete set null,
  enquiry_serial bigint,
  enquiry_client text,
  kind text not null default 'completed'
    check (kind in ('completed')),
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text
);

create index if not exists enquiry_notifications_created_idx
  on projects.enquiry_notifications (created_at desc);

create index if not exists enquiry_notifications_kind_created_idx
  on projects.enquiry_notifications (kind, created_at desc);

alter table projects.enquiry_notifications enable row level security;

drop policy if exists "enquiry_notifications_select" on projects.enquiry_notifications;
create policy "enquiry_notifications_select" on projects.enquiry_notifications
  for select to authenticated
  using (public.current_user_can_access_module('projects'));

revoke all on projects.enquiry_notifications from anon, authenticated;
grant select on projects.enquiry_notifications to authenticated;
grant all on projects.enquiry_notifications to service_role;

create or replace function projects.enquiry_status_lower(p_data jsonb)
returns text
language sql
immutable
as $$
  select lower(btrim(coalesce(p_data->>'current_status', '')));
$$;

create or replace function projects.enquiries_notify_completed()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_old text := projects.enquiry_status_lower(coalesce(old.data, '{}'::jsonb));
  v_new text := projects.enquiry_status_lower(coalesce(new.data, '{}'::jsonb));
begin
  if v_new = 'completed' and v_old is distinct from 'completed' then
    insert into projects.enquiry_notifications (
      enquiry_id, enquiry_serial, enquiry_client, kind, created_by, created_by_name
    ) values (
      new.id,
      new.serial_number,
      nullif(btrim(coalesce(new.data->>'client_name', '')), ''),
      'completed',
      auth.uid(),
      projects.current_user_display_name()
    );
  end if;
  return new;
end;
$$;

revoke all on function projects.enquiries_notify_completed() from public;

drop trigger if exists enquiries_notify_completed on projects.enquiries;
create trigger enquiries_notify_completed
  after update on projects.enquiries
  for each row
  execute function projects.enquiries_notify_completed();

-- Non-managers may apply Completed without L1. Regret must use request_enquiry_edit.
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
      to_jsonb(to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'))
    );
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

-- Add Enquiry: auto-calculated Target Date may land on insert.
-- A change from Assigned On + 7 working days is held for L1 (UI sends request_enquiry_edit).
-- Completed Date remains Edit-only: always stripped on insert for non-admin users.

create or replace function projects.add_working_days(p_start date, p_days integer default 7)
returns date
language plpgsql
immutable
as $$
declare
  d date := p_start;
  added integer := 0;
begin
  if p_start is null or p_days is null or p_days <= 0 then
    return null;
  end if;
  while added < p_days loop
    d := d + 1;
    -- PostgreSQL DOW: 0 = Sunday. Match app: Mon–Sat working days.
    if extract(dow from d)::int <> 0 then
      added := added + 1;
    end if;
  end loop;
  return d;
end;
$$;

revoke all on function projects.add_working_days(date, integer) from public;
grant execute on function projects.add_working_days(date, integer) to authenticated, service_role;

comment on function projects.add_working_days(date, integer) is
  'Adds working days skipping Sundays (same rule as enquiry Target Date auto-calc).';

create or replace function projects.enquiries_strip_dates_pending_l1()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
declare
  v_assigned text;
  v_target text;
  v_auto date;
  v_assigned_date date;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if projects.current_user_can_write_enquiry_dates_on_insert() then
    return new;
  end if;

  -- Completed Date is never written on create for non-admins (Edit Enquiry only).
  new.data := coalesce(new.data, '{}'::jsonb)
    || jsonb_build_object('completed_on', null);

  v_assigned := nullif(btrim(coalesce(new.data->>'assigned_on_date', '')), '');
  v_target := nullif(btrim(coalesce(new.data->>'target_date', '')), '');

  if v_assigned is null then
    -- No Assigned On → no auto Target Date; hold any manual target for L1.
    if v_target is not null then
      new.data := new.data || jsonb_build_object('target_date', null);
    end if;
    return new;
  end if;

  begin
    v_assigned_date := v_assigned::date;
  exception when others then
    -- Unparseable assigned date: hold target for L1.
    new.data := new.data || jsonb_build_object('target_date', null);
    return new;
  end;

  v_auto := projects.add_working_days(v_assigned_date, 7);
  if v_auto is null then
    return new;
  end if;

  -- Live row always keeps the calculated Target Date; overrides go through request_enquiry_edit.
  new.data := new.data || jsonb_build_object('target_date', to_char(v_auto, 'YYYY-MM-DD'));

  return new;
end;
$$;

comment on function projects.enquiries_strip_dates_pending_l1() is
  'Before insert (non-admin): strip completed_on; keep auto Target Date from Assigned On; overrides wait for L1.';

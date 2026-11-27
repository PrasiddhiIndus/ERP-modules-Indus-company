-- Rollback: 20261126160000_enquiry_target_date_override_l1.sql
-- Restores create-time strip of both target_date and completed_on for non-admins.

create or replace function projects.enquiries_strip_dates_pending_l1()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if projects.current_user_can_write_enquiry_dates_on_insert() then
    return new;
  end if;

  new.data := coalesce(new.data, '{}'::jsonb)
    || jsonb_build_object('target_date', null, 'completed_on', null);

  return new;
end;
$$;

drop function if exists projects.add_working_days(date, integer);

comment on function projects.enquiries_strip_dates_pending_l1() is
  'Before insert: clear target_date and completed_on for non-admin users so dates stay pending L1.';

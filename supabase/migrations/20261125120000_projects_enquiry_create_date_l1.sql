-- Enquiry registration: Target Date / Completed Date must not land on the live
-- Enquiry Database row until L1 approves (Managers + staff).
-- Admin / Super Admin may still write dates on insert.
-- Frontend: insert with dates stripped, then request_enquiry_edit(proposed).
-- This trigger enforces the strip so API/Excel cannot bypass the UI.

create or replace function projects.current_user_can_write_enquiry_dates_on_insert()
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
        and public.normalize_erp_role(p.role) in ('admin', 'super_admin', 'super_admin_pro')
    )
    and public.current_user_can_access_module('projects');
$$;

revoke all on function projects.current_user_can_write_enquiry_dates_on_insert() from public;
grant execute on function projects.current_user_can_write_enquiry_dates_on_insert() to authenticated, service_role;

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

  -- Hold Target Date / Completed Date off the live row; UI sends them via request_enquiry_edit.
  new.data := coalesce(new.data, '{}'::jsonb)
    || jsonb_build_object('target_date', null, 'completed_on', null);

  return new;
end;
$$;

drop trigger if exists enquiries_strip_dates_pending_l1 on projects.enquiries;
create trigger enquiries_strip_dates_pending_l1
  before insert on projects.enquiries
  for each row
  execute function projects.enquiries_strip_dates_pending_l1();

comment on function projects.current_user_can_write_enquiry_dates_on_insert() is
  'Admin / Super Admin may write Target Date and Completed Date on enquiry insert without L1.';
comment on function projects.enquiries_strip_dates_pending_l1() is
  'Before insert: clear target_date and completed_on for non-admin users so dates stay pending L1.';

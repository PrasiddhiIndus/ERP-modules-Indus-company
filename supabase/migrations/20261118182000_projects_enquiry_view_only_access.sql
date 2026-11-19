-- Enquiry Master: View / Edit access levels (User Management → "Enquiry Master access").
--
--   allowed_sub_modules contains 'projects.enquiry.view' and NOT 'projects.enquiry.edit'
--     → View only: may read enquiries; may not create, edit, delete, import, change dropdowns
--       or field definitions, or raise edit / deletion requests.
--   'projects.enquiry.edit' ticked, or neither key → unchanged behaviour (all current users).
--   Super Admin / Super Admin Pro are never restricted.
--
-- L1 approval is kept: a View-only manager can still Approve / Reject edit and deletion
-- requests — the approved change is applied by the existing SECURITY DEFINER decide
-- functions, which these guards recognise.
--
-- Enforced with BEFORE triggers, so the rule also covers the SECURITY DEFINER RPCs
-- (apply_enquiry_progress, apply_enquiry_completed, request_enquiry_edit, …) and direct
-- API calls, not only RLS-checked statements. Service-role / backend jobs (no auth.uid())
-- are not affected.
-- Rollback: supabase/rollbacks/20261118182000_projects_enquiry_view_only_access_down.sql

create or replace function projects.current_user_enquiry_view_only()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and public.normalize_erp_role(p.role) not in ('super_admin', 'super_admin_pro')
        and jsonb_typeof(p.allowed_sub_modules) = 'array'
        and p.allowed_sub_modules ? 'projects.enquiry.view'
        and not (p.allowed_sub_modules ? 'projects.enquiry.edit')
    );
$$;

comment on function projects.current_user_enquiry_view_only() is
  'True when the caller has View-only Enquiry Master access (projects.enquiry.view without projects.enquiry.edit). Mirrors isProjectsEnquiryViewOnly in src/config/roles.js.';

revoke all on function projects.current_user_enquiry_view_only() from public;
grant execute on function projects.current_user_enquiry_view_only() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- projects.enquiries
-- ---------------------------------------------------------------------------
create or replace function projects.enquiries_guard_view_only()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  if not projects.current_user_enquiry_view_only() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    -- An L1-approved edit request (projects.decide_enquiry_edit) is applied by the approver.
    if coalesce(current_setting('projects.enquiry_edit_source', true), '') = 'approved_request' then
      return new;
    end if;
    -- Serial renumbering after an approved deletion (projects.renumber_enquiry_serials).
    if old.data is not distinct from new.data
       and old.serial_number is distinct from new.serial_number then
      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    -- Deletion approved in this transaction by this manager (projects.decide_enquiry_deletion).
    if exists (
      select 1 from projects.enquiry_deletion_requests r
      where r.enquiry_id = old.id
        and r.status = 'approved'
        and r.decided_by = auth.uid()
        and r.decided_at = now()
    ) then
      return old;
    end if;
  end if;

  raise exception 'You have view-only access to Enquiry Master. Ask your administrator for Edit access.'
    using errcode = '42501';
end;
$$;

revoke all on function projects.enquiries_guard_view_only() from public;

drop trigger if exists enquiries_guard_view_only on projects.enquiries;
create trigger enquiries_guard_view_only
  before insert or update or delete on projects.enquiries
  for each row
  execute function projects.enquiries_guard_view_only();

-- ---------------------------------------------------------------------------
-- Edit / deletion requests: View-only users cannot raise or resend them.
-- Decisions (status leaves 'pending') stay allowed for the L1 manager.
-- ---------------------------------------------------------------------------
create or replace function projects.enquiry_requests_guard_view_only()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  if new.status = 'pending' and projects.current_user_enquiry_view_only() then
    raise exception 'You have view-only access to Enquiry Master. Ask your administrator for Edit access.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function projects.enquiry_requests_guard_view_only() from public;

drop trigger if exists enquiry_edit_requests_guard_view_only on projects.enquiry_edit_requests;
create trigger enquiry_edit_requests_guard_view_only
  before insert or update on projects.enquiry_edit_requests
  for each row
  execute function projects.enquiry_requests_guard_view_only();

drop trigger if exists enquiry_deletion_requests_guard_view_only on projects.enquiry_deletion_requests;
create trigger enquiry_deletion_requests_guard_view_only
  before insert or update on projects.enquiry_deletion_requests
  for each row
  execute function projects.enquiry_requests_guard_view_only();

-- ---------------------------------------------------------------------------
-- Enquiry Dropdown / field definitions (Enquiry Master configuration pages)
-- ---------------------------------------------------------------------------
create or replace function projects.enquiry_config_guard_view_only()
returns trigger
language plpgsql
security definer
set search_path = projects, public, pg_temp
set row_security = off
as $$
begin
  if projects.current_user_enquiry_view_only() then
    raise exception 'You have view-only access to Enquiry Master. Ask your administrator for Edit access.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function projects.enquiry_config_guard_view_only() from public;

do $$
declare
  t text;
begin
  foreach t in array array['enquiry_dropdown_options', 'enquiry_dropdown_kinds', 'enquiry_field_definitions'] loop
    if to_regclass('projects.' || t) is null then
      raise notice 'projects.% does not exist — skipping view-only guard.', t;
      continue;
    end if;
    execute format('drop trigger if exists %I on projects.%I', t || '_guard_view_only', t);
    execute format(
      'create trigger %I before insert or update or delete on projects.%I for each row execute function projects.enquiry_config_guard_view_only()',
      t || '_guard_view_only', t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

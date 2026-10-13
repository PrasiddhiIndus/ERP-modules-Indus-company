-- Enquiry Master: "Assigned To Person" choices come from Employee Master —
-- active employees whose department is Projects.
-- Projects users cannot read Employee Master directly, so this returns only
-- names and codes, and only to users who can open the Projects module.

create or replace function projects.enquiry_assignee_names()
returns table (full_name text, employee_code text)
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select distinct on (lower(btrim(em.full_name)))
    btrim(em.full_name)::text,
    nullif(btrim(em.employee_code::text), '')::text
  from public.admin_ifsp_employee_master em
  where public.current_user_can_access_module('projects')
    and lower(btrim(coalesce(em.department, ''))) in ('projects', 'project')
    and lower(btrim(coalesce(em.status, 'active'))) = 'active'
    and coalesce(btrim(em.full_name), '') <> ''
  order by lower(btrim(em.full_name)), em.employee_code
$$;

comment on function projects.enquiry_assignee_names() is
  'Active Projects-department employees (name, code) for the Enquiry Master Assigned To Person list.';

revoke all on function projects.enquiry_assignee_names() from public;
grant execute on function projects.enquiry_assignee_names() to authenticated, service_role;

notify pgrst, 'reload schema';

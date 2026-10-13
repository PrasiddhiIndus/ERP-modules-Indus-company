-- One-time: change old short "Assigned To Person" names on enquiries (e.g. "Dhaval",
-- "Mehul sir") to the full name of the active Projects-department employee in
-- Employee Master whose first name matches. Names already matching a full name,
-- and short names matching no one or several people, are left unchanged.
-- "Last updated" dates are kept, so completion dates and KPIs do not shift.
--
-- Step 1 (preview, changes nothing): run the SELECT block alone.
-- Step 2 (update): run the BEGIN ... COMMIT block.

-- ---------------------------------------------------------------- Step 1: preview
with emp as (
  select btrim(full_name) as full_name,
         lower(split_part(btrim(full_name), ' ', 1)) as first_name
  from public.admin_ifsp_employee_master
  where lower(btrim(coalesce(department, ''))) in ('projects', 'project')
    and lower(btrim(coalesce(status, 'active'))) = 'active'
    and coalesce(btrim(full_name), '') <> ''
),
uniq as (
  select first_name, min(full_name) as full_name
  from emp
  group by first_name
  having count(distinct lower(full_name)) = 1
),
cur as (
  select e.id,
         e.data->>'assigned_to_person' as old_name,
         lower(btrim(regexp_replace(e.data->>'assigned_to_person', '\s+(sir|madam|mam|maam)\.?\s*$', '', 'i'))) as name_key
  from projects.enquiries e
  where coalesce(btrim(e.data->>'assigned_to_person'), '') <> ''
    and not exists (
      select 1 from emp where lower(emp.full_name) = lower(btrim(e.data->>'assigned_to_person'))
    )
)
select cur.old_name,
       coalesce(u.full_name, '(no unique match - left unchanged)') as new_name,
       count(*) as enquiries
from cur
left join uniq u on u.first_name = cur.name_key
group by cur.old_name, u.full_name
order by cur.old_name;

-- ---------------------------------------------------------------- Step 2: update
begin;

alter table projects.enquiries disable trigger enquiries_updated_at;

with emp as (
  select btrim(full_name) as full_name,
         lower(split_part(btrim(full_name), ' ', 1)) as first_name
  from public.admin_ifsp_employee_master
  where lower(btrim(coalesce(department, ''))) in ('projects', 'project')
    and lower(btrim(coalesce(status, 'active'))) = 'active'
    and coalesce(btrim(full_name), '') <> ''
),
uniq as (
  select first_name, min(full_name) as full_name
  from emp
  group by first_name
  having count(distinct lower(full_name)) = 1
),
cur as (
  select e.id,
         lower(btrim(regexp_replace(e.data->>'assigned_to_person', '\s+(sir|madam|mam|maam)\.?\s*$', '', 'i'))) as name_key
  from projects.enquiries e
  where coalesce(btrim(e.data->>'assigned_to_person'), '') <> ''
    and not exists (
      select 1 from emp where lower(emp.full_name) = lower(btrim(e.data->>'assigned_to_person'))
    )
)
update projects.enquiries e
   set data = jsonb_set(e.data, '{assigned_to_person}', to_jsonb(u.full_name), true)
  from cur
  join uniq u on u.first_name = cur.name_key
 where e.id = cur.id;

alter table projects.enquiries enable trigger enquiries_updated_at;

commit;

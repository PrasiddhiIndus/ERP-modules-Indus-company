-- Rollback: restore remarks-only only when the user is not the creator.
-- Re-apply 20261106150000 for pj_oc_user_is_remarks_only and 20261102150000 for pj_oc_save if needed.

create or replace function public.pj_oc_user_is_remarks_only(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $body$
  select p_created_by is distinct from auth.uid()
     and not public.oc_current_user_is_finance()
     and exists (
       select 1
         from public.pj_oc_signoff_assignees a
        where a.slot in ('PLANNING', 'VERTICAL_HEAD')
          and lower(btrim(a.employee_code)) = lower(btrim(coalesce(public.oc_current_employee_code(), '')))
          and btrim(coalesce(public.oc_current_employee_code(), '')) <> ''
     );
$body$;

notify pgrst, 'reload schema';

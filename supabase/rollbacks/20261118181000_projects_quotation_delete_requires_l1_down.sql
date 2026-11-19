-- Rollback for 20261118181000_projects_quotation_delete_requires_l1.sql.
-- Restores the 20261117120000 delete policy (any Projects user may DELETE directly).

drop policy if exists projects_quotations_delete_super_admin on projects.quotations;
drop policy if exists projects_quotations_scope_delete on projects.quotations;

create policy projects_quotations_scope_delete on projects.quotations
  for delete to authenticated using (public.current_user_can_access_projects_data());

notify pgrst, 'reload schema';

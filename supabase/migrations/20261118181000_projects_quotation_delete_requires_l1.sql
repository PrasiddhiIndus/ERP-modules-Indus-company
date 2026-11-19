-- Quotation Master: a quotation can only be deleted through the L1 approval workflow.
--
-- The UI already sends deletions to L1 (projects.request_quotation_deletion /
-- projects.decide_quotation_deletion, migration 20261113190000), but RLS policy
-- projects_quotations_scope_delete (20261117120000) still let any Projects user run a
-- direct DELETE through the API and skip approval.
--
-- After this migration:
--   * Direct DELETE on projects.quotations: Super Admin / Super Admin Pro only
--     (same rule as projects.delete_quotation_as_super_admin).
--   * Everyone else: request → L1 approves → projects.decide_quotation_deletion deletes
--     (SECURITY DEFINER, unaffected by RLS).
--   * Rejected requests leave the quotation untouched; one pending request per quotation
--     (unique index quotation_deletion_requests_one_pending) is unchanged.
-- Rollback: supabase/rollbacks/20261118181000_projects_quotation_delete_requires_l1_down.sql

drop policy if exists projects_quotations_scope_delete on projects.quotations;
drop policy if exists projects_quotations_delete_super_admin on projects.quotations;

create policy projects_quotations_delete_super_admin on projects.quotations
  for delete to authenticated
  using (
    public.current_user_can_access_projects_data()
    and projects.current_user_is_super_admin()
  );

do $$
declare
  r record;
begin
  -- Warn if an older catch-all policy would still allow DELETE (e.g. 20261117120000 not applied).
  for r in
    select policyname from pg_policies
    where schemaname = 'projects' and tablename = 'quotations'
      and cmd in ('ALL', 'DELETE')
      and policyname <> 'projects_quotations_delete_super_admin'
  loop
    raise warning 'projects.quotations still has policy % that allows DELETE; apply 20261117120000 first.', r.policyname;
  end loop;
end $$;

notify pgrst, 'reload schema';

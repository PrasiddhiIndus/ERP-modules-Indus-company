-- Rollback: Quotation Master L1 deletion approval

drop trigger if exists quotations_settle_deletion_requests on projects.quotations;
drop function if exists projects.quotations_settle_deletion_requests();
drop function if exists projects.delete_quotation_as_super_admin(uuid);
drop function if exists projects.decide_quotation_deletion(bigint, boolean, text);
drop function if exists projects.request_quotation_deletion(uuid, text);

drop policy if exists "quotation_deletion_requests_select" on projects.quotation_deletion_requests;
drop table if exists projects.quotation_deletion_requests;

notify pgrst, 'reload schema';

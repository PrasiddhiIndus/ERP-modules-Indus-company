-- Rollback: any signed-in user can delete enquiries again; deletion requests are removed.

drop trigger if exists enquiries_settle_deletion_requests on projects.enquiries;
drop function if exists projects.enquiries_settle_deletion_requests();
drop function if exists projects.decide_enquiry_deletion(bigint, boolean, text);
drop function if exists projects.request_enquiry_deletion(uuid, text);
drop function if exists projects.current_user_display_name();
drop table if exists projects.enquiry_deletion_requests;

drop policy if exists "enquiries_select" on projects.enquiries;
drop policy if exists "enquiries_insert" on projects.enquiries;
drop policy if exists "enquiries_update" on projects.enquiries;
drop policy if exists "enquiries_delete_approver" on projects.enquiries;
drop policy if exists "enquiries_auth" on projects.enquiries;
create policy "enquiries_auth"
  on projects.enquiries for all to authenticated using (true) with check (true);

drop function if exists projects.current_user_is_enquiry_approver();

notify pgrst, 'reload schema';

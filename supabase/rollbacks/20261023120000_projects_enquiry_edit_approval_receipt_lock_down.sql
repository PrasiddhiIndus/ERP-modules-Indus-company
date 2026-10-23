drop trigger if exists enquiries_log_field_changes on projects.enquiries;
drop function if exists projects.enquiries_log_field_changes();

drop trigger if exists enquiries_keep_enquiry_receipt_date on projects.enquiries;
drop function if exists projects.enquiries_keep_enquiry_receipt_date();

drop function if exists projects.decide_enquiry_edit(bigint, boolean, text);
drop function if exists projects.request_enquiry_edit(uuid, jsonb, text);
drop function if exists projects.enquiry_data_changes(jsonb, jsonb);

drop table if exists projects.enquiry_edit_requests;
drop table if exists projects.enquiry_field_change_history;

drop policy if exists "enquiries_update" on projects.enquiries;
create policy "enquiries_update" on projects.enquiries
  for update to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

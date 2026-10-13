-- Rollback: Assigned To Person goes back to the Enquiry Dropdown list only.

drop function if exists projects.enquiry_assignee_names();

notify pgrst, 'reload schema';

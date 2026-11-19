-- Rollback for 20261118182000_projects_enquiry_view_only_access.sql.
-- Removes the View-only guards. Profiles keep any 'projects.enquiry.view' / '.edit' keys,
-- which then have no effect in the database.

drop trigger if exists enquiries_guard_view_only on projects.enquiries;
drop trigger if exists enquiry_edit_requests_guard_view_only on projects.enquiry_edit_requests;
drop trigger if exists enquiry_deletion_requests_guard_view_only on projects.enquiry_deletion_requests;

do $$
declare
  t text;
begin
  foreach t in array array['enquiry_dropdown_options', 'enquiry_dropdown_kinds', 'enquiry_field_definitions'] loop
    if to_regclass('projects.' || t) is not null then
      execute format('drop trigger if exists %I on projects.%I', t || '_guard_view_only', t);
    end if;
  end loop;
end $$;

drop function if exists projects.enquiries_guard_view_only();
drop function if exists projects.enquiry_requests_guard_view_only();
drop function if exists projects.enquiry_config_guard_view_only();
drop function if exists projects.current_user_enquiry_view_only();

notify pgrst, 'reload schema';

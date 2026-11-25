-- Rollback: 20261125120000_projects_enquiry_create_date_l1.sql

drop trigger if exists enquiries_strip_dates_pending_l1 on projects.enquiries;
drop function if exists projects.enquiries_strip_dates_pending_l1();
drop function if exists projects.current_user_can_write_enquiry_dates_on_insert();

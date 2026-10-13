-- Rollback: allow "Assigned on Date" to be changed again.

drop trigger if exists enquiries_keep_assigned_on_date on projects.enquiries;
drop function if exists projects.enquiries_keep_assigned_on_date();

-- Rollback for 20261123170000_projects_enquiry_drafts.sql
-- Drops saved enquiry drafts (unsubmitted form data only; no enquiries are affected).
drop table if exists projects.enquiry_drafts;
drop function if exists projects.enquiry_drafts_touch();
notify pgrst, 'reload schema';

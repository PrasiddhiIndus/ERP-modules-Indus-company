-- Rollback: Projects Department L1 quotation approval/rejection notifications.

drop function if exists projects.notify_quotation_l1_activity(uuid, text, text, text, text, text, text);
drop function if exists projects.projects_department_l1_user_ids();
drop function if exists public.current_user_is_projects_department_l1();
drop function if exists projects.is_projects_l1_authority_designation(text);
drop function if exists projects.is_projects_department(text);
drop function if exists projects.normalize_employee_code_key(text);

drop index if exists projects.quotation_notifications_recipient_created_idx;

alter table projects.quotation_notifications
  drop column if exists recipient_user_id;

alter table projects.quotation_notifications
  drop constraint if exists quotation_notifications_kind_check;

alter table projects.quotation_notifications
  add constraint quotation_notifications_kind_check
  check (kind in ('status_change'));

-- Restore prior eligibility + decide bodies from:
--   20261119140000_projects_quotation_status_notifications.sql
--   20261118180000_projects_quotation_order_lost_approval.sql
--   20261113190000_projects_quotation_deletion_l1.sql

notify pgrst, 'reload schema';

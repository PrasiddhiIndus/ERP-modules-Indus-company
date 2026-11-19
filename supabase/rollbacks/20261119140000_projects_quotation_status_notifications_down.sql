-- Rollback: 20261119140000_projects_quotation_status_notifications.sql

drop trigger if exists quotations_notify_status_change on projects.quotations;
drop function if exists projects.quotations_notify_status_change();

drop policy if exists "quotation_notifications_select" on projects.quotation_notifications;
drop table if exists projects.quotation_notifications;

drop function if exists public.current_user_can_receive_quotation_status_notifications();

notify pgrst, 'reload schema';

-- Rollback: Target Date / Completed Date L1 gate + edit decision notifications.
-- Restores apply / decide behaviour from 20261113120000_projects_enquiry_l1_employee_master.sql
-- and notification kinds from 20261028110000_projects_enquiry_completed_notify_regret_l1.sql.

drop index if exists projects.enquiry_notifications_recipient_created_idx;

alter table projects.enquiry_notifications
  drop column if exists recipient_user_id;

alter table projects.enquiry_notifications
  drop constraint if exists enquiry_notifications_kind_check;

alter table projects.enquiry_notifications
  add constraint enquiry_notifications_kind_check
  check (kind in ('completed'));

drop policy if exists "enquiry_notifications_select" on projects.enquiry_notifications;
create policy "enquiry_notifications_select" on projects.enquiry_notifications
  for select to authenticated
  using (public.current_user_can_access_module('projects'));

-- Re-apply prior function bodies by re-running:
--   supabase/migrations/20261113120000_projects_enquiry_l1_employee_master.sql
-- (decide_enquiry_edit, apply_enquiry_progress, apply_enquiry_completed)

notify pgrst, 'reload schema';

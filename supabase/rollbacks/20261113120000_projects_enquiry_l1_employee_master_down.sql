-- Rollback: projects enquiry L1 from employee master + progress apply RPC

drop function if exists projects.apply_enquiry_progress(uuid, jsonb);
drop function if exists projects.current_user_is_enquiry_edit_decider(uuid, text);
drop function if exists projects.enquiry_employee_manager_codes(uuid);

drop index if exists projects.enquiry_edit_requests_l1_pending_idx;

alter table projects.enquiry_edit_requests
  drop column if exists l1_manager_code,
  drop column if exists l2_manager_code;

-- Restore prior decide / request / completed / select policy from
-- 20261023120000 + 20261028110000 (re-apply those migrations if needed).

notify pgrst, 'reload schema';

-- Enquiry Master: add "Order Lost" to the Current Status dropdown.
-- Data only (one dropdown option); idempotent. Existing enquiries are unchanged.
-- Like Regret, Order Lost closes the enquiry for deadline / overdue counting and has its own
-- box on the Enquiry Dashboard (app logic). Non-managers send it through the existing
-- L1 edit approval (request_enquiry_edit), the same as any other non-progress status.
-- Rollback: supabase/rollbacks/20261118191000_projects_enquiry_order_lost_status_down.sql

insert into projects.enquiry_dropdown_options (kind_id, value, sort_order)
select k.id, 'Order Lost', 5
from projects.enquiry_dropdown_kinds k
where k.kind_key = 'current_status'
on conflict (kind_id, value) do nothing;

notify pgrst, 'reload schema';

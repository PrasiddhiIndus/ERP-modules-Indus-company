-- Rollback for 20261118191000_projects_enquiry_order_lost_status.sql.
-- Removes the "Order Lost" option from the Current Status dropdown.
-- Enquiries already saved as Order Lost keep that value (shown as an "other" status).

delete from projects.enquiry_dropdown_options o
using projects.enquiry_dropdown_kinds k
where o.kind_id = k.id
  and k.kind_key = 'current_status'
  and o.value = 'Order Lost';

notify pgrst, 'reload schema';

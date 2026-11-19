-- Rollback for 20261118190000_projects_quotation_order_status_date.sql.
-- Stops stamping the date on status changes. Dates already stamped stay as they are.

drop trigger if exists quotations_stamp_order_status_date on projects.quotations;
drop function if exists projects.quotations_stamp_order_status_date();

comment on column projects.quotations.order_converted_date is
  'Date the offer converted to an order (Offer Database sheet "Order Coverted Date"); drives the Quarter column.';

notify pgrst, 'reload schema';

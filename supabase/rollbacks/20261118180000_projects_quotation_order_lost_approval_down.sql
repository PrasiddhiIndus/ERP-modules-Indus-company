-- Rollback for 20261118180000_projects_quotation_order_lost_approval.sql.
-- Removes the Order Lost approval guard, request functions and the request table.
-- Quotation rows are not touched (statuses already set stay as they are).
-- NOTE: dropping the table deletes the Order Lost request history.

drop trigger if exists quotations_guard_order_lost on projects.quotations;
drop trigger if exists quotations_settle_status_requests_upd on projects.quotations;
drop trigger if exists quotations_settle_status_requests_del on projects.quotations;
drop function if exists projects.quotations_guard_order_lost();
drop function if exists projects.quotations_settle_status_requests();
drop function if exists projects.decide_quotation_order_lost(bigint, boolean, text);
drop function if exists projects.request_quotation_order_lost(uuid, text);
drop table if exists projects.quotation_status_change_requests;
-- projects.current_user_is_super_admin() is also used by 20261118181000 / 20261118182000;
-- drop it only after rolling those back.
drop function if exists projects.current_user_is_super_admin();

notify pgrst, 'reload schema';

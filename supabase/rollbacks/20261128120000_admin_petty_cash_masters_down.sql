-- Rollback for 20261128120000_admin_petty_cash_masters.sql
-- WARNING: drops all Petty Cash overheads, expense categories and vouchers.

DROP VIEW IF EXISTS public.expense_category_usage;
DROP TABLE IF EXISTS public.petty_cash_voucher;
DROP TABLE IF EXISTS public.expense_category;
DROP TABLE IF EXISTS public.overhead_category;

DROP FUNCTION IF EXISTS public.petty_cash_voucher_before_insert();
DROP FUNCTION IF EXISTS public.expense_category_before_delete();
DROP FUNCTION IF EXISTS public.expense_category_before_write();
DROP FUNCTION IF EXISTS public.overhead_category_before_delete();
DROP FUNCTION IF EXISTS public.overhead_category_before_write();
DROP FUNCTION IF EXISTS public.current_user_can_view_petty_cash();
DROP FUNCTION IF EXISTS public.current_user_can_manage_petty_cash_masters();

-- Rollback for 20261119103000_comp_off_manual_deduct_month_amount_ensure.sql.
-- Only drops the helper if you intentionally want to undo the ensure.
-- Warning: set_comp_off_month_balance will fail on decreases without this function.

DROP FUNCTION IF EXISTS indus_one.comp_off_manual_deduct_month_amount(text, numeric, date, date, date, text);

NOTIFY pgrst, 'reload schema';

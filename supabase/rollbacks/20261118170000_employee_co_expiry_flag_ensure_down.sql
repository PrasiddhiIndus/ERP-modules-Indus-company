-- Rollback for 20261118170000_employee_co_expiry_flag_ensure.sql.
-- Removes only what that ensure migration added. Does not change employee master
-- weekly-off / save RPCs, and does not rewrite C/O credit rows.

DROP TRIGGER IF EXISTS trg_comp_off_credit_expiry_mode ON indus_one.comp_off_credits;
DROP FUNCTION IF EXISTS indus_one.comp_off_credit_apply_expiry_mode();
DROP FUNCTION IF EXISTS indus_one.comp_off_resync_expiry(text);
DROP FUNCTION IF EXISTS public.admin_rule_co_expires(text, date);

UPDATE public.admin_attendance_rules
SET is_wired = false,
    engine_ref = 'Phase 2C',
    description = 'Whether C/O credits expire.'
WHERE rule_key = 'co.expiry_mode';

NOTIFY pgrst, 'reload schema';

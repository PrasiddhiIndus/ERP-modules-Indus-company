-- =============================================================================
-- C/O ledger start date fixed at 2026-09-01 (was "start of current month",
-- which dropped all earlier-month credits from balances on every 1st).
--
-- Credits / earning / CO consumption / balances count only work dates on or
-- after 2026-09-01. Nothing before 1 Sep 2026 is counted.
-- Function definition only — no table rows changed.
-- Keep in sync with COMP_OFF_START_MONTH_KEY in src/lib/compOffBalance.js.
-- =============================================================================

CREATE OR REPLACE FUNCTION indus_one.comp_off_cutoff_date()
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT DATE '2026-09-01';
$$;

COMMENT ON FUNCTION indus_one.comp_off_cutoff_date() IS
  'C/O ledger start: only work dates on or after 2026-09-01 earn or count toward balance.';

NOTIFY pgrst, 'reload schema';

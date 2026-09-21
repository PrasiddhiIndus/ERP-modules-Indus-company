-- Commercial Manpower: simple Price Escalation capture (Yes/No + up to 4 rate columns).
-- Display/storage only — does not alter contract value / monthly / invoice calculations.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS price_escalation_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS rate_escalation_count smallint;

COMMENT ON COLUMN billing.po_wo.price_escalation_enabled IS
  'When true, PO Entry shows Rate Escalation 1..N columns (capture only).';

COMMENT ON COLUMN billing.po_wo.rate_escalation_count IS
  'Number of rate escalation columns to show (1–4) when price_escalation_enabled is true.';

ALTER TABLE billing.po_rate_category
  ADD COLUMN IF NOT EXISTS rate_escalation_1 numeric(18, 2),
  ADD COLUMN IF NOT EXISTS rate_escalation_2 numeric(18, 2),
  ADD COLUMN IF NOT EXISTS rate_escalation_3 numeric(18, 2),
  ADD COLUMN IF NOT EXISTS rate_escalation_4 numeric(18, 2),
  ADD COLUMN IF NOT EXISTS rate_escalation_5 numeric(18, 2);

COMMENT ON COLUMN billing.po_rate_category.rate_escalation_1 IS 'Optional Rate Escalation 1 (₹); capture only.';
COMMENT ON COLUMN billing.po_rate_category.rate_escalation_2 IS 'Optional Rate Escalation 2 (₹); capture only.';
COMMENT ON COLUMN billing.po_rate_category.rate_escalation_3 IS 'Optional Rate Escalation 3 (₹); capture only.';
COMMENT ON COLUMN billing.po_rate_category.rate_escalation_4 IS 'Optional Rate Escalation 4 (₹); capture only.';
COMMENT ON COLUMN billing.po_rate_category.rate_escalation_5 IS 'Optional Rate Escalation 5 (₹); reserved; UI uses 1–4.';

NOTIFY pgrst, 'reload schema';

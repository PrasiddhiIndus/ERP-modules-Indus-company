-- Remove Commercial Manpower / Training price escalation from billing.po_wo.
-- Keeps po_effective_date. Does not alter other PO / invoice / billing logic.

DROP POLICY IF EXISTS po_price_escalation_history_select ON billing.po_price_escalation_history;
DROP POLICY IF EXISTS po_price_escalation_history_insert ON billing.po_price_escalation_history;

DROP TABLE IF EXISTS billing.po_price_escalation_history;

ALTER TABLE billing.po_wo
  DROP COLUMN IF EXISTS price_escalation_enabled;

ALTER TABLE billing.po_wo
  DROP COLUMN IF EXISTS price_escalation_schedule;

NOTIFY pgrst, 'reload schema';

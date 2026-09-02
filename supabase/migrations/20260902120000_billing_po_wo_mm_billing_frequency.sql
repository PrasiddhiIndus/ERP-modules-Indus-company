-- M&M PO Entry: allow extended billing_frequency values and custom "other" text.

ALTER TABLE billing.po_wo DROP CONSTRAINT IF EXISTS billing_po_wo_billing_frequency_check;

ALTER TABLE billing.po_wo
  ADD CONSTRAINT billing_po_wo_billing_frequency_check
  CHECK (
    billing_frequency IS NULL
    OR length(btrim(billing_frequency)) BETWEEN 1 AND 100
  );

COMMENT ON COLUMN billing.po_wo.billing_frequency IS
  'Billing cadence: monthly, quarterly, one_time, half_yearly, annually, or custom text for M&M PO Entry.';

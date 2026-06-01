-- Snapshot consignee pin on invoice when different from bill-to.

ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS client_ship_to_pincode text;

COMMENT ON COLUMN billing.invoice.client_ship_to_pincode IS 'Consignee pin snapshot; null when same as buyer_pincode.';

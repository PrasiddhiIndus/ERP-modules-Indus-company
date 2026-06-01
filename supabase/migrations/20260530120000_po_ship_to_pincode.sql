-- Separate consignee pin when bill-to and ship-to pincodes differ.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS ship_to_pincode text;

COMMENT ON COLUMN billing.po_wo.ship_to_pincode IS 'Consignee pin when different from bill-to pincode; null when same as pincode.';

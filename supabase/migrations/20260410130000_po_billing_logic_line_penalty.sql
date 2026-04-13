-- PO: monthly duty/qty formula and lump-sum billing variant (drives Create Invoice UI/logic)
ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS monthly_duty_qty_mode text,
  ADD COLUMN IF NOT EXISTS lump_sum_billing_mode text;

COMMENT ON COLUMN billing.po_wo.monthly_duty_qty_mode IS 'Monthly: po_geometry = (actual/auth)*PO qty; duty_ratio = actual/auth as qty.';
COMMENT ON COLUMN billing.po_wo.lump_sum_billing_mode IS 'Lump Sum: normal | penalty (line penalty column) | fire_tender (extra Fire Tender row).';

-- Invoice lines: optional penalty (lump-sum mode)
ALTER TABLE billing.invoice_line_item
  ADD COLUMN IF NOT EXISTS line_penalty numeric(18,2) DEFAULT 0;

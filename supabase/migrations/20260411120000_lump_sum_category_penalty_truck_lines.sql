-- PO rate rows: per-line penalty (Lump Sum + penalty mode) — used in Rate = (actual/auth)*PO rate − penalty
ALTER TABLE billing.po_rate_category
  ADD COLUMN IF NOT EXISTS category_penalty numeric(18,2) DEFAULT 0;

-- Invoice lines: lump-sum PO rate snapshot + truck (manual qty×rate) lines
ALTER TABLE billing.invoice_line_item
  ADD COLUMN IF NOT EXISTS po_reference_rate numeric(18,2),
  ADD COLUMN IF NOT EXISTS is_truck_line boolean DEFAULT false;

-- Rename legacy mode value
UPDATE billing.po_wo SET lump_sum_billing_mode = 'truck' WHERE lump_sum_billing_mode = 'fire_tender';

COMMENT ON COLUMN billing.po_rate_category.category_penalty IS 'Lump sum penalty mode: subtract from duty-adjusted rate on invoice.';
COMMENT ON COLUMN billing.invoice_line_item.po_reference_rate IS 'Snapshot of PO category rate for lump-sum duty lines.';
COMMENT ON COLUMN billing.invoice_line_item.is_truck_line IS 'True: invoice line uses manual Qty×Rate only (truck add-on rows).';

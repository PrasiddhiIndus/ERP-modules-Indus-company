-- Optional free-text note on tax invoice footer (left of total qty / invoice total bar).
ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS invoice_quantity_footer_note text;

COMMENT ON COLUMN billing.invoice.invoice_quantity_footer_note IS
  'User-entered note shown on invoice footer (below line items); total quantity aligns under Qty column.';

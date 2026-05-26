ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS monthly_duty_qty_mode text,
  ADD COLUMN IF NOT EXISTS lump_sum_billing_mode text;

ALTER TABLE billing.invoice_line_item
  ADD COLUMN IF NOT EXISTS number_of_months numeric(18,3);

COMMENT ON COLUMN billing.invoice.monthly_duty_qty_mode IS 'Invoice-level monthly geometry logic selected in Create Invoice.';
COMMENT ON COLUMN billing.invoice.lump_sum_billing_mode IS 'Invoice-level lump sum geometry logic selected in Create Invoice.';
COMMENT ON COLUMN billing.invoice_line_item.number_of_months IS 'Snapshot used for months-based geometry formulas.';

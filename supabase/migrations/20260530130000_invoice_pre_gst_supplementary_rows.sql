-- Multiple pre-GST supplementary amount rows on tax invoices
ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS pre_gst_supplementary_rows jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN billing.invoice.pre_gst_supplementary_rows IS
  'JSON array of {description, amount, type: add|deduct} applied to line subtotal before GST.';

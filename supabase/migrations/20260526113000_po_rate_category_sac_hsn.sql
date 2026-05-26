ALTER TABLE billing.po_rate_category
  ADD COLUMN IF NOT EXISTS hsn_sac text;

COMMENT ON COLUMN billing.po_rate_category.hsn_sac IS 'SAC/HSN code captured per PO rate category and copied to invoice line items.';

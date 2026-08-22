-- DSC region/thumbprint persistence + re-sign versioning for Manage Invoices
ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS dsc_region jsonb;

ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS dsc_thumbprint text;

ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS dsc_signed_version integer NOT NULL DEFAULT 1;

ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS dsc_signed_at timestamptz;

COMMENT ON COLUMN billing.invoice.dsc_region IS
  'Signature box region on the tax invoice preview (percent left/top/width/height).';
COMMENT ON COLUMN billing.invoice.dsc_thumbprint IS
  'USB DSC certificate thumbprint used for cryptographic PDF signing.';
COMMENT ON COLUMN billing.invoice.dsc_signed_version IS
  'Increments each time the invoice DSC is re-signed via Edit DSC.';
COMMENT ON COLUMN billing.invoice.dsc_signed_at IS
  'Timestamp of the latest DSC sign/save.';

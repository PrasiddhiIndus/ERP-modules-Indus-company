-- PO: invoice-facing terms, ship-to, seller compliance, place of supply (editable only in PO Entry)
ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS invoice_terms_text text,
  ADD COLUMN IF NOT EXISTS seller_cin text,
  ADD COLUMN IF NOT EXISTS seller_pan text,
  ADD COLUMN IF NOT EXISTS msme_registration_no text,
  ADD COLUMN IF NOT EXISTS msme_clause text,
  ADD COLUMN IF NOT EXISTS place_of_supply text;

-- Invoice: snapshot consignee address, terms text, place of supply at billing time
ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS client_shipping_address text,
  ADD COLUMN IF NOT EXISTS terms_custom_text text,
  ADD COLUMN IF NOT EXISTS place_of_supply text;

COMMENT ON COLUMN billing.po_wo.invoice_terms_text IS 'Terms printed on tax invoice; maintained in PO Entry only.';
COMMENT ON COLUMN billing.po_wo.shipping_address IS 'Consignee (ship-to); if null/empty, billing_address is used on invoice.';
COMMENT ON COLUMN billing.invoice.client_shipping_address IS 'Snapshot of ship-to at invoice save.';
COMMENT ON COLUMN billing.invoice.terms_custom_text IS 'Snapshot of PO invoice_terms_text (or override) at invoice save.';

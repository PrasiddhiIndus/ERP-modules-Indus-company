-- Invoice: compliance & proforma/draft, MSME, billing period, signature
ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS bill_number text,
  ADD COLUMN IF NOT EXISTS billing_month text,
  ADD COLUMN IF NOT EXISTS seller_cin text,
  ADD COLUMN IF NOT EXISTS seller_pan text,
  ADD COLUMN IF NOT EXISTS msme_registration_no text,
  ADD COLUMN IF NOT EXISTS msme_clause text,
  ADD COLUMN IF NOT EXISTS billing_duration_from date,
  ADD COLUMN IF NOT EXISTS billing_duration_to date,
  ADD COLUMN IF NOT EXISTS invoice_header_remarks text,
  ADD COLUMN IF NOT EXISTS terms_template_key text,
  ADD COLUMN IF NOT EXISTS invoice_kind text DEFAULT 'tax',
  ADD COLUMN IF NOT EXISTS gst_supply_type text DEFAULT 'intra',
  ADD COLUMN IF NOT EXISTS igst_rate numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amt numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS digital_signature_data_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_invoice_kind_check'
  ) THEN
    ALTER TABLE billing.invoice
      ADD CONSTRAINT billing_invoice_kind_check
      CHECK (invoice_kind IS NULL OR invoice_kind IN ('tax', 'proforma', 'draft'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_invoice_gst_supply_check'
  ) THEN
    ALTER TABLE billing.invoice
      ADD CONSTRAINT billing_invoice_gst_supply_check
      CHECK (gst_supply_type IS NULL OR gst_supply_type IN ('intra', 'inter', 'sez_zero'));
  END IF;
END $$;

-- Line items: monthly calculator fields
ALTER TABLE billing.invoice_line_item
  ADD COLUMN IF NOT EXISTS po_qty numeric(18,2),
  ADD COLUMN IF NOT EXISTS actual_duty numeric(18,2),
  ADD COLUMN IF NOT EXISTS authorized_duty numeric(18,2);

-- PO/WO: vendor, GST mode on supply, audit trail
ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS vendor_code text,
  ADD COLUMN IF NOT EXISTS gst_supply_type text DEFAULT 'intra',
  ADD COLUMN IF NOT EXISTS update_history jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN billing.invoice.invoice_kind IS 'tax | proforma | draft — PDF header only; same layout.';
COMMENT ON COLUMN billing.po_wo.update_history IS 'JSON array of {at, summary} for PO change log.';

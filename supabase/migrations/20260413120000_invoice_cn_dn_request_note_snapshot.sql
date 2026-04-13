-- Credit / debit note workflow: request + approval on parent invoice; issued note stores full document snapshot for tax-format PDF.

ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS cn_dn_request_status text,
  ADD COLUMN IF NOT EXISTS cn_dn_request_note_type text,
  ADD COLUMN IF NOT EXISTS cn_dn_request_reason text,
  ADD COLUMN IF NOT EXISTS cn_dn_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cn_dn_approved_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_invoice_cn_dn_request_status_check'
  ) THEN
    ALTER TABLE billing.invoice
      ADD CONSTRAINT billing_invoice_cn_dn_request_status_check
      CHECK (
        cn_dn_request_status IS NULL
        OR cn_dn_request_status IN ('pending', 'approved', 'rejected')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_invoice_cn_dn_request_note_type_check'
  ) THEN
    ALTER TABLE billing.invoice
      ADD CONSTRAINT billing_invoice_cn_dn_request_note_type_check
      CHECK (
        cn_dn_request_note_type IS NULL
        OR cn_dn_request_note_type IN ('credit', 'debit')
      );
  END IF;
END $$;

COMMENT ON COLUMN billing.invoice.cn_dn_request_status IS 'pending | approved | rejected — Commercial approval to raise CN/DN against this tax invoice.';
COMMENT ON COLUMN billing.invoice.cn_dn_request_note_type IS 'credit | debit — requested note type while pending/approved.';

ALTER TABLE billing.credit_debit_note
  ADD COLUMN IF NOT EXISTS note_tax_invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_snapshot jsonb;

COMMENT ON COLUMN billing.credit_debit_note.note_tax_invoice_number IS 'Display document no., e.g. CN-{parent tax invoice no.} or DN-{...}.';
COMMENT ON COLUMN billing.credit_debit_note.invoice_snapshot IS 'Full payload for tax-invoice-layout PDF/HTML (items, GST, buyer, etc.).';

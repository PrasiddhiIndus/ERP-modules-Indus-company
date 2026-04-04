-- Add dedicated remarks column for PO/WO
-- Keep payment_terms for backward compatibility and backfill remarks from it.

ALTER TABLE billing.po_wo
ADD COLUMN IF NOT EXISTS remarks text;

UPDATE billing.po_wo
SET remarks = payment_terms
WHERE remarks IS NULL AND payment_terms IS NOT NULL;


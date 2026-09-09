-- Remove unused free-text payment terms note from Commercial Manpower PO/WO.

ALTER TABLE billing.po_wo
  DROP COLUMN IF EXISTS payment_terms_note;

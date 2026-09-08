-- Commercial Manpower: free-text payment terms note on PO/WO.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS payment_terms_note text;

COMMENT ON COLUMN billing.po_wo.payment_terms_note IS
  'Short payment terms note shown on Commercial Manpower contract entry.';

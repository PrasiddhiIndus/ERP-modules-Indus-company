-- Billing PO/WO: optional "bill without physical PO" contracts (dummy OC/WO used as identifiers).

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS billing_without_po boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN billing.po_wo.billing_without_po IS 'True when contract is billed without a customer PO; PO/WO fields may hold generated identifiers (WOPO-…).';

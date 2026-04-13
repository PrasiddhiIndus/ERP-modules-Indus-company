-- Contract renewal support: keep original PO/WO + new PO/WO & contract values
-- Used to replace supplementary mock PO numbers after renewal approval.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS renewed_po_wo_number text,
  ADD COLUMN IF NOT EXISTS renewed_total_contract_value numeric(18,2),
  ADD COLUMN IF NOT EXISTS renewed_start_date date,
  ADD COLUMN IF NOT EXISTS renewed_end_date date;

COMMENT ON COLUMN billing.po_wo.renewed_po_wo_number IS 'Second/renewed PO/WO number after contract renewal (entered in app).';
COMMENT ON COLUMN billing.po_wo.renewed_total_contract_value IS 'Second/renewed total contract value after renewal (entered in app).';
COMMENT ON COLUMN billing.po_wo.renewed_start_date IS 'Renewal period start date (for renewed PO/WO).';
COMMENT ON COLUMN billing.po_wo.renewed_end_date IS 'Renewal period end date (for renewed PO/WO).';


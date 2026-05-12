ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS total_contract_month numeric(18,3),
  ADD COLUMN IF NOT EXISTS monthly_contract_value numeric(18,2);

COMMENT ON COLUMN billing.po_wo.total_contract_month IS 'Lump sum PO Entry: total contract months used to derive monthly contract value.';
COMMENT ON COLUMN billing.po_wo.monthly_contract_value IS 'Lump sum PO Entry: total contract value divided by total contract months.';

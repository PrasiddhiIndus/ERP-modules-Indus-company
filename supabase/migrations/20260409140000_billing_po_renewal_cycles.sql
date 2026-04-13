-- Renewal cycles: multiple PO/WO numbers & contract values over time
-- Each cycle entry: { po_wo_number, total_contract_value, start_date, end_date, approved_at }

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS renewal_cycles jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN billing.po_wo.renewal_cycles IS 'Array of renewal cycles: [{po_wo_number,total_contract_value,start_date,end_date,approved_at}]';


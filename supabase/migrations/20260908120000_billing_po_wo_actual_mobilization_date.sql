-- Commercial Manpower / Training: actual mobilization date on PO/WO.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS actual_mobilization_date date;

COMMENT ON COLUMN billing.po_wo.actual_mobilization_date IS
  'Actual mobilization date for manpower / training contracts.';

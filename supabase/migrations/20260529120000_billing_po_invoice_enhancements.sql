-- PO/WO + invoice enhancements: PO date, pincode, material code, pre-GST adjustments, line UOM.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS po_date date,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS material_code_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN billing.po_wo.po_date IS 'Customer PO date (distinct from contract start/end).';
COMMENT ON COLUMN billing.po_wo.pincode IS 'Site / billing pincode captured on PO.';
COMMENT ON COLUMN billing.po_wo.material_code_required IS 'When true, invoice lines require material code entry.';

ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS po_date date,
  ADD COLUMN IF NOT EXISTS pre_gst_deduction numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pre_gst_addition numeric(18,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN billing.invoice.po_date IS 'Snapshot of PO date on invoice print.';
COMMENT ON COLUMN billing.invoice.pre_gst_deduction IS 'Amount deducted from line total before GST.';
COMMENT ON COLUMN billing.invoice.pre_gst_addition IS 'Amount added to line total before GST.';

ALTER TABLE billing.invoice_line_item
  ADD COLUMN IF NOT EXISTS material_code text,
  ADD COLUMN IF NOT EXISTS uom text;

COMMENT ON COLUMN billing.invoice_line_item.material_code IS 'Optional material code when PO requires it.';
COMMENT ON COLUMN billing.invoice_line_item.uom IS 'Unit of measure for invoice line (default No.).';

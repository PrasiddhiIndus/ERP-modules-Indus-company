-- Add quantity column for PO rate category rows
-- Used by PO Entry: "Rate per Category" table (Description, Qty, Rate)

ALTER TABLE billing.po_rate_category
ADD COLUMN IF NOT EXISTS qty numeric(18,2) NOT NULL DEFAULT 0;


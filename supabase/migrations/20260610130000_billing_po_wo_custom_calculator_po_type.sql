-- Allow "Custom Calculator" (and legacy "Custom") manpower billing types in shared billing.po_wo.
-- POEntry exposes "Custom Calculator" as a Manpower/Training billing type; the existing
-- check constraint only permitted Per Day / Monthly / Lump Sum / Supply / Service, so saving
-- or approving such a PO failed with: violates check constraint "billing_po_wo_po_type_check".
ALTER TABLE billing.po_wo
  DROP CONSTRAINT IF EXISTS billing_po_wo_po_type_check;

ALTER TABLE billing.po_wo
  ADD CONSTRAINT billing_po_wo_po_type_check
  CHECK (
    po_type IS NULL OR
    po_type IN (
      'Per Day', 'Monthly', 'Lump Sum', 'Custom', 'Custom Calculator',
      'Supply', 'Service'
    )
  );

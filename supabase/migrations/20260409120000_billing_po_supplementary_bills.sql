-- Supplementary bills workflow (PO/WO level)
-- Allows requesting and approving supplementary billing beyond contract dates.
-- Once approved, app creates a derived PO row with same OC and a mock PO number.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS is_supplementary boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplementary_parent_po_id uuid,
  ADD COLUMN IF NOT EXISTS supplementary_request_status text,
  ADD COLUMN IF NOT EXISTS supplementary_reason text,
  ADD COLUMN IF NOT EXISTS supplementary_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplementary_approved_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_po_wo_supplementary_request_status_check'
  ) THEN
    ALTER TABLE billing.po_wo
      ADD CONSTRAINT billing_po_wo_supplementary_request_status_check
      CHECK (
        supplementary_request_status IS NULL
        OR supplementary_request_status IN ('pending', 'approved', 'rejected')
      );
  END IF;
END $$;

COMMENT ON COLUMN billing.po_wo.is_supplementary IS 'True when this PO/WO row is a supplementary-billing mock PO created by app.';
COMMENT ON COLUMN billing.po_wo.supplementary_parent_po_id IS 'Parent PO/WO id that this supplementary row derives from.';
COMMENT ON COLUMN billing.po_wo.supplementary_request_status IS 'pending | approved | rejected for supplementary billing request on the parent PO.';


-- Fleet: R2 attachment keys on vehicle master, maintenance; document history on drivers
ALTER TABLE operations_fire_tender_vehicle_master
  ADD COLUMN IF NOT EXISTS r2_attachment_keys jsonb DEFAULT '[]'::jsonb;

ALTER TABLE operations_fire_tender_vehicle_maintenance
  ADD COLUMN IF NOT EXISTS r2_attachment_keys jsonb DEFAULT '[]'::jsonb;

ALTER TABLE operations_fire_tender_vehicle_drivers
  ADD COLUMN IF NOT EXISTS r2_document_history jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN operations_fire_tender_vehicle_master.r2_attachment_keys IS 'Array of R2 object keys for vehicle supporting documents';
COMMENT ON COLUMN operations_fire_tender_vehicle_maintenance.r2_attachment_keys IS 'Array of R2 object keys for maintenance receipts/invoices';
COMMENT ON COLUMN operations_fire_tender_vehicle_drivers.r2_document_history IS 'Audit trail of driver certificate/license uploads (active, replaced, deleted)';

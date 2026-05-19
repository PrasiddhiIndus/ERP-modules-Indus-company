-- Fleet: store Cloudflare R2 object keys (jsonb array) on documents and drivers
ALTER TABLE operations_fire_tender_vehicle_documents
  ADD COLUMN IF NOT EXISTS r2_attachment_keys jsonb DEFAULT '[]'::jsonb;

ALTER TABLE operations_fire_tender_vehicle_drivers
  ADD COLUMN IF NOT EXISTS r2_attachment_keys jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN operations_fire_tender_vehicle_documents.r2_attachment_keys IS 'Array of R2 object keys under fleet/documents/{userId}/…';
COMMENT ON COLUMN operations_fire_tender_vehicle_drivers.r2_attachment_keys IS 'Array of R2 object keys under fleet/drivers/{userId}/…';

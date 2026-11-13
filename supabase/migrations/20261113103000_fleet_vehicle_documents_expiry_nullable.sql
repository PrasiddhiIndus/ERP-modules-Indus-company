-- Fleet vehicle documents: allow missing expiry for types that do not have one
-- (e.g. commercial RC validity follows Fitness Certificate).
-- Some environments still have NOT NULL from an older vehicle_documents schema.

ALTER TABLE IF EXISTS public.operations_fire_tender_vehicle_documents
  ALTER COLUMN expiry_date DROP NOT NULL;

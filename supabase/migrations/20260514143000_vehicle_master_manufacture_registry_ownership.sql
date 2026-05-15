-- Vehicle Master: date of manufacture (MM-YYYY text), registry validity, ownership type
ALTER TABLE operations_fire_tender_vehicle_master
  ADD COLUMN IF NOT EXISTS date_of_manufacture text,
  ADD COLUMN IF NOT EXISTS registry_validity_date date,
  ADD COLUMN IF NOT EXISTS ownership_type text;

COMMENT ON COLUMN operations_fire_tender_vehicle_master.date_of_manufacture IS 'Month-year of manufacture; format YYYY-MM (HTML month input). Legacy MM-YYYY rows are supported in the app.';
COMMENT ON COLUMN operations_fire_tender_vehicle_master.registry_validity_date IS 'Date until which vehicle registration is valid';
COMMENT ON COLUMN operations_fire_tender_vehicle_master.ownership_type IS 'rented or owned';

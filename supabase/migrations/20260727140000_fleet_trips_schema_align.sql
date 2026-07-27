-- Align operations_fire_tender_vehicle_trips with VehicleTrips.jsx.
-- Older DBs may still have the original narrow table (CREATE TABLE IF NOT EXISTS
-- in 20260514180000 did not add columns when the table already existed).

ALTER TABLE public.operations_fire_tender_vehicle_trips
  ADD COLUMN IF NOT EXISTS assignment_type text,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS deployment_location text,
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS date_of_mobilisation date,
  ADD COLUMN IF NOT EXISTS km_at_mobilisation_out numeric,
  ADD COLUMN IF NOT EXISTS km_at_demobilisation_in numeric,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS responsible_person text,
  ADD COLUMN IF NOT EXISTS site_visit_location text,
  ADD COLUMN IF NOT EXISTS number_of_passengers integer,
  ADD COLUMN IF NOT EXISTS visit_date date,
  ADD COLUMN IF NOT EXISTS visit_duration_days integer,
  ADD COLUMN IF NOT EXISTS departments_allotted jsonb,
  ADD COLUMN IF NOT EXISTS expense_attachments jsonb,
  ADD COLUMN IF NOT EXISTS user_employee_code text;

-- Relax legacy NOT NULL constraints so assignment forms can save safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'operations_fire_tender_vehicle_trips'
      AND column_name = 'vehicle_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.operations_fire_tender_vehicle_trips
      ALTER COLUMN vehicle_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'operations_fire_tender_vehicle_trips'
      AND column_name = 'trip_purpose'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.operations_fire_tender_vehicle_trips
      ALTER COLUMN trip_purpose DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'operations_fire_tender_vehicle_trips'
      AND column_name = 'issued_to_name'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.operations_fire_tender_vehicle_trips
      ALTER COLUMN issued_to_name DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'operations_fire_tender_vehicle_trips'
      AND column_name = 'start_date_time'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.operations_fire_tender_vehicle_trips
      ALTER COLUMN start_date_time DROP NOT NULL;
  END IF;
END $$;

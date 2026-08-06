-- Store passenger name list for in-house vehicle assignments.
ALTER TABLE public.operations_fire_tender_vehicle_trips
  ADD COLUMN IF NOT EXISTS passenger_names jsonb;

-- Commercial Manpower: per-row manpower details + accommodation / transportation scope.

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS manpower_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accommodation_scope text,
  ADD COLUMN IF NOT EXISTS transportation_scope text;

COMMENT ON COLUMN billing.po_wo.manpower_details IS
  'JSON array of {designation, noOfManpower, dutyPattern, customDutyPattern}.';
COMMENT ON COLUMN billing.po_wo.accommodation_scope IS
  'Accommodation scope (same options as reliever scope).';
COMMENT ON COLUMN billing.po_wo.transportation_scope IS
  'Transportation scope (same options as reliever scope).';

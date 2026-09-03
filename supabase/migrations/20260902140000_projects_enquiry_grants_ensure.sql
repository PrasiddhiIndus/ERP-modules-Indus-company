-- Enquiry Master tables already exist in schema projects.
-- authenticated is missing table privileges, which surfaces as:
--   permission denied for table enquiries
--   permission denied for table enquiry_dropdown_kinds
--
-- This file does not create or seed tables. Safe to re-run.
-- Also add `projects` under Dashboard → Settings → API → Exposed schemas.

GRANT USAGE ON SCHEMA projects TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA projects
  TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA projects
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  projects.enquiry_dropdown_kinds,
  projects.enquiry_dropdown_options,
  projects.enquiry_field_definitions,
  projects.enquiries
  TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA projects
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA projects
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

ALTER TABLE projects.enquiry_dropdown_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.enquiry_dropdown_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.enquiry_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enquiry_dropdown_kinds_auth" ON projects.enquiry_dropdown_kinds;
CREATE POLICY "enquiry_dropdown_kinds_auth"
  ON projects.enquiry_dropdown_kinds FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "enquiry_dropdown_options_auth" ON projects.enquiry_dropdown_options;
CREATE POLICY "enquiry_dropdown_options_auth"
  ON projects.enquiry_dropdown_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "enquiry_field_definitions_auth" ON projects.enquiry_field_definitions;
CREATE POLICY "enquiry_field_definitions_auth"
  ON projects.enquiry_field_definitions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "enquiries_auth" ON projects.enquiries;
CREATE POLICY "enquiries_auth"
  ON projects.enquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

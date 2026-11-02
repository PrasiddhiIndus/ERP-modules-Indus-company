-- =============================================================================
-- R&M module — own PostgreSQL schema for enquiries (not public.manpower_enquiries).
--
-- Contract POs remain in billing.po_wo (Billing Tracker needs them) but are scoped
-- by commercial module marker "rm" so they do not share Manpower/Training or
-- Maintenance M&M module bags.
--
-- Expose schema in Supabase Dashboard → Settings → API → Exposed schemas: add "rm"
-- Rollback: supabase/rollbacks/20261102180000_rm_schema_enquiries_down.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS rm;

COMMENT ON SCHEMA rm IS
  'R&M commercial module. Enquiries live here; do not use public.manpower_enquiries for R&M.';

GRANT USAGE ON SCHEMA rm TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS rm.enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client text NOT NULL DEFAULT '',
  phone text,
  email text,
  street text,
  street2 text,
  city text,
  state text,
  zip text,
  country text,
  priority integer NOT NULL DEFAULT 1,
  source text,
  due_date date,
  rfq_available boolean NOT NULL DEFAULT false,
  project_estimation text,
  duration jsonb NOT NULL DEFAULT '{"days": 0, "months": 0, "years": 0}'::jsonb,
  documents text,
  manpower_required text,
  fire_tender_required boolean NOT NULL DEFAULT false,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  handled_by text,
  authorization_to text,
  enquiry_number text,
  status text NOT NULL DEFAULT 'Pending',
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  user_employee_code text,
  sr_no integer,
  received_date date,
  vertical text DEFAULT 'R&M',
  mode_of_submission text,
  total_manpower integer,
  location text,
  offer_submitted_on date,
  remarks text,
  further_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rm_enquiries_enquiry_number_unique
  ON rm.enquiries (enquiry_number)
  WHERE enquiry_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rm_enquiries_sr_no_unique
  ON rm.enquiries (sr_no)
  WHERE sr_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS rm_enquiries_created_at_idx
  ON rm.enquiries (created_at DESC);

COMMENT ON TABLE rm.enquiries IS
  'R&M module enquiries only. Separate from public.manpower_enquiries (Manpower/Training).';

ALTER TABLE rm.enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_enquiries_select_authenticated ON rm.enquiries;
DROP POLICY IF EXISTS rm_enquiries_insert_authenticated ON rm.enquiries;
DROP POLICY IF EXISTS rm_enquiries_update_authenticated ON rm.enquiries;
DROP POLICY IF EXISTS rm_enquiries_delete_authenticated ON rm.enquiries;

CREATE POLICY rm_enquiries_select_authenticated
  ON rm.enquiries FOR SELECT TO authenticated USING (true);

CREATE POLICY rm_enquiries_insert_authenticated
  ON rm.enquiries FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY rm_enquiries_update_authenticated
  ON rm.enquiries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY rm_enquiries_delete_authenticated
  ON rm.enquiries FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON rm.enquiries TO authenticated;
GRANT ALL ON rm.enquiries TO service_role;

CREATE OR REPLACE FUNCTION rm.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rm_enquiries_updated_at ON rm.enquiries;
CREATE TRIGGER rm_enquiries_updated_at
  BEFORE UPDATE ON rm.enquiries
  FOR EACH ROW EXECUTE FUNCTION rm.set_updated_at();

CREATE SEQUENCE IF NOT EXISTS rm.enquiries_sr_no_seq;

CREATE OR REPLACE FUNCTION rm.next_enquiry_sr_no()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rm, public
AS $$
DECLARE
  current_max integer;
  seq_last bigint;
BEGIN
  SELECT COALESCE(MAX(sr_no), 0) INTO current_max FROM rm.enquiries;
  SELECT last_value INTO seq_last FROM rm.enquiries_sr_no_seq;
  IF seq_last < current_max THEN
    PERFORM setval('rm.enquiries_sr_no_seq', current_max, true);
  END IF;
  RETURN nextval('rm.enquiries_sr_no_seq')::integer;
END;
$$;

GRANT USAGE, SELECT ON SEQUENCE rm.enquiries_sr_no_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rm.next_enquiry_sr_no() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

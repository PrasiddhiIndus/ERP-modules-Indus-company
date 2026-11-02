-- Rollback for 20261102180000_rm_schema_enquiries.sql
DROP FUNCTION IF EXISTS rm.next_enquiry_sr_no();
DROP SEQUENCE IF EXISTS rm.enquiries_sr_no_seq;
DROP TRIGGER IF EXISTS rm_enquiries_updated_at ON rm.enquiries;
DROP FUNCTION IF EXISTS rm.set_updated_at();
DROP TABLE IF EXISTS rm.enquiries;
DROP SCHEMA IF EXISTS rm CASCADE;
NOTIFY pgrst, 'reload schema';

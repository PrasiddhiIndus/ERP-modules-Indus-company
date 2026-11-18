-- Rollback for 20261118150000_po_at_glance_signature_file.sql (read-only function; no data is touched).
DROP FUNCTION IF EXISTS public.oc_dept_signature_file(text, uuid, text);
NOTIFY pgrst, 'reload schema';

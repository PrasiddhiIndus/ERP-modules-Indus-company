-- Rollback for 20261119160000_po_at_glance_dept_mail_thread.sql
-- After this, IEV / Maintenance / R&M / Commercial emails still send (the API server falls back
-- to a new message per event when the table is missing). Projects (pj_oc_mail_thread) is untouched.
DROP TABLE IF EXISTS public.oc_mail_thread;

NOTIFY pgrst, 'reload schema';

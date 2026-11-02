-- Rollback for 20261102140000_finance_master_po_at_glance.sql (department PO records are untouched).
DROP FUNCTION IF EXISTS public.finance_po_oc_history(text, uuid);
DROP FUNCTION IF EXISTS public.finance_po_set_oc_no(text, uuid, text, date, timestamptz);
DROP FUNCTION IF EXISTS public.finance_po_glance_list();
DROP TABLE IF EXISTS public.finance_oc_no_audit;
NOTIFY pgrst, 'reload schema';

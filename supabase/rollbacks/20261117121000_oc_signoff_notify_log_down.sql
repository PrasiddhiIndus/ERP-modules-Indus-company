-- Rollback for 20261117121000_oc_signoff_notify_log.sql
-- The API server keeps working without this table (it logs a warning and sends without idempotency),
-- but repeated requests can then send the same notification again.
DROP TABLE IF EXISTS public.oc_signoff_notify_log;

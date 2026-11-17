-- =============================================================================
-- Security fix C3 — idempotency log for PO At Glance sign-off emails
-- (/api/{fire-tender,maintenance,projects,rm,commercial}/oc/signoff-notify).
--
-- One row per notification event (a verified signature, an OC creation, an OC Number change,
-- a revision request). The API server claims the row before sending:
--   * status 'sent'    → a repeat request returns the stored result and sends nothing;
--   * status 'failed'  → a retry is allowed and re-sends;
--   * status 'sending' → a parallel request gets "already being sent" (a stale claim older than
--                        two minutes can be taken over, so a crashed send can still be retried).
-- Only the API server (service_role) reads or writes this table.
-- Rollback: supabase/rollbacks/20261117121000_oc_signoff_notify_log_down.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.oc_signoff_notify_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  department text NOT NULL CHECK (department IN ('iev', 'maintenance', 'projects', 'rm', 'commercial')),
  oc_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('stage', 'created', 'oc_number', 'revision')),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  requested_by uuid,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oc_signoff_notify_log_oc
  ON public.oc_signoff_notify_log (department, oc_id, created_at DESC);

COMMENT ON TABLE public.oc_signoff_notify_log IS
  'PO At Glance sign-off email idempotency log. Written only by the API server (service_role).';

ALTER TABLE public.oc_signoff_notify_log ENABLE ROW LEVEL SECURITY;
-- No policies: app users (anon / authenticated) have no access at all.
REVOKE ALL ON public.oc_signoff_notify_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oc_signoff_notify_log TO service_role;

-- =============================================================================
-- PO At Glance — one email conversation per PO for IEV, Maintenance, R&M and Commercial,
-- the same way Projects already works (public.pj_oc_mail_thread, migration 20261106124500).
--
-- The first message's mailbox, subject and recipients are stored here and reused for every
-- later update on that PO (creation, stage sign-offs, OC Number, revisions), so they stay in
-- one thread. Rows are keyed by (department, oc_id): a PO in one department never shares a
-- thread with a PO in another department.
--
-- Projects keeps using public.pj_oc_mail_thread unchanged.
-- Only the API server (service_role) reads or writes this table.
-- Rollback: supabase/rollbacks/20261119160000_po_at_glance_dept_mail_thread_down.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.oc_mail_thread (
  department text NOT NULL CHECK (department IN ('iev', 'maintenance', 'rm', 'commercial')),
  oc_id uuid NOT NULL,
  mailbox text NOT NULL,
  latest_message_id text NOT NULL,
  conversation_id text,
  subject text NOT NULL,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department, oc_id)
);

COMMENT ON TABLE public.oc_mail_thread IS
  'PO At Glance email thread per (department, PO) for IEV / Maintenance / R&M / Commercial. Written only by the API server (service_role).';

ALTER TABLE public.oc_mail_thread ENABLE ROW LEVEL SECURITY;
-- No policies: app users (anon / authenticated) have no access at all.
REVOKE ALL ON TABLE public.oc_mail_thread FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oc_mail_thread TO service_role;

NOTIFY pgrst, 'reload schema';

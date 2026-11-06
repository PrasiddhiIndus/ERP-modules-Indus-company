-- Projects PO At Glance keeps one email conversation per PO.
-- The first message's subject and recipients are stored here and reused on every later update.

CREATE TABLE IF NOT EXISTS public.pj_oc_mail_thread (
  oc_id uuid PRIMARY KEY REFERENCES public.pj_oc_master(id) ON DELETE CASCADE,
  mailbox text NOT NULL,
  latest_message_id text NOT NULL,
  conversation_id text,
  subject text NOT NULL,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pj_oc_mail_thread ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pj_oc_mail_thread FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pj_oc_mail_thread TO service_role;

NOTIFY pgrst, 'reload schema';

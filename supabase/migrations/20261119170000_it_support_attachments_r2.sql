-- Align IT Support attachments with Cloudflare R2 metadata pattern
-- (same idea as software_subscription_invoice_files: file_path + storage='r2').

ALTER TABLE public.it_ticket_attachments
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS storage text;

UPDATE public.it_ticket_attachments
SET file_path = r2_key
WHERE file_path IS NULL
  AND r2_key IS NOT NULL
  AND btrim(r2_key) <> '';

UPDATE public.it_ticket_attachments
SET storage = 'r2'
WHERE storage IS NULL OR btrim(storage) = '';

ALTER TABLE public.it_ticket_attachments
  ALTER COLUMN storage SET DEFAULT 'r2';

-- Backfill any empty storage, then enforce check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'it_ticket_attachments_storage_check'
      AND conrelid = 'public.it_ticket_attachments'::regclass
  ) THEN
    ALTER TABLE public.it_ticket_attachments
      ADD CONSTRAINT it_ticket_attachments_storage_check
      CHECK (storage IN ('r2'));
  END IF;
END;
$$;

-- Prefer unique live object keys (R2 path)
CREATE UNIQUE INDEX IF NOT EXISTS uq_it_ticket_attachments_file_path_live
  ON public.it_ticket_attachments (file_path)
  WHERE deleted_at IS NULL AND file_path IS NOT NULL;

COMMENT ON TABLE public.it_ticket_attachments IS
  'IT Support attachments: Cloudflare R2 object key in file_path / r2_key, storage=r2.';

COMMENT ON COLUMN public.it_ticket_attachments.file_path IS
  'Cloudflare R2 object key (e.g. it-support/<ticket-id>/<ts>-name.png).';

COMMENT ON COLUMN public.it_ticket_attachments.storage IS
  'Always r2 for IT Support — files live in Cloudflare R2, not Supabase Storage.';

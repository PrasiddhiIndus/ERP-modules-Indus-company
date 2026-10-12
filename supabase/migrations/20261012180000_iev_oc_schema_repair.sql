-- IEV OC Creation: bring tables created by the first version of 20261012120000 up to date.
-- Run after 20261012120000, 20261012150000 and 20261012170000. Safe to run on a fresh database
-- (every step checks first) and safe to re-run.
--
-- The first version created oc_signoff with signed_on / signature_path (file upload) and oc_master with
-- a system-number format check on oc_no. Re-running the later version kept those tables as they were
-- (CREATE TABLE IF NOT EXISTS), so saving failed with: record "new" has no field "signed_at".

-- Sign-off: server-stamped date/time and signer.
ALTER TABLE public.oc_signoff ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE public.oc_signoff ADD COLUMN IF NOT EXISTS signed_user_id uuid;

-- Unsigned boxes are no row at all in the digital sign-off; old empty rows are removed and old
-- signatures keep their date. The stamp trigger is bypassed so this clean-up needs no signer.
ALTER TABLE public.oc_signoff DISABLE TRIGGER oc_signoff_stamp;
DELETE FROM public.oc_signoff WHERE signed_by IS NULL OR btrim(signed_by) = '';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oc_signoff' AND column_name = 'signed_on'
  ) THEN
    EXECUTE 'UPDATE public.oc_signoff SET signed_at = signed_on::timestamptz WHERE signed_at IS NULL AND signed_on IS NOT NULL';
    EXECUTE 'ALTER TABLE public.oc_signoff ALTER COLUMN signed_on DROP NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'oc_signoff' AND column_name = 'signature_path'
  ) THEN
    EXECUTE 'ALTER TABLE public.oc_signoff ALTER COLUMN signature_path DROP NOT NULL';
  END IF;
END $$;
UPDATE public.oc_signoff SET signed_at = now() WHERE signed_at IS NULL;
ALTER TABLE public.oc_signoff ENABLE TRIGGER oc_signoff_stamp;

ALTER TABLE public.oc_signoff ALTER COLUMN signed_at SET DEFAULT now();
ALTER TABLE public.oc_signoff ALTER COLUMN signed_at SET NOT NULL;
ALTER TABLE public.oc_signoff ALTER COLUMN signed_user_id SET DEFAULT auth.uid();
ALTER TABLE public.oc_signoff ALTER COLUMN signed_by SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.oc_signoff'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%btrim(signed_by)%'
  ) THEN
    ALTER TABLE public.oc_signoff ADD CONSTRAINT oc_signoff_signed_by_check CHECK (btrim(signed_by) <> '');
  END IF;
END $$;

-- OC No. is typed in by the user: drop the old system-number format check, keep "required, up to 80 characters".
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.oc_master'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%IFSPL-IEV-OCC%'
  LOOP
    EXECUTE format('ALTER TABLE public.oc_master DROP CONSTRAINT %I', c.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.oc_master'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%char_length(oc_no)%'
  ) THEN
    ALTER TABLE public.oc_master
      ADD CONSTRAINT oc_master_oc_no_manual_check CHECK (btrim(oc_no) <> '' AND char_length(oc_no) <= 80);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_master_oc_no ON public.oc_master (upper(btrim(oc_no)));

NOTIFY pgrst, 'reload schema';

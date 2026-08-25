-- ADD only: grouped contact people for Client Master.
-- Does not rename, drop, or change existing columns or rows.
-- Existing primary_contact_person / contact_number(s) / contact_email(s) stay as-is.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_clients'
      AND column_name = 'contact_persons'
  ) THEN
    ALTER TABLE public.marketing_clients ADD COLUMN contact_persons TEXT;
  END IF;
END $$;

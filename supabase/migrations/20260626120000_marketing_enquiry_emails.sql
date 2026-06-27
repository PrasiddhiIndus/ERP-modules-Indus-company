-- Secondary enquiry emails (internal reference); primary stays in contact_email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_enquiries'
      AND column_name = 'contact_emails'
  ) THEN
    ALTER TABLE public.marketing_enquiries ADD COLUMN contact_emails TEXT;
    COMMENT ON COLUMN public.marketing_enquiries.contact_emails IS
      'JSON array of secondary email addresses for internal reference (not shown on quotations).';
  END IF;
END $$;

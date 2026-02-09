-- Marketing Internal Quotation Schema Update
-- Run this SQL in your Supabase SQL Editor to add internal quotation fields

-- ============================================
-- ADD INTERNAL QUOTATION COLUMNS TO MARKETING_QUOTATIONS
-- ============================================
DO $$ 
BEGIN
    -- Add subject_title column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotations' 
        AND column_name = 'subject_title'
    ) THEN
        ALTER TABLE marketing_quotations 
        ADD COLUMN subject_title TEXT;
    END IF;

    -- Add subject column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotations' 
        AND column_name = 'subject'
    ) THEN
        ALTER TABLE marketing_quotations 
        ADD COLUMN subject TEXT;
    END IF;

    -- Add signed_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotations' 
        AND column_name = 'signed_by'
    ) THEN
        ALTER TABLE marketing_quotations 
        ADD COLUMN signed_by TEXT;
    END IF;

    -- Add signature_path column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotations' 
        AND column_name = 'signature_path'
    ) THEN
        ALTER TABLE marketing_quotations 
        ADD COLUMN signature_path TEXT;
    END IF;
END $$;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN marketing_quotations.subject_title IS 'Subject title/header for internal quotations';
COMMENT ON COLUMN marketing_quotations.subject IS 'Subject content/description for internal quotations';
COMMENT ON COLUMN marketing_quotations.signed_by IS 'Name of the person signing the internal quotation';
COMMENT ON COLUMN marketing_quotations.signature_path IS 'Path to the signature image file';


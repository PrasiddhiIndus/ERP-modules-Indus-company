-- Add address and multiple contact columns to marketing_clients table
-- Run this SQL in your Supabase SQL Editor

-- Add street_address column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_clients' AND column_name = 'street_address') THEN
    ALTER TABLE marketing_clients ADD COLUMN street_address TEXT;
  END IF;
END $$;

-- Add zip_code column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_clients' AND column_name = 'zip_code') THEN
    ALTER TABLE marketing_clients ADD COLUMN zip_code TEXT;
  END IF;
END $$;

-- Add contact_numbers column (store as JSONB for array support)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_clients' AND column_name = 'contact_numbers') THEN
    ALTER TABLE marketing_clients ADD COLUMN contact_numbers TEXT; -- Stored as JSON string
  END IF;
END $$;

-- Add contact_emails column (store as JSONB for array support)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_clients' AND column_name = 'contact_emails') THEN
    ALTER TABLE marketing_clients ADD COLUMN contact_emails TEXT; -- Stored as JSON string
  END IF;
END $$;


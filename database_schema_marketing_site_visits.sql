-- SQL Script for marketing_site_visits table
-- This script will add missing columns if the table already exists
-- Or create the table if it doesn't exist

-- First, check if table exists and create it if it doesn't
CREATE TABLE IF NOT EXISTS marketing_site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_names TEXT,
  visitor_name TEXT,
  company_name TEXT,
  client_name TEXT,
  designation TEXT,
  site_location TEXT,
  mobile_number TEXT,
  email_id TEXT,
  product_interest TEXT,
  discussion_note TEXT,
  visit_date DATE,
  purpose_of_visit TEXT,
  travel_expenses DECIMAL(10,2) DEFAULT 0,
  food_expenses DECIMAL(10,2) DEFAULT 0,
  accommodation DECIMAL(10,2) DEFAULT 0,
  other_expenses DECIMAL(10,2) DEFAULT 0,
  total_expense DECIMAL(10,2) DEFAULT 0,
  approved_amount DECIMAL(10,2),
  status TEXT DEFAULT 'Pending Paid',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add missing columns if they don't exist (for existing tables)
DO $$ 
BEGIN
  -- Add executive_names if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'executive_names') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN executive_names TEXT;
  END IF;

  -- Add visitor_name if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'visitor_name') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN visitor_name TEXT;
  END IF;

  -- Add company_name if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'company_name') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN company_name TEXT;
  END IF;

  -- Add client_name if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'client_name') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN client_name TEXT;
  END IF;

  -- Add designation if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'designation') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN designation TEXT;
  END IF;

  -- Add site_location if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'site_location') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN site_location TEXT;
  END IF;

  -- Add mobile_number if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'mobile_number') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN mobile_number TEXT;
  END IF;

  -- Add email_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'email_id') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN email_id TEXT;
  END IF;

  -- Add product_interest if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'product_interest') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN product_interest TEXT;
  END IF;

  -- Add discussion_note if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'discussion_note') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN discussion_note TEXT;
  END IF;

  -- Add visit_date if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'visit_date') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN visit_date DATE;
  END IF;

  -- Add purpose_of_visit if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'purpose_of_visit') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN purpose_of_visit TEXT;
  END IF;

  -- Add travel_expenses if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'travel_expenses') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN travel_expenses DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add food_expenses if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'food_expenses') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN food_expenses DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add accommodation if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'accommodation') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN accommodation DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add other_expenses if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'other_expenses') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN other_expenses DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add total_expense if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'total_expense') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN total_expense DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add approved_amount if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'approved_amount') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN approved_amount DECIMAL(10,2);
  END IF;

  -- Add status if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'status') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN status TEXT DEFAULT 'Pending Paid';
  END IF;

  -- Add created_by if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'created_by') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;

  -- Add created_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'created_at') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
  END IF;

  -- Add updated_by if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'updated_by') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  END IF;

  -- Add updated_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'marketing_site_visits' AND column_name = 'updated_at') THEN
    ALTER TABLE marketing_site_visits ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;

END $$;

-- Create index on visit_date for better query performance
CREATE INDEX IF NOT EXISTS idx_marketing_site_visits_visit_date ON marketing_site_visits(visit_date);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_marketing_site_visits_status ON marketing_site_visits(status);

-- Create index on client_name for searching
CREATE INDEX IF NOT EXISTS idx_marketing_site_visits_client_name ON marketing_site_visits(client_name);


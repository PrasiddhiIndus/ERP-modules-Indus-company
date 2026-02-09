-- Marketing Quotation Revisions Database Schema
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- QUOTATION REVISIONS HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS marketing_quotation_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID REFERENCES marketing_quotations(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    revision_date DATE NOT NULL DEFAULT CURRENT_DATE,
    remarks TEXT,
    changes_summary TEXT, -- Summary of what changed in this revision
    status TEXT DEFAULT 'Pending', -- Pending, Completed, Overdue
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- ADD MISSING COLUMNS IF TABLE ALREADY EXISTS
-- ============================================
DO $$ 
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotation_revisions' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE marketing_quotation_revisions 
        ADD COLUMN status TEXT DEFAULT 'Pending';
    END IF;
    
    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotation_revisions' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE marketing_quotation_revisions 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Add updated_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotation_revisions' 
        AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE marketing_quotation_revisions 
        ADD COLUMN updated_by UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_quotation_revisions_quotation_id ON marketing_quotation_revisions(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_revisions_date ON marketing_quotation_revisions(revision_date);
CREATE INDEX IF NOT EXISTS idx_quotation_revisions_number ON marketing_quotation_revisions(quotation_id, revision_number);

-- Create status index only if status column exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketing_quotation_revisions' 
        AND column_name = 'status'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_quotation_revisions_status ON marketing_quotation_revisions(status);
    END IF;
END $$;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE marketing_quotation_revisions ENABLE ROW LEVEL SECURITY;

-- Policies for marketing_quotation_revisions
DROP POLICY IF EXISTS "Users can view all quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can view all quotation revisions"
    ON marketing_quotation_revisions FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can insert quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can insert quotation revisions"
    ON marketing_quotation_revisions FOR INSERT
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can update quotation revisions"
    ON marketing_quotation_revisions FOR UPDATE
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete quotation revisions" ON marketing_quotation_revisions;
CREATE POLICY "Users can delete quotation revisions"
    ON marketing_quotation_revisions FOR DELETE
    USING (true);


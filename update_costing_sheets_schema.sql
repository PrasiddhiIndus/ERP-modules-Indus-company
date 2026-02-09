-- Migration: Add costing_data JSONB column to marketing_costing_sheets table
-- This allows storing Excel-like costing sheet data with multiple items and cost heads

-- Add costing_data column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'marketing_costing_sheets' 
        AND column_name = 'costing_data'
    ) THEN
        ALTER TABLE marketing_costing_sheets 
        ADD COLUMN costing_data JSONB;
        
        -- Add comment
        COMMENT ON COLUMN marketing_costing_sheets.costing_data IS 'Stores Excel-like costing sheet data with items (columns) and cost heads (rows)';
    END IF;
END $$;


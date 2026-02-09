-- Marketing Expo/Seminar Cost Sheet Schema Update
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- ADD COST_SHEET_DATA COLUMN TO marketing_expo_seminars
-- ============================================

-- Add cost_sheet_data column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_attribute 
        WHERE attrelid = 'marketing_expo_seminars'::regclass 
        AND attname = 'cost_sheet_data'
    ) THEN
        ALTER TABLE marketing_expo_seminars 
        ADD COLUMN cost_sheet_data JSONB;
    END IF;
END $$;

-- Add comment to the column
COMMENT ON COLUMN marketing_expo_seminars.cost_sheet_data IS 'Stores cost sheet data including items, images, and total amount in JSON format';

-- ============================================
-- STORAGE BUCKET SETUP INSTRUCTIONS
-- ============================================
-- IMPORTANT: You need to create the storage bucket manually in Supabase Dashboard
-- 
-- Steps to create the bucket:
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Bucket name: "marketing-documents"
-- 4. Make it PUBLIC (or configure RLS policies)
-- 5. Click "Create bucket"
--
-- ============================================
-- STORAGE POLICIES SETUP (Step-by-Step)
-- ============================================
-- After creating the bucket, you need to create 3 policies:
-- Go to: Storage > marketing-documents > Policies > "New Policy"
--
-- IF YOU GET "Policy already exists" ERROR:
-- ============================================
-- Option 1: Delete existing policy and recreate
--   1. Go to Storage > marketing-documents > Policies
--   2. Find the existing policy (e.g., "Allow authenticated uploads homjf5_0")
--   3. Click the "..." menu next to it > "Delete"
--   4. Confirm deletion
--   5. Create new policy with instructions below
--
-- Option 2: Edit existing policy
--   1. Go to Storage > marketing-documents > Policies
--   2. Click on the existing policy name to edit it
--   3. Make sure INSERT checkbox is checked
--   4. Verify Target roles is "authenticated"
--   5. Verify Policy definition: bucket_id = 'marketing-documents'
--   6. Click "Save"
--
-- Option 3: Use different policy name
--   - Use a unique name like: "Allow authenticated uploads v2"
--   - Or: "Marketing documents upload policy"
--
-- POLICY 1: INSERT (Upload) Policy
-- ============================================
-- 1. Policy name: "Allow authenticated uploads" (or unique name if exists)
-- 2. Allowed operation: CHECK "INSERT" checkbox
--    - This will highlight the "upload" button in green
-- 3. Target roles: Select "authenticated" from dropdown
-- 4. Policy definition (USING expression): 
--    bucket_id = 'marketing-documents'
-- 5. Policy definition (WITH CHECK expression):
--    bucket_id = 'marketing-documents'
-- 6. Click "Review" then "Save policy"
--
-- POLICY 2: SELECT (Read/Download) Policy
-- ============================================
-- 1. Policy name: "Allow authenticated reads" (or unique name if exists)
-- 2. Allowed operation: CHECK "SELECT" checkbox
--    - This will highlight "download", "list", "getPublicUrl" buttons
-- 3. Target roles: Select "authenticated" from dropdown
-- 4. Policy definition (USING expression):
--    bucket_id = 'marketing-documents'
-- 5. Click "Review" then "Save policy"
--
-- POLICY 3: DELETE Policy
-- ============================================
-- 1. Policy name: "Allow authenticated deletes" (or unique name if exists)
-- 2. Allowed operation: CHECK "DELETE" checkbox
--    - This will highlight the "remove" button in green
-- 3. Target roles: Select "authenticated" from dropdown
-- 4. Policy definition (USING expression):
--    bucket_id = 'marketing-documents'
-- 5. Click "Review" then "Save policy"
--
-- ALTERNATIVE: Single Combined Policy (Recommended)
-- ============================================
-- Instead of 3 separate policies, create ONE policy with all operations:
-- 1. Policy name: "Marketing documents full access"
-- 2. Allowed operation: CHECK ALL THREE:
--    ✓ SELECT
--    ✓ INSERT  
--    ✓ DELETE
-- 3. Target roles: Select "authenticated" from dropdown
-- 4. Policy definition (USING expression):
--    bucket_id = 'marketing-documents'
-- 5. Policy definition (WITH CHECK expression):
--    bucket_id = 'marketing-documents'
-- 6. Click "Review" then "Save policy"
--
-- IMPORTANT NOTES:
-- - Make sure to check the INSERT checkbox for uploads to work
-- - The bucket_id must match exactly: 'marketing-documents'
-- - Target roles should be "authenticated" (not "public" or "anon")
-- - If policy exists, either delete it first or use a different name
-- - You can check existing policies in: Storage > marketing-documents > Policies


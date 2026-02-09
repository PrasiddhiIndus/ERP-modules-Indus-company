-- Fix RLS Policy for costing_accessories table
-- This allows authenticated users to insert, update, and delete costing accessories

-- Ensure user_id column exists
ALTER TABLE costing_accessories ADD COLUMN IF NOT EXISTS user_id uuid references auth.users(id);
CREATE INDEX IF NOT EXISTS idx_costing_accessories_user_id ON costing_accessories(user_id);

-- Enable Row Level Security
ALTER TABLE costing_accessories ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own costing accessories" ON costing_accessories;
DROP POLICY IF EXISTS "Users can insert their own costing accessories" ON costing_accessories;
DROP POLICY IF EXISTS "Users can update their own costing accessories" ON costing_accessories;
DROP POLICY IF EXISTS "Users can delete their own costing accessories" ON costing_accessories;
DROP POLICY IF EXISTS "Authenticated users can view costing accessories" ON costing_accessories;
DROP POLICY IF EXISTS "Authenticated users can insert costing accessories" ON costing_accessories;
DROP POLICY IF EXISTS "Authenticated users can update costing accessories" ON costing_accessories;
DROP POLICY IF EXISTS "Authenticated users can delete costing accessories" ON costing_accessories;

-- Create new flexible policies that allow authenticated users to work with costing accessories
CREATE POLICY "Authenticated users can view costing accessories"
    ON costing_accessories FOR SELECT
    TO authenticated
    USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert costing accessories"
    ON costing_accessories FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update costing accessories"
    ON costing_accessories FOR UPDATE
    TO authenticated
    USING (user_id IS NULL OR auth.uid() = user_id)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can delete costing accessories"
    ON costing_accessories FOR DELETE
    TO authenticated
    USING (user_id IS NULL OR auth.uid() = user_id);

-- Verify the policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'costing_accessories'
ORDER BY policyname;


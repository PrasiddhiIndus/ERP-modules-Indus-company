-- Create Storage Bucket for Quotation Signatures
-- Run this SQL in your Supabase SQL Editor to create the storage bucket

-- ============================================
-- CREATE STORAGE BUCKET FOR QUOTATION SIGNATURES
-- ============================================

-- Note: Storage buckets are created via the Supabase Dashboard or Storage API
-- This SQL file provides instructions and RLS policies

-- ============================================
-- INSTRUCTIONS:
-- ============================================
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New bucket"
-- 3. Name: "quotation-signatures"
-- 4. Public: Yes (recommended for easier access) OR No (if you prefer private with RLS)
-- 5. File size limit: 5 MB (recommended)
-- 6. Allowed MIME types: image/* (or specific: image/png, image/jpeg, image/jpg)

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- If bucket is private, add these policies:

-- Allow authenticated users to upload signatures
-- CREATE POLICY "Allow authenticated uploads"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'quotation-signatures');

-- Allow authenticated users to read signatures
-- CREATE POLICY "Allow authenticated reads"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'quotation-signatures');

-- Allow authenticated users to update their signatures
-- CREATE POLICY "Allow authenticated updates"
-- ON storage.objects FOR UPDATE
-- TO authenticated
-- USING (bucket_id = 'quotation-signatures');

-- Allow authenticated users to delete signatures
-- CREATE POLICY "Allow authenticated deletes"
-- ON storage.objects FOR DELETE
-- TO authenticated
-- USING (bucket_id = 'quotation-signatures');

-- ============================================
-- ALTERNATIVE: Use existing bucket
-- ============================================
-- If you prefer to use an existing bucket like "marketing-documents",
-- update the bucket name in InternalQuotationFormModal.jsx:
-- Change: .from('quotation-signatures')
-- To: .from('marketing-documents')
-- And update the file path to: 'quotation-signatures/{fileName}'


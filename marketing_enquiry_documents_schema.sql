-- Enquiry Master: documents & images table and storage
-- Run this in Supabase SQL Editor so uploaded files show in Edit and View.

-- ============================================
-- 1. TABLE: marketing_enquiry_documents
-- ============================================
CREATE TABLE IF NOT EXISTS public.marketing_enquiry_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.marketing_enquiries(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- If table already exists but missing created_at (older installs), add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_enquiry_documents'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.marketing_enquiry_documents
      ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_marketing_enquiry_documents_enquiry_id
  ON public.marketing_enquiry_documents(enquiry_id);

-- RLS: allow authenticated users to read and insert
ALTER TABLE public.marketing_enquiry_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read marketing_enquiry_documents" ON public.marketing_enquiry_documents;
CREATE POLICY "Allow read marketing_enquiry_documents"
  ON public.marketing_enquiry_documents FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow insert marketing_enquiry_documents" ON public.marketing_enquiry_documents;
CREATE POLICY "Allow insert marketing_enquiry_documents"
  ON public.marketing_enquiry_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete marketing_enquiry_documents" ON public.marketing_enquiry_documents;
CREATE POLICY "Allow delete marketing_enquiry_documents"
  ON public.marketing_enquiry_documents FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- 2. STORAGE BUCKET (create in Dashboard first)
-- ============================================
-- Dashboard > Storage > New bucket > Name: marketing-documents (hyphen!)
-- Public: Yes (so View/Edit can show images and files without signed URLs)
-- ============================================
-- 3. STORAGE POLICIES (run after bucket "marketing-documents" exists)
-- ============================================
DROP POLICY IF EXISTS "Allow authenticated upload marketing-documents" ON storage.objects;
CREATE POLICY "Allow authenticated upload marketing-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-documents');

DROP POLICY IF EXISTS "Allow authenticated read marketing-documents" ON storage.objects;
CREATE POLICY "Allow authenticated read marketing-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-documents');

-- Allow authenticated users to delete (so Enquiry Master can remove documents)
DROP POLICY IF EXISTS "Allow authenticated delete marketing-documents" ON storage.objects;
CREATE POLICY "Allow authenticated delete marketing-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-documents');

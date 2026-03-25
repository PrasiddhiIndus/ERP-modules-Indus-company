-- Assigned To: support single + multiple users and custom names.
-- Run this in Supabase SQL Editor for Enquiry Master "Assigned To" (multiple + add name).

-- 1. Single custom name (existing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_enquiries' AND column_name = 'assigned_to_name'
  ) THEN
    ALTER TABLE public.marketing_enquiries ADD COLUMN assigned_to_name TEXT;
  END IF;
END $$;

-- 2. Multiple user IDs (JSONB array of UUIDs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_enquiries' AND column_name = 'assigned_to_ids'
  ) THEN
    ALTER TABLE public.marketing_enquiries ADD COLUMN assigned_to_ids JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN public.marketing_enquiries.assigned_to_ids IS 'Array of user IDs (from profiles) assigned to this enquiry.';
  END IF;
END $$;

-- 3. Multiple custom names (JSONB array of text)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_enquiries' AND column_name = 'assigned_to_custom_names'
  ) THEN
    ALTER TABLE public.marketing_enquiries ADD COLUMN assigned_to_custom_names JSONB DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN public.marketing_enquiries.assigned_to_custom_names IS 'Array of custom assignee names (not system users).';
  END IF;
END $$;

-- Backfill from existing single assigned_to / assigned_to_name (optional)
UPDATE public.marketing_enquiries
SET
  assigned_to_ids = CASE
    WHEN assigned_to IS NOT NULL AND (assigned_to_ids IS NULL OR assigned_to_ids = '[]'::jsonb)
    THEN jsonb_build_array(assigned_to::text)
    ELSE COALESCE(assigned_to_ids, '[]'::jsonb)
  END,
  assigned_to_custom_names = CASE
    WHEN assigned_to_name IS NOT NULL AND assigned_to_name <> '' AND (assigned_to_custom_names IS NULL OR assigned_to_custom_names = '[]'::jsonb)
    THEN jsonb_build_array(assigned_to_name)
    ELSE COALESCE(assigned_to_custom_names, '[]'::jsonb)
  END
WHERE assigned_to IS NOT NULL OR (assigned_to_name IS NOT NULL AND assigned_to_name <> '');

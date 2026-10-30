-- Working cost sheet chosen on an enquiry: domestic or international procurement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_enquiries'
      AND column_name = 'cost_sheet_type'
  ) THEN
    ALTER TABLE public.marketing_enquiries
      ADD COLUMN cost_sheet_type TEXT;

    COMMENT ON COLUMN public.marketing_enquiries.cost_sheet_type IS
      'Working cost sheet for this enquiry: domestic or international.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_enquiries_cost_sheet_type_check'
  ) THEN
    ALTER TABLE public.marketing_enquiries
      ADD CONSTRAINT marketing_enquiries_cost_sheet_type_check
      CHECK (cost_sheet_type IS NULL OR cost_sheet_type IN ('domestic', 'international'));
  END IF;
END $$;

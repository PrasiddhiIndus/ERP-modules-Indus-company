-- Manual business category typed on a marketing purchase order.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_contracts'
      AND column_name = 'business_category'
  ) THEN
    ALTER TABLE public.marketing_contracts
      ADD COLUMN business_category TEXT;

    COMMENT ON COLUMN public.marketing_contracts.business_category IS
      'Business category entered by hand when the purchase order is saved.';
  END IF;
END $$;

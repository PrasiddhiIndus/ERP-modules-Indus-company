-- Annexure line description on marketing quotations (internal quotation PDF / form)
ALTER TABLE public.marketing_quotations
  ADD COLUMN IF NOT EXISTS annexure_description TEXT;

COMMENT ON COLUMN public.marketing_quotations.annexure_description IS
  'Annexure line description for internal quotation (from Annexure mail template or manual entry)';

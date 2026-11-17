ALTER TABLE public.tenders DROP COLUMN IF EXISTS tender_documents;
ALTER TABLE public.costing_rows DROP COLUMN IF EXISTS sort_order;
ALTER TABLE public.costing_rows DROP COLUMN IF EXISTS include_in_summary;

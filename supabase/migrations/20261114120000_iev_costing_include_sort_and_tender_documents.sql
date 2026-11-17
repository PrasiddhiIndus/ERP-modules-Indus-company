-- IEV costing: include/exclude lines in summary + display order; tender multi-docs (R2 keys in jsonb).

ALTER TABLE public.costing_rows
  ADD COLUMN IF NOT EXISTS include_in_summary boolean NOT NULL DEFAULT true;

ALTER TABLE public.costing_rows
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.costing_rows.include_in_summary IS
  'When false, this line is excluded from fabrication/chassis totals that feed Costing Summary / quotation.';

COMMENT ON COLUMN public.costing_rows.sort_order IS
  'Display order of main cost components on the costing sheet (lower first).';

ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS tender_documents jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tenders.tender_documents IS
  'Array of { name, object_key, uploaded_at } for Cloudflare R2 files under fire-tender/tenders/{id}/.';

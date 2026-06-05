-- NET TOTAL remarks per line item
ALTER TABLE public.costing_summary
  ADD COLUMN IF NOT EXISTS remark text;

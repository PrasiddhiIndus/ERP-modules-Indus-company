-- Optional CTC voucher amount (display-only). Never included in CTC / gross / net.
ALTER TABLE public.admin_salary_structures
  ADD COLUMN IF NOT EXISTS generate_voucher boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voucher_amount numeric(14,2);

COMMENT ON COLUMN public.admin_salary_structures.generate_voucher IS
  'When true, voucher_amount is shown on salary process / slip; not part of CTC totals.';
COMMENT ON COLUMN public.admin_salary_structures.voucher_amount IS
  'Standalone voucher amount from CTC. Excluded from CTC, gross, deductions and net.';

ALTER TABLE public.admin_salary_structure_revisions
  ADD COLUMN IF NOT EXISTS generate_voucher boolean,
  ADD COLUMN IF NOT EXISTS voucher_amount numeric(14,2);

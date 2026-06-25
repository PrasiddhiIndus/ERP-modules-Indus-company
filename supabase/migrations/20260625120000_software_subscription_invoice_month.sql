-- Month label for software subscription invoice files (YYYY-MM).

alter table public.software_subscription_invoice_files
  add column if not exists invoice_month text;

create index if not exists software_subscription_invoice_files_month_idx
  on public.software_subscription_invoice_files (software_subscription_id, invoice_month);

comment on column public.software_subscription_invoice_files.invoice_month is
  'Billing month for the invoice document (YYYY-MM).';

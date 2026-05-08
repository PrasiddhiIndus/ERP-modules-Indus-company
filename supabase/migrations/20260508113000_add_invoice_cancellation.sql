-- Add invoice cancellation tracking (keep proof; no deletes).
-- This keeps invoice numbers reserved so the INV-* series always continues.

alter table if exists billing.invoice
  add column if not exists is_cancelled boolean not null default false;

alter table if exists billing.invoice
  add column if not exists cancelled_at timestamptz;

alter table if exists billing.invoice
  add column if not exists cancel_reason text;

create index if not exists invoice_is_cancelled_idx
  on billing.invoice (is_cancelled);


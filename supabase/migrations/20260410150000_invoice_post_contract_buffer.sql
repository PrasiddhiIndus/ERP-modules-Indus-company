-- Tag tax invoices raised in the post–contract-end buffer (before renewal is approved).
-- Used to roll PO/WO number + billing duration to the renewed cycle on Commercial renewal approval.
ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS is_post_contract_buffer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN billing.invoice.is_post_contract_buffer IS 'True: invoice was raised while post-contract billing was approved; PO/WO header may be updated when renewal is approved.';

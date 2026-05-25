ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS digital_signature_data_url text;

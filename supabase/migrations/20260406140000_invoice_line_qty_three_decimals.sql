-- Allow up to 3 decimal places on invoice line qty (e.g. monthly manpower duty-derived qty)
ALTER TABLE billing.invoice_line_item
  ALTER COLUMN quantity TYPE numeric(18,3);

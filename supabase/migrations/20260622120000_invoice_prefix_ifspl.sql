-- Tax invoice series prefix: INV-YYYY-#### → IFSPL-YYYY-#### (format unchanged except prefix).
UPDATE billing.invoice
SET tax_invoice_number = regexp_replace(tax_invoice_number, '^INV-', 'IFSPL-', 'i')
WHERE tax_invoice_number ~* '^INV-';

-- Credit/debit note document numbers: CN-INV- / DN-INV- → CN-IFSPL- / DN-IFSPL-.
UPDATE billing.credit_debit_note
SET note_tax_invoice_number = regexp_replace(note_tax_invoice_number, '-INV-', '-IFSPL-', 'gi')
WHERE note_tax_invoice_number ~* '-INV-';

-- Parent tax invoice reference on notes.
UPDATE billing.credit_debit_note
SET parent_tax_invoice_number = regexp_replace(parent_tax_invoice_number, '^INV-', 'IFSPL-', 'i')
WHERE parent_tax_invoice_number ~* '^INV-';

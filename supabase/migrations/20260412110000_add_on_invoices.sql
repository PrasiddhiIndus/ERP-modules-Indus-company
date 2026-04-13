-- Add-on invoices: stored in main invoice table + dedicated add_on_invoice table.
ALTER TABLE billing.invoice
  ADD COLUMN IF NOT EXISTS is_add_on boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS add_on_type text;

CREATE TABLE IF NOT EXISTS billing.add_on_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES billing.invoice(id) ON DELETE CASCADE,
  po_id uuid REFERENCES billing.po_wo(id) ON DELETE SET NULL,
  oc_number text,
  client_name text,
  location_name text,
  add_on_type text NOT NULL,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_add_on_invoice_invoice_id ON billing.add_on_invoice(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_add_on_invoice_oc_number ON billing.add_on_invoice(oc_number);

ALTER TABLE billing.add_on_invoice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_access_add_on_invoice" ON billing.add_on_invoice;
CREATE POLICY "billing_access_add_on_invoice"
  ON billing.add_on_invoice FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'billing')
    )
    OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'billing')
    )
    OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

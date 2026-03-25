-- =============================================================================
-- BILLING MODULE: All tables in BILLING schema (billing.po_wo, billing.invoice, etc.)
-- App hits via: supabase.schema('billing').from('po_wo') – same pattern as other modules.
-- In Supabase Dashboard → Settings → API → Exposed schemas, add: billing
-- If you see "new row violates row-level security", run the CREATE OR REPLACE FUNCTION
-- billing.current_user_has_billing_access() block in SQL Editor to refresh it.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS billing;

-- Helper: current user has billing or admin access (used in RLS)
-- Allow when: profile has role admin/billing, team=billing, or allowed_modules contains billing.
-- Allow when: no profile row or profile with null role/team (so billing works before/without profile setup).
CREATE OR REPLACE FUNCTION billing.current_user_has_billing_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.role = 'admin' OR p.role = 'billing' OR p.team = 'billing'
           OR (p.allowed_modules IS NOT NULL AND p.allowed_modules @> '"billing"'::jsonb))
  ) INTO has_access;
  IF has_access THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IS NULL AND p.team IS NULL
      AND (p.allowed_modules IS NULL OR p.allowed_modules = '[]'::jsonb)
  ) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION billing.current_user_has_billing_access() IS
  'Returns true if current user has billing access (role/team/allowed_modules), or no profile / unset profile. Used by RLS on billing.* tables.';

GRANT EXECUTE ON FUNCTION billing.current_user_has_billing_access() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1. PO/WO (billing.po_wo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.po_wo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL DEFAULT '',
  location_name text,
  legal_name text NOT NULL DEFAULT '',
  billing_address text,
  gstin text,
  current_coordinator text,
  contact_number text,
  oc_number text,
  oc_series text,
  vertical text DEFAULT 'BILL',
  po_wo_number text,
  po_quantity numeric(18,2) DEFAULT 0,
  total_contract_value numeric(18,2) DEFAULT 0,
  sac_code text DEFAULT '9985',
  hsn_code text,
  service_description text,
  start_date date,
  end_date date,
  billing_type text DEFAULT 'Monthly',
  billing_cycle integer DEFAULT 30,
  payment_terms text,
  revised_po boolean DEFAULT false,
  renewal_pending boolean DEFAULT false,
  status text DEFAULT 'active',
  approval_status text DEFAULT 'draft',
  approval_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_po_wo_oc_number ON billing.po_wo(oc_number);
CREATE INDEX IF NOT EXISTS idx_billing_po_wo_status ON billing.po_wo(status);
CREATE INDEX IF NOT EXISTS idx_billing_po_wo_approval_status ON billing.po_wo(approval_status);

COMMENT ON TABLE billing.po_wo IS 'PO/WO Management – contract master for Billing.';

-- -----------------------------------------------------------------------------
-- 2. PO Rate Category (billing.po_rate_category)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.po_rate_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES billing.po_wo(id) ON DELETE CASCADE,
  description text NOT NULL,
  rate numeric(18,2) NOT NULL DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_po_rate_category_po_id ON billing.po_rate_category(po_id);

-- -----------------------------------------------------------------------------
-- 3. Contact Log (billing.po_contact_log)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.po_contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES billing.po_wo(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_number text,
  from_date date,
  to_date date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_po_contact_log_po_id ON billing.po_contact_log(po_id);

-- -----------------------------------------------------------------------------
-- 4. Invoice (billing.invoice)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES billing.po_wo(id) ON DELETE SET NULL,
  site_id text,
  tax_invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  client_legal_name text,
  client_address text,
  gstin text,
  oc_number text,
  po_wo_number text,
  billing_type text DEFAULT 'Monthly',
  hsn_sac text,
  taxable_value numeric(18,2) DEFAULT 0,
  cgst_rate numeric(5,2) DEFAULT 9,
  sgst_rate numeric(5,2) DEFAULT 9,
  cgst_amt numeric(18,2) DEFAULT 0,
  sgst_amt numeric(18,2) DEFAULT 0,
  calculated_invoice_amount numeric(18,2) DEFAULT 0,
  total_amount numeric(18,2) DEFAULT 0,
  pa_status text DEFAULT 'Pending',
  payment_status boolean DEFAULT false,
  pending_amount numeric(18,2),
  payment_terms text,
  e_invoice_irn text,
  e_invoice_ack_no text,
  e_invoice_ack_dt text,
  e_invoice_signed_qr text,
  less_more_billing numeric(18,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_invoice_tax_number ON billing.invoice(tax_invoice_number);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_po_id ON billing.invoice(po_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_date ON billing.invoice(invoice_date);

-- -----------------------------------------------------------------------------
-- 5. Invoice Line Item (billing.invoice_line_item)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.invoice_line_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES billing.invoice(id) ON DELETE CASCADE,
  line_order integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  hsn_sac text,
  quantity numeric(18,2) NOT NULL DEFAULT 0,
  rate numeric(18,2) NOT NULL DEFAULT 0,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_line_item_invoice_id ON billing.invoice_line_item(invoice_id);

-- -----------------------------------------------------------------------------
-- 6. Invoice Attachment (billing.invoice_attachment)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.invoice_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES billing.invoice(id) ON DELETE CASCADE,
  attachment_type text NOT NULL,
  name text,
  url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_attachment_invoice_id ON billing.invoice_attachment(invoice_id);

-- -----------------------------------------------------------------------------
-- 7. Credit / Debit Note (billing.credit_debit_note)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.credit_debit_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_invoice_id uuid REFERENCES billing.invoice(id) ON DELETE SET NULL,
  parent_tax_invoice_number text,
  note_type text NOT NULL CHECK (note_type IN ('credit', 'debit')),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  reason text,
  e_invoice_irn text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_credit_debit_note_parent ON billing.credit_debit_note(parent_invoice_id);

-- -----------------------------------------------------------------------------
-- 8. Payment Advice (billing.payment_advice)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.payment_advice (
  invoice_id uuid PRIMARY KEY REFERENCES billing.invoice(id) ON DELETE CASCADE,
  pa_received_date date,
  pa_file_url text,
  penalty_deduction_amount numeric(18,2) DEFAULT 0,
  deduction_remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_po_wo_updated_at ON billing.po_wo;
CREATE TRIGGER billing_po_wo_updated_at
  BEFORE UPDATE ON billing.po_wo
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

DROP TRIGGER IF EXISTS billing_invoice_updated_at ON billing.invoice;
CREATE TRIGGER billing_invoice_updated_at
  BEFORE UPDATE ON billing.invoice
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

DROP TRIGGER IF EXISTS billing_payment_advice_updated_at ON billing.payment_advice;
CREATE TRIGGER billing_payment_advice_updated_at
  BEFORE UPDATE ON billing.payment_advice
  FOR EACH ROW EXECUTE FUNCTION billing.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY – only users with billing access (or no/unset profile)
-- =============================================================================

ALTER TABLE billing.po_wo ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.po_rate_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.po_contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.invoice_line_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.invoice_attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.credit_debit_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.payment_advice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_access_po_wo" ON billing.po_wo;
CREATE POLICY "billing_access_po_wo"
  ON billing.po_wo FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS "billing_access_po_rate_category" ON billing.po_rate_category;
CREATE POLICY "billing_access_po_rate_category"
  ON billing.po_rate_category FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS "billing_access_po_contact_log" ON billing.po_contact_log;
CREATE POLICY "billing_access_po_contact_log"
  ON billing.po_contact_log FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS "billing_access_invoice" ON billing.invoice;
CREATE POLICY "billing_access_invoice"
  ON billing.invoice FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS "billing_access_invoice_line_item" ON billing.invoice_line_item;
CREATE POLICY "billing_access_invoice_line_item"
  ON billing.invoice_line_item FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

CREATE POLICY "billing_access_invoice_attachment"
  ON billing.invoice_attachment FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS "billing_access_credit_debit_note" ON billing.credit_debit_note;
CREATE POLICY "billing_access_credit_debit_note"
  ON billing.credit_debit_note FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS "billing_access_payment_advice" ON billing.payment_advice;
CREATE POLICY "billing_access_payment_advice"
  ON billing.payment_advice FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

-- Grants so authenticated role can use billing schema (RLS still applies)
GRANT USAGE ON SCHEMA billing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA billing TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

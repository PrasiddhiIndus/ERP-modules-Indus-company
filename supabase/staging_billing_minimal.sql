-- =============================================================================
-- STAGING — billing schema (fixes po_wo HTTP 406 "Invalid schema: billing")
-- PROJECT: xjzhlbpgnpcmbdlufhwo ONLY
--
-- AFTER running this SQL:
--   Dashboard → Project Settings → API → Exposed schemas → add: billing
--   (Required — PostgREST cannot serve billing.* without this.)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS billing;

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
      AND (
        p.role IN ('admin', 'billing', 'super_admin', 'super_admin_pro')
        OR p.team = 'billing'
        OR (p.allowed_modules IS NOT NULL AND p.allowed_modules @> '"billing"'::jsonb)
      )
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

GRANT EXECUTE ON FUNCTION billing.current_user_has_billing_access() TO authenticated;

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
  vertical text DEFAULT 'MANP',
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

CREATE TABLE IF NOT EXISTS billing.po_rate_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES billing.po_wo(id) ON DELETE CASCADE,
  description text NOT NULL,
  rate numeric(18,2) NOT NULL DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.po_contact_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES billing.po_wo(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_number text,
  from_date date,
  to_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE billing.po_wo ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.po_rate_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.po_contact_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_access_po_wo ON billing.po_wo;
CREATE POLICY billing_access_po_wo ON billing.po_wo FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS billing_access_po_rate_category ON billing.po_rate_category;
CREATE POLICY billing_access_po_rate_category ON billing.po_rate_category FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS billing_access_po_contact_log ON billing.po_contact_log;
CREATE POLICY billing_access_po_contact_log ON billing.po_contact_log FOR ALL TO authenticated
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

GRANT USAGE ON SCHEMA billing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA billing TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'billing.po_wo exists' AS check_name,
  CASE WHEN to_regclass('billing.po_wo') IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status;

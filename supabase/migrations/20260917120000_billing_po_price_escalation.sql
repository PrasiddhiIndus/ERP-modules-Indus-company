-- =============================================================================
-- Commercial Manpower / Training: PO Effective Date + price escalation schedule
--
-- Additive columns on billing.po_wo. Existing POs keep null/false and behave
-- exactly as before (client identity path when price_escalation_enabled is false).
-- Schedule is jsonb for atomic save with the existing PO upsert path.
-- Immutable audit snapshots are also appended to update_history by the app.
-- =============================================================================

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS po_effective_date date;

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS price_escalation_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS price_escalation_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN billing.po_wo.po_effective_date IS
  'Date from which commercial terms / base pricing become effective (distinct from po_date and start_date).';

COMMENT ON COLUMN billing.po_wo.price_escalation_enabled IS
  'When false, pricing behaves as legacy (monthly_value / rate_per_category only).';

COMMENT ON COLUMN billing.po_wo.price_escalation_schedule IS
  'Effective-dated escalation events: [{id,effectiveDate,escalationType,escalationValue,...}].';

-- Optional dedicated history table (immutable corrections). App also writes update_history.
CREATE TABLE IF NOT EXISTS billing.po_price_escalation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES billing.po_wo(id) ON DELETE CASCADE,
  po_effective_date date,
  escalation_effective_date date NOT NULL,
  escalation_type text NOT NULL,
  escalation_value numeric(18, 4) NOT NULL,
  previous_monthly_value numeric(18, 2),
  new_monthly_value numeric(18, 2),
  previous_contract_value numeric(18, 2),
  new_contract_value numeric(18, 2),
  previous_category_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_category_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_price_escalation_history_po
  ON billing.po_price_escalation_history (po_id, escalation_effective_date);

ALTER TABLE billing.po_price_escalation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_price_escalation_history_select ON billing.po_price_escalation_history;
CREATE POLICY po_price_escalation_history_select ON billing.po_price_escalation_history
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS po_price_escalation_history_insert ON billing.po_price_escalation_history;
CREATE POLICY po_price_escalation_history_insert ON billing.po_price_escalation_history
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- No UPDATE/DELETE policies: history rows are append-only for authenticated clients.

NOTIFY pgrst, 'reload schema';

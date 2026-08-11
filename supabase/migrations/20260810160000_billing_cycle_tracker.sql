-- Billing Cycle Tracker: recurring (monthly/quarterly) sites only.
-- Business timezone for all due-date / "today" comparisons: Asia/Kolkata (IST).
--
-- Requires schema `billing` (fail loudly if missing — do not silently skip).
--
-- Qualifying invoice (locks a period — first wins among concurrent writers):
--   invoice_kind = 'tax'
--   AND NOT COALESCE(is_cancelled, false)
--   AND NOT COALESCE(is_add_on, false)
--   AND COALESCE(total_amount, 0) > 0
-- Draft / proforma / add-on / ₹0-or-negative do NOT qualify. Lock happens when a
-- qualifying tax invoice is inserted or updated to qualify (finalize time).
-- Lock order is trigger/commit order (whichever qualifying invoice's statement
-- commits first while period.invoice_id IS NULL). Not sorted by invoice_date;
-- out-of-order data entry can diverge from "earliest invoice_date wins".
--
-- AMC / RM cycle length: do NOT invent monthly from COALESCE(billing_cycle, 30).
-- Prefer billing.po_wo.billing_frequency ('monthly'|'quarterly'); else billing_cycle
-- days; else text heuristics; else default monthly with cycle_type_source flagged.
--
-- Match key for find-or-create period:
--   site_id + vertical + period_start + period_end
-- where period_start/end MUST equal the invoice billing_duration_from/to exactly,
-- after validating against config cycle boundaries (IST). Mid-cycle onboarding
-- stores a CLIPPED first period (onboarded_on → canonical_end), not the full
-- canonical window — so a 15 Jul–31 Jul invoice links to that clipped row.
--
-- Void/cancel unlink: clear invoice_id + raised_date. Status re-derives — if
-- due_date already passed in IST → not_raised. Manual override fields retained.
--
-- Manual override vs auto-link: real qualifying invoice overwrites invoice_id/
-- raised_date; manual_* kept for dual-fact UI.

-- ---------------------------------------------------------------------------
-- Config: which sites are on a recurring cycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.billing_cycle_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  vertical text NOT NULL,
  po_id uuid REFERENCES billing.po_wo(id) ON DELETE SET NULL,
  cycle_type text NOT NULL CHECK (cycle_type IN ('monthly', 'quarterly')),
  -- How cycle_type was chosen: billing_frequency | billing_cycle | text_infer | default_monthly_no_signal | manual
  cycle_type_source text NOT NULL DEFAULT 'default_monthly_no_signal',
  -- 4 = Indian FY quarters (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar). Set 1 for calendar quarters.
  quarter_start_month integer NOT NULL DEFAULT 4
    CHECK (quarter_start_month BETWEEN 1 AND 12),
  cycle_deadline_offset_days integer NOT NULL DEFAULT 7,
  active boolean NOT NULL DEFAULT true,
  -- First period starts on/after this date (new site mid-cycle: no retroactive periods).
  onboarded_on date NOT NULL DEFAULT ((timezone('Asia/Kolkata', now()))::date),
  client_legal_name text,
  location_name text,
  oc_number text,
  po_wo_number text,
  ref_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, vertical)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycle_config_active
  ON billing.billing_cycle_config (active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_billing_cycle_config_vertical
  ON billing.billing_cycle_config (vertical);
CREATE INDEX IF NOT EXISTS idx_billing_cycle_config_po
  ON billing.billing_cycle_config (po_id);

COMMENT ON TABLE billing.billing_cycle_config IS
  'Recurring billing sites (monthly/quarterly only). Milestone / custom-formula / one-off patterns are excluded.';
COMMENT ON COLUMN billing.billing_cycle_config.onboarded_on IS
  'First period starts at onboarding (IST date); no retroactive periods before this. First in-progress cycle stores clipped dates.';
COMMENT ON COLUMN billing.billing_cycle_config.active IS
  'false when contract closed — site drops off going forward; historical periods retained.';
COMMENT ON COLUMN billing.billing_cycle_config.quarter_start_month IS
  'Month the fiscal/quarter grid starts. Default 4 (Indian FY). Use 1 for calendar Jan–Mar quarters.';
COMMENT ON COLUMN billing.billing_cycle_config.cycle_type_source IS
  'Provenance of cycle_type. default_monthly_no_signal means AMC/RM had no billing_frequency or billing_cycle — review manually.';

-- Dedicated PO signal for tracker cycle length (AMC/RM previously nulled billing_cycle on save).
ALTER TABLE billing.po_wo
  ADD COLUMN IF NOT EXISTS billing_frequency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_po_wo_billing_frequency_check'
  ) THEN
    ALTER TABLE billing.po_wo
      ADD CONSTRAINT billing_po_wo_billing_frequency_check
      CHECK (
        billing_frequency IS NULL
        OR lower(billing_frequency) IN ('monthly', 'quarterly')
      );
  END IF;
END $$;

COMMENT ON COLUMN billing.po_wo.billing_frequency IS
  'Tracker/billing cycle length: monthly | quarterly. Required for reliable AMC cycle_type when billing_cycle is null.';

-- Audit when invoice→period link is skipped (NOTICE alone is easy to miss in production).
CREATE TABLE IF NOT EXISTS billing.billing_cycle_link_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid,
  site_id text,
  po_id uuid,
  reason text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_cycle_link_failures_created
  ON billing.billing_cycle_link_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_cycle_link_failures_invoice
  ON billing.billing_cycle_link_failures (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON TABLE billing.billing_cycle_link_failures IS
  'Skipped auto-links from trg_invoice_cycle_tracker (missing po_id/vertical, period mismatch, etc.). Prefer this over RAISE NOTICE.';

CREATE OR REPLACE FUNCTION billing.log_cycle_link_failure(
  p_invoice_id uuid,
  p_site_id text,
  p_po_id uuid,
  p_reason text,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
BEGIN
  INSERT INTO billing.billing_cycle_link_failures (invoice_id, site_id, po_id, reason, detail)
  VALUES (p_invoice_id, p_site_id, p_po_id, p_reason, COALESCE(p_detail, '{}'::jsonb));
  RAISE NOTICE 'Cycle tracker link failure [%]: invoice=% site=% po=%',
    p_reason, p_invoice_id, p_site_id, p_po_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Period rows (status derived, not stored)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.billing_cycle_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES billing.billing_cycle_config(id) ON DELETE CASCADE,
  site_id text NOT NULL,
  vertical text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  invoice_id uuid REFERENCES billing.invoice(id) ON DELETE SET NULL,
  raised_date date,
  manually_raised boolean NOT NULL DEFAULT false,
  manual_raised_date date,
  manual_raised_reason text,
  manual_raised_at timestamptz,
  manual_raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_cycle_period_range_chk CHECK (period_end >= period_start),
  UNIQUE (site_id, vertical, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycle_period_config
  ON billing.billing_cycle_period (config_id, period_start);
CREATE INDEX IF NOT EXISTS idx_billing_cycle_period_due
  ON billing.billing_cycle_period (due_date);
CREATE INDEX IF NOT EXISTS idx_billing_cycle_period_invoice
  ON billing.billing_cycle_period (invoice_id) WHERE invoice_id IS NOT NULL;

COMMENT ON TABLE billing.billing_cycle_period IS
  'One billing cycle window per site+vertical. Status is derived in v_billing_cycle_period_status (IST). First mid-cycle period stores clipped period_start = onboarded_on.';
COMMENT ON COLUMN billing.billing_cycle_period.raised_date IS
  'Invoice issue date (invoice.invoice_date), never server now().';

-- ---------------------------------------------------------------------------
-- IST helpers + derived status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.ist_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (timezone('Asia/Kolkata', now()))::date;
$$;

COMMENT ON FUNCTION billing.ist_today() IS
  'Current calendar date in Asia/Kolkata (IST). All tracker due-date comparisons use this.';

CREATE OR REPLACE FUNCTION billing.derive_cycle_period_status(
  p_invoice_id uuid,
  p_raised_date date,
  p_due_date date,
  p_manually_raised boolean DEFAULT false,
  p_manual_raised_date date DEFAULT NULL,
  p_today date DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today date := COALESCE(p_today, billing.ist_today());
  v_raised date;
BEGIN
  IF p_invoice_id IS NOT NULL THEN
    v_raised := p_raised_date;
    IF v_raised IS NULL THEN
      RETURN 'raised_on_time';
    END IF;
    IF v_raised <= p_due_date THEN
      RETURN 'raised_on_time';
    END IF;
    RETURN 'raised_late';
  END IF;

  IF COALESCE(p_manually_raised, false) AND p_manual_raised_date IS NOT NULL THEN
    IF p_manual_raised_date <= p_due_date THEN
      RETURN 'raised_on_time';
    END IF;
    RETURN 'raised_late';
  END IF;

  -- After cancel/unlink: invoice_id null → re-run due_date vs today (IST).
  IF v_today <= p_due_date THEN
    RETURN 'cycle_in_progress';
  END IF;
  RETURN 'not_raised';
END;
$$;

COMMENT ON FUNCTION billing.derive_cycle_period_status(uuid, date, date, boolean, date, date) IS
  'Derived status. Cancel/unlink clears invoice_id so past-due periods become not_raised (IST today).';

CREATE OR REPLACE VIEW billing.v_billing_cycle_period_status AS
SELECT
  p.id AS period_id,
  p.config_id,
  p.site_id,
  p.vertical,
  p.period_start,
  p.period_end,
  p.due_date,
  p.invoice_id,
  p.raised_date,
  p.manually_raised,
  p.manual_raised_date,
  p.manual_raised_reason,
  p.manual_raised_at,
  p.manual_raised_by,
  p.auto_confirmed_at,
  c.cycle_type,
  c.quarter_start_month,
  c.cycle_deadline_offset_days,
  c.active AS config_active,
  c.client_legal_name,
  c.location_name,
  c.oc_number,
  c.po_wo_number,
  c.ref_code,
  c.po_id,
  c.onboarded_on,
  inv.tax_invoice_number,
  inv.invoice_date AS invoice_issue_date,
  billing.derive_cycle_period_status(
    p.invoice_id,
    p.raised_date,
    p.due_date,
    p.manually_raised,
    p.manual_raised_date,
    billing.ist_today()
  ) AS derived_status
FROM billing.billing_cycle_period p
JOIN billing.billing_cycle_config c ON c.id = p.config_id
LEFT JOIN billing.invoice inv ON inv.id = p.invoice_id;

COMMENT ON VIEW billing.v_billing_cycle_period_status IS
  'Tracker rows with IST-derived status (Asia/Kolkata). Re-query after invoice link/unlink — no stored status.';

-- ---------------------------------------------------------------------------
-- Period boundary math (IST calendar / Indian FY quarters by default)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.cycle_period_bounds(
  p_cycle_type text,
  p_anchor date,
  p_quarter_start_month integer DEFAULT 4
)
RETURNS TABLE (period_start date, period_end date)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  y int;
  m int;
  qs int := COALESCE(p_quarter_start_month, 4);
  fy_start_year int;
  months_since int;
  q_index int;
  start_date date;
BEGIN
  IF p_anchor IS NULL THEN
    RETURN;
  END IF;
  y := EXTRACT(YEAR FROM p_anchor)::int;
  m := EXTRACT(MONTH FROM p_anchor)::int;

  IF p_cycle_type = 'monthly' THEN
    period_start := make_date(y, m, 1);
    period_end := (period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_cycle_type = 'quarterly' THEN
    IF qs < 1 OR qs > 12 THEN
      qs := 4;
    END IF;
    -- Indian FY default (qs=4): Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar.
    -- Calendar quarters: pass qs=1.
    fy_start_year := CASE WHEN m >= qs THEN y ELSE y - 1 END;
    months_since := (y - fy_start_year) * 12 + (m - qs);
    q_index := months_since / 3;
    start_date := (make_date(fy_start_year, qs, 1) + (q_index * 3 || ' months')::interval)::date;
    period_start := start_date;
    period_end := (start_date + INTERVAL '3 months' - INTERVAL '1 day')::date;
    RETURN NEXT;
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION billing.cycle_period_bounds(text, date, integer) IS
  'Canonical cycle window containing p_anchor. quarterly uses p_quarter_start_month (default 4 = Indian FY).';

-- Expected stored dates for a canonical window (clips first period to onboarded_on).
CREATE OR REPLACE FUNCTION billing.expected_stored_cycle_period(
  p_config billing.billing_cycle_config,
  p_anchor date
)
RETURNS TABLE (period_start date, period_end date, canonical_start date, canonical_end date)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  b record;
  v_start date;
  v_end date;
BEGIN
  SELECT * INTO b
  FROM billing.cycle_period_bounds(
    p_config.cycle_type,
    p_anchor,
    COALESCE(p_config.quarter_start_month, 4)
  );

  IF b.period_start IS NULL THEN
    RETURN;
  END IF;

  canonical_start := b.period_start;
  canonical_end := b.period_end;

  -- Entirely before onboarding → no period.
  IF canonical_end < p_config.onboarded_on THEN
    RETURN;
  END IF;

  -- Mid-cycle onboarding: clip FIRST period only (store onboarded_on → canonical_end).
  IF p_config.onboarded_on > canonical_start AND p_config.onboarded_on <= canonical_end THEN
    v_start := p_config.onboarded_on;
  ELSE
    v_start := canonical_start;
  END IF;
  v_end := canonical_end;

  period_start := v_start;
  period_end := v_end;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION billing.is_valid_cycle_period_for_config(
  p_config billing.billing_cycle_config,
  p_period_start date,
  p_period_end date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  exp record;
BEGIN
  IF p_period_start IS NULL OR p_period_end IS NULL THEN
    RETURN false;
  END IF;
  IF p_period_end < p_config.onboarded_on THEN
    RETURN false;
  END IF;

  -- Resolve expected stored window from the invoice's start date (not month name).
  SELECT * INTO exp
  FROM billing.expected_stored_cycle_period(p_config, p_period_start);

  IF exp.period_start IS NULL THEN
    RETURN false;
  END IF;

  -- Exact match to stored dates (clipped first period OR full canonical thereafter).
  RETURN exp.period_start = p_period_start AND exp.period_end = p_period_end;
END;
$$;

COMMENT ON FUNCTION billing.is_valid_cycle_period_for_config(billing.billing_cycle_config, date, date) IS
  'Accepts invoice from/to equal to stored period dates. Mid-cycle first period: from = onboarded_on, to = canonical_end.';

CREATE OR REPLACE FUNCTION billing.ensure_cycle_period_row(
  p_config billing.billing_cycle_config,
  p_period_start date,
  p_period_end date
)
RETURNS billing.billing_cycle_period
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  v_row billing.billing_cycle_period;
  v_due date;
  exp record;
  v_start date;
  v_end date;
BEGIN
  -- Normalize to expected stored dates (clips mid-cycle first period).
  SELECT * INTO exp
  FROM billing.expected_stored_cycle_period(p_config, p_period_start);

  IF exp.period_start IS NULL THEN
    RETURN NULL;
  END IF;

  v_start := exp.period_start;
  v_end := exp.period_end;

  -- Caller must pass the clipped pair OR the canonical start with matching end.
  -- Reject cross-period remap (e.g. July invoice dates against August window).
  IF p_period_end IS DISTINCT FROM v_end THEN
    RETURN NULL;
  END IF;
  IF p_period_start IS DISTINCT FROM v_start
     AND p_period_start IS DISTINCT FROM exp.canonical_start THEN
    RETURN NULL;
  END IF;

  IF NOT billing.is_valid_cycle_period_for_config(p_config, v_start, v_end) THEN
    RETURN NULL;
  END IF;

  v_due := (v_end + (p_config.cycle_deadline_offset_days || ' days')::interval)::date;

  INSERT INTO billing.billing_cycle_period (
    config_id, site_id, vertical, period_start, period_end, due_date
  ) VALUES (
    p_config.id, p_config.site_id, p_config.vertical, v_start, v_end, v_due
  )
  ON CONFLICT (site_id, vertical, period_start, period_end) DO UPDATE
    SET updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Ensure period rows exist for active configs across a date window (lazy create for UI).
CREATE OR REPLACE FUNCTION billing.ensure_billing_cycle_periods(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  v_from date := COALESCE(p_from, date_trunc('month', billing.ist_today())::date - INTERVAL '5 months');
  v_to date := COALESCE(p_to, (date_trunc('month', billing.ist_today())::date + INTERVAL '2 months' - INTERVAL '1 day')::date);
  cfg billing.billing_cycle_config;
  cursor_day date;
  exp record;
  n int := 0;
BEGIN
  v_from := v_from::date;
  v_to := v_to::date;

  FOR cfg IN
    SELECT * FROM billing.billing_cycle_config WHERE active = true
  LOOP
    cursor_day := GREATEST(v_from, cfg.onboarded_on);
    WHILE cursor_day <= v_to LOOP
      SELECT * INTO exp FROM billing.expected_stored_cycle_period(cfg, cursor_day);
      IF exp.period_start IS NOT NULL AND exp.period_start <= v_to THEN
        IF billing.ensure_cycle_period_row(cfg, exp.period_start, exp.period_end) IS NOT NULL THEN
          n := n + 1;
        END IF;
        cursor_day := (exp.canonical_end + INTERVAL '1 day')::date;
      ELSE
        -- Advance by one day to avoid infinite loop on empty
        cursor_day := (cursor_day + INTERVAL '1 day')::date;
      END IF;
    END LOOP;
  END LOOP;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION billing.ensure_billing_cycle_periods(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sync configs from cyclic POs (exclude milestone / custom / one-off)
-- Columns used on billing.po_wo:
--   site_id, oc_number, vertical, status, approval_status, start_date, legal_name,
--   location_name, po_wo_number, billing_type, po_type, billing_cycle,
--   billing_frequency, is_supplementary, payment_terms, remarks, service_description
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.resolve_po_tracker_cycle_type(p_po billing.po_wo)
RETURNS TABLE (cycle_type text, source text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  freq text := lower(btrim(COALESCE(p_po.billing_frequency, '')));
  days integer := p_po.billing_cycle;
  blob text;
BEGIN
  -- 1) Dedicated field (AMC/RM must set this — billing_cycle is often null on those POs)
  IF freq IN ('monthly', 'quarterly') THEN
    cycle_type := freq;
    source := 'billing_frequency';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) Explicit day count when present (do NOT COALESCE null → 30)
  IF days IS NOT NULL AND days > 0 THEN
    IF days >= 75 THEN
      cycle_type := 'quarterly';
    ELSE
      cycle_type := 'monthly';
    END IF;
    source := 'billing_cycle';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3) Weak text heuristics for legacy rows (remarks / payment_terms / service_description)
  blob := lower(concat_ws(' ',
    COALESCE(p_po.payment_terms, ''),
    COALESCE(p_po.remarks, ''),
    COALESCE(p_po.service_description, '')
  ));
  IF blob ~ '(quarterly|quarter\b|qtr\b|every\s*3\s*month|3\s*months)' THEN
    cycle_type := 'quarterly';
    source := 'text_infer';
    RETURN NEXT;
    RETURN;
  END IF;
  IF blob ~ '(monthly|every\s*month|per\s*month)' THEN
    cycle_type := 'monthly';
    source := 'text_infer';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 4) No reliable signal — default monthly but flag so ops can correct AMC quarterly contracts
  cycle_type := 'monthly';
  source := 'default_monthly_no_signal';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION billing.resolve_po_tracker_cycle_type(billing.po_wo) IS
  'Resolve monthly vs quarterly without inventing billing_cycle=30. Prefer billing_frequency.';

CREATE OR REPLACE FUNCTION billing.po_is_cyclic_for_tracker(p_po billing.po_wo)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  bt text := lower(btrim(COALESCE(p_po.billing_type, p_po.po_type, '')));
  v_vert text := billing.normalize_vertical_code(p_po.vertical);
BEGIN
  IF bt IN (
    'lump sum', 'lumpsum', 'custom', 'custom calculator',
    'supply', 'milestone', 'one-off', 'one_off', 'oneoff'
  ) THEN
    RETURN false;
  END IF;

  IF bt IN ('monthly', 'per day', 'daily', 'day', 'day rate', 'service') THEN
    RETURN true;
  END IF;

  -- AMC vertical: PO Entry uses Service|Supply; billing_cycle often null.
  IF v_vert = 'amc' AND bt <> 'supply' THEN
    RETURN true;
  END IF;

  IF COALESCE(p_po.billing_cycle, 0) BETWEEN 1 AND 120 THEN
    RETURN true;
  END IF;

  IF lower(btrim(COALESCE(p_po.billing_frequency, ''))) IN ('monthly', 'quarterly') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION billing.sync_billing_cycle_configs_from_pos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  po billing.po_wo;
  v_site text;
  v_vert text;
  v_cycle text;
  v_source text;
  v_resolved record;
  v_active boolean;
  v_onboard date;
  n int := 0;
BEGIN
  FOR po IN
    SELECT *
    FROM billing.po_wo
    WHERE COALESCE(is_supplementary, false) = false
  LOOP
    IF NOT billing.po_is_cyclic_for_tracker(po) THEN
      CONTINUE;
    END IF;

    v_site := nullif(btrim(COALESCE(po.site_id, '')), '');
    IF v_site IS NULL THEN
      v_site := nullif(btrim(COALESCE(po.oc_number, '')), '');
    END IF;
    IF v_site IS NULL THEN
      v_site := 'po:' || po.id::text;
    END IF;

    v_vert := billing.normalize_vertical_code(po.vertical);
    IF lower(btrim(COALESCE(po.vertical, ''))) IN ('fire tender', 'ft') THEN
      v_vert := 'fire_tender';
    END IF;
    IF v_vert IS NULL THEN
      v_vert := 'manpower';
    END IF;

    SELECT * INTO v_resolved FROM billing.resolve_po_tracker_cycle_type(po);
    v_cycle := v_resolved.cycle_type;
    v_source := v_resolved.source;

    v_active :=
      lower(COALESCE(po.status, 'active')) = 'active'
      AND lower(COALESCE(po.approval_status, '')) = 'approved';

    v_onboard := COALESCE(po.start_date, billing.ist_today());

    INSERT INTO billing.billing_cycle_config AS c (
      site_id, vertical, po_id, cycle_type, cycle_type_source, quarter_start_month,
      cycle_deadline_offset_days, active, onboarded_on,
      client_legal_name, location_name, oc_number, po_wo_number, ref_code
    ) VALUES (
      v_site, v_vert, po.id, v_cycle, v_source, 4, 7,
      v_active, v_onboard, po.legal_name, po.location_name, po.oc_number, po.po_wo_number,
      COALESCE(nullif(btrim(po.oc_number), ''), nullif(btrim(po.po_wo_number), ''), v_site)
    )
    ON CONFLICT (site_id, vertical) DO UPDATE SET
      po_id = EXCLUDED.po_id,
      -- Stronger sources win; never let default_monthly_no_signal clobber billing_frequency / billing_cycle / manual.
      cycle_type = CASE
        WHEN EXCLUDED.cycle_type_source IN ('billing_frequency', 'billing_cycle') THEN EXCLUDED.cycle_type
        WHEN c.cycle_type_source IN ('billing_frequency', 'billing_cycle', 'manual') THEN c.cycle_type
        ELSE EXCLUDED.cycle_type
      END,
      cycle_type_source = CASE
        WHEN EXCLUDED.cycle_type_source IN ('billing_frequency', 'billing_cycle') THEN EXCLUDED.cycle_type_source
        WHEN c.cycle_type_source IN ('billing_frequency', 'billing_cycle', 'manual') THEN c.cycle_type_source
        ELSE EXCLUDED.cycle_type_source
      END,
      active = EXCLUDED.active,
      onboarded_on = LEAST(c.onboarded_on, EXCLUDED.onboarded_on),
      client_legal_name = EXCLUDED.client_legal_name,
      location_name = EXCLUDED.location_name,
      oc_number = EXCLUDED.oc_number,
      po_wo_number = EXCLUDED.po_wo_number,
      ref_code = EXCLUDED.ref_code,
      updated_at = now();

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION billing.sync_billing_cycle_configs_from_pos() TO authenticated;

-- Superset of live billing.normalize_vertical_code (20260808120000) + fire_tender / maintenance aliases.
-- CREATE OR REPLACE replaces the whole body — do not drop live codes.
CREATE OR REPLACE FUNCTION billing.normalize_vertical_code(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw text;
  cleaned text;
BEGIN
  raw := lower(btrim(COALESCE(p_raw, '')));
  IF raw = '' THEN RETURN NULL; END IF;

  cleaned := regexp_replace(raw, '\s+', '_', 'g');
  cleaned := regexp_replace(cleaned, '[^a-z0-9_]', '', 'g');

  IF cleaned IN ('bill', 'manp', 'manpower', 'mp') THEN RETURN 'manpower'; END IF;
  IF cleaned IN ('train', 'trng', 'training') THEN RETURN 'training'; END IF;
  IF cleaned IN ('rm', 'r_m', 'randm') THEN RETURN 'rm'; END IF;
  IF cleaned IN ('mm', 'm_m', 'maintenance') THEN RETURN 'mm'; END IF;
  IF cleaned IN ('amc') THEN RETURN 'amc'; END IF;
  IF cleaned IN ('iev') THEN RETURN 'iev'; END IF;
  IF cleaned IN ('projects', 'project') THEN RETURN 'projects'; END IF;
  IF cleaned IN ('fire_tender', 'firetender', 'ft') THEN RETURN 'fire_tender'; END IF;

  -- Label-ish inputs already stripped of punctuation (r&m → rm via cleaned)
  IF cleaned = 'randm' THEN RETURN 'rm'; END IF;

  RETURN cleaned;
END;
$$;

INSERT INTO billing.vertical (code, label, sort_order)
VALUES ('fire_tender', 'Fire Tender', 25)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, is_active = true;

-- ---------------------------------------------------------------------------
-- Link / unlink (invoice trigger — same transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.invoice_is_qualifying_for_cycle_tracker(p_inv billing.invoice)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_inv.id IS NULL THEN RETURN false; END IF;
  IF COALESCE(p_inv.is_cancelled, false) THEN RETURN false; END IF;
  IF COALESCE(p_inv.is_add_on, false) THEN RETURN false; END IF;
  IF lower(COALESCE(p_inv.invoice_kind, 'tax')) <> 'tax' THEN RETURN false; END IF;
  IF COALESCE(p_inv.total_amount, 0) <= 0 THEN RETURN false; END IF;
  IF p_inv.billing_duration_from IS NULL OR p_inv.billing_duration_to IS NULL THEN RETURN false; END IF;
  IF nullif(btrim(COALESCE(p_inv.site_id, '')), '') IS NULL THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION billing.link_invoice_to_cycle_period(p_inv billing.invoice)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  v_site text;
  v_vert text;
  cfg billing.billing_cycle_config;
  per billing.billing_cycle_period;
  v_po billing.po_wo;
BEGIN
  IF NOT billing.invoice_is_qualifying_for_cycle_tracker(p_inv) THEN
    RETURN NULL;
  END IF;

  v_site := btrim(p_inv.site_id);

  -- Require resolvable vertical via po_id — do not guess among multi-vertical sites.
  IF p_inv.po_id IS NULL THEN
    PERFORM billing.log_cycle_link_failure(
      p_inv.id, v_site, NULL, 'missing_po_id',
      jsonb_build_object('billing_duration_from', p_inv.billing_duration_from,
                         'billing_duration_to', p_inv.billing_duration_to)
    );
    RETURN NULL;
  END IF;

  SELECT * INTO v_po FROM billing.po_wo WHERE id = p_inv.po_id;
  IF v_po.id IS NULL THEN
    PERFORM billing.log_cycle_link_failure(
      p_inv.id, v_site, p_inv.po_id, 'po_not_found', '{}'::jsonb
    );
    RETURN NULL;
  END IF;

  v_vert := billing.normalize_vertical_code(COALESCE(v_po.vertical, ''));
  IF lower(btrim(COALESCE(v_po.vertical, ''))) IN ('fire tender', 'ft') THEN
    v_vert := 'fire_tender';
  END IF;
  IF v_vert IS NULL THEN
    PERFORM billing.log_cycle_link_failure(
      p_inv.id, v_site, p_inv.po_id, 'unresolvable_vertical',
      jsonb_build_object('po_vertical', v_po.vertical)
    );
    RETURN NULL;
  END IF;

  SELECT * INTO cfg
  FROM billing.billing_cycle_config
  WHERE site_id = v_site AND vertical = v_vert
  LIMIT 1;

  IF cfg.id IS NULL THEN
    RETURN NULL; -- not a tracked cyclic site (no failure — expected for non-cyclic)
  END IF;

  IF NOT billing.is_valid_cycle_period_for_config(
    cfg, p_inv.billing_duration_from, p_inv.billing_duration_to
  ) THEN
    PERFORM billing.log_cycle_link_failure(
      p_inv.id, v_site, p_inv.po_id, 'period_boundary_mismatch',
      jsonb_build_object(
        'from', p_inv.billing_duration_from,
        'to', p_inv.billing_duration_to,
        'cycle_type', cfg.cycle_type,
        'cycle_type_source', cfg.cycle_type_source,
        'vertical', v_vert
      )
    );
    RETURN NULL;
  END IF;

  per := billing.ensure_cycle_period_row(
    cfg, p_inv.billing_duration_from, p_inv.billing_duration_to
  );
  IF per.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- First qualifying invoice locks.
  IF per.invoice_id IS NOT NULL AND per.invoice_id <> p_inv.id THEN
    RETURN per.id;
  END IF;

  UPDATE billing.billing_cycle_period
  SET
    invoice_id = p_inv.id,
    raised_date = p_inv.invoice_date,
    auto_confirmed_at = CASE
      WHEN manually_raised THEN COALESCE(auto_confirmed_at, now())
      ELSE auto_confirmed_at
    END,
    updated_at = now()
  WHERE id = per.id
    AND (invoice_id IS NULL OR invoice_id = p_inv.id);

  RETURN per.id;
END;
$$;

CREATE OR REPLACE FUNCTION billing.unlink_invoice_from_cycle_period(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  n int := 0;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE billing.billing_cycle_period
  SET
    invoice_id = NULL,
    raised_date = NULL,
    updated_at = now()
  WHERE invoice_id = p_invoice_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION billing.trg_invoice_cycle_tracker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.is_cancelled, false) = true
     AND COALESCE(OLD.is_cancelled, false) = false THEN
    PERFORM billing.unlink_invoice_from_cycle_period(NEW.id);
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_cancelled, false) = true THEN
    RETURN NEW;
  END IF;

  IF billing.invoice_is_qualifying_for_cycle_tracker(NEW) THEN
    PERFORM billing.link_invoice_to_cycle_period(NEW);
  ELSIF TG_OP = 'UPDATE'
        AND billing.invoice_is_qualifying_for_cycle_tracker(OLD)
        AND NOT billing.invoice_is_qualifying_for_cycle_tracker(NEW) THEN
    PERFORM billing.unlink_invoice_from_cycle_period(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_cycle_tracker ON billing.invoice;
CREATE TRIGGER trg_invoice_cycle_tracker
  AFTER INSERT OR UPDATE OF
    site_id, billing_duration_from, billing_duration_to, invoice_date,
    invoice_kind, is_cancelled, is_add_on, total_amount, po_id
  ON billing.invoice
  FOR EACH ROW
  EXECUTE FUNCTION billing.trg_invoice_cycle_tracker();

-- ---------------------------------------------------------------------------
-- Manual override RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.mark_billing_cycle_period_manual(
  p_period_id uuid,
  p_raised_date date,
  p_reason text
)
RETURNS billing.billing_cycle_period
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  v_row billing.billing_cycle_period;
BEGIN
  IF p_period_id IS NULL THEN
    RAISE EXCEPTION 'period id required';
  END IF;
  IF p_raised_date IS NULL THEN
    RAISE EXCEPTION 'raised date required';
  END IF;
  IF nullif(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reason required for manual mark';
  END IF;

  UPDATE billing.billing_cycle_period
  SET
    manually_raised = true,
    manual_raised_date = p_raised_date,
    manual_raised_reason = btrim(p_reason),
    manual_raised_at = now(),
    manual_raised_by = auth.uid(),
    updated_at = now()
  WHERE id = p_period_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'period not found';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION billing.mark_billing_cycle_period_manual(uuid, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tracker list RPC
-- NOTE: sync_billing_cycle_configs_from_pos() + ensure_billing_cycle_periods() run on
-- every read (two write-ish passes per page load). Acceptable at low site volume;
-- extract to a nightly job once site count grows — do not leave forever on the hot path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.list_billing_cycle_tracker(
  p_vertical text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  period_id uuid,
  config_id uuid,
  site_id text,
  vertical text,
  period_start date,
  period_end date,
  due_date date,
  invoice_id uuid,
  raised_date date,
  manually_raised boolean,
  manual_raised_date date,
  manual_raised_reason text,
  manual_raised_at timestamptz,
  manual_raised_by uuid,
  auto_confirmed_at timestamptz,
  cycle_type text,
  cycle_deadline_offset_days integer,
  config_active boolean,
  client_legal_name text,
  location_name text,
  oc_number text,
  po_wo_number text,
  ref_code text,
  po_id uuid,
  onboarded_on date,
  tax_invoice_number text,
  invoice_issue_date date,
  derived_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = billing, public
AS $$
DECLARE
  v_raw_vert text := lower(btrim(COALESCE(p_vertical, '')));
  v_vert text;
  v_from date := COALESCE(p_from, (date_trunc('year', billing.ist_today())::date));
  v_to date := COALESCE(p_to, billing.ist_today());
  v_q text := lower(btrim(COALESCE(p_search, '')));
BEGIN
  IF v_raw_vert = '' OR v_raw_vert = 'all' THEN
    v_vert := NULL;
  ELSIF v_raw_vert = 'others' THEN
    v_vert := 'others';
  ELSE
    v_vert := billing.normalize_vertical_code(p_vertical);
  END IF;

  -- HOT PATH WRITES: see header comment — move to nightly job when volume grows.
  PERFORM billing.sync_billing_cycle_configs_from_pos();
  PERFORM billing.ensure_billing_cycle_periods(v_from, v_to);

  RETURN QUERY
  SELECT
    v.period_id,
    v.config_id,
    v.site_id,
    v.vertical,
    v.period_start,
    v.period_end,
    v.due_date,
    v.invoice_id,
    v.raised_date,
    v.manually_raised,
    v.manual_raised_date,
    v.manual_raised_reason,
    v.manual_raised_at,
    v.manual_raised_by,
    v.auto_confirmed_at,
    v.cycle_type,
    v.cycle_deadline_offset_days,
    v.config_active,
    v.client_legal_name,
    v.location_name,
    v.oc_number,
    v.po_wo_number,
    v.ref_code,
    v.po_id,
    v.onboarded_on,
    v.tax_invoice_number,
    v.invoice_issue_date,
    v.derived_status
  FROM billing.v_billing_cycle_period_status v
  WHERE v.period_start <= v_to
    AND v.period_end >= v_from
    AND (
      v_vert IS NULL
      OR (v_vert = 'others' AND v.vertical NOT IN ('manpower', 'mm', 'fire_tender', 'training'))
      OR v.vertical = v_vert
      OR (v_vert = 'mm' AND v.vertical IN ('mm', 'rm'))
    )
    AND (p_status IS NULL OR p_status = '' OR v.derived_status = p_status)
    AND (
      v_q = ''
      OR lower(COALESCE(v.client_legal_name, '')) LIKE '%' || v_q || '%'
      OR lower(COALESCE(v.location_name, '')) LIKE '%' || v_q || '%'
      OR lower(COALESCE(v.oc_number, '')) LIKE '%' || v_q || '%'
      OR lower(COALESCE(v.po_wo_number, '')) LIKE '%' || v_q || '%'
      OR lower(COALESCE(v.ref_code, '')) LIKE '%' || v_q || '%'
      OR lower(COALESCE(v.site_id, '')) LIKE '%' || v_q || '%'
      OR lower(COALESCE(v.tax_invoice_number, '')) LIKE '%' || v_q || '%'
    )
  ORDER BY v.client_legal_name NULLS LAST, v.site_id, v.period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION billing.list_billing_cycle_tracker(text, text, text, date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- Requires billing.current_user_has_billing_access() from earlier migrations
-- (20260506173000 / 20260624120000 / 20260802120000). Not redefined here.
-- ---------------------------------------------------------------------------
ALTER TABLE billing.billing_cycle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_cycle_period ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_access_cycle_config ON billing.billing_cycle_config;
CREATE POLICY billing_access_cycle_config
  ON billing.billing_cycle_config
  FOR ALL
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

DROP POLICY IF EXISTS billing_access_cycle_period ON billing.billing_cycle_period;
CREATE POLICY billing_access_cycle_period
  ON billing.billing_cycle_period
  FOR ALL
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON billing.billing_cycle_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON billing.billing_cycle_period TO authenticated;
GRANT SELECT, INSERT ON billing.billing_cycle_link_failures TO authenticated;
GRANT SELECT ON billing.v_billing_cycle_period_status TO authenticated;

ALTER TABLE billing.billing_cycle_link_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_access_cycle_link_failures ON billing.billing_cycle_link_failures;
CREATE POLICY billing_access_cycle_link_failures
  ON billing.billing_cycle_link_failures
  FOR ALL
  USING (billing.current_user_has_billing_access())
  WITH CHECK (billing.current_user_has_billing_access());

-- ---------------------------------------------------------------------------
-- Self-check notes (run after apply):
-- Mid-cycle: onboarded_on=2026-07-15, monthly. Invoice 2026-07-15..2026-07-31,
--   invoice_date=2026-07-20 → links; due_date=2026-08-07 (31+7); status raised_on_time.
-- Cancel after due: unlink → derived_status = not_raised.
-- ---------------------------------------------------------------------------

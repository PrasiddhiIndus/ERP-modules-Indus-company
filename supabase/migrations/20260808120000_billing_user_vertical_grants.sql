-- Billing vertical lookup + per-user grants, with RLS scoped to granted verticals.
-- PO Entry writers (Commercial / Maintenance / Projects) keep implied vertical access
-- so existing PO flows are unchanged. Billing-module users rely on grants.

DO $$
BEGIN
  IF to_regnamespace('billing') IS NULL THEN
    RAISE NOTICE 'Skipping billing vertical grants — billing schema not present.';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Lookup: billing.vertical
  -- ---------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS billing.vertical (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    label text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO billing.vertical (code, label, sort_order) VALUES
    ('manpower', 'Manpower', 10),
    ('training', 'Training', 20),
    ('rm', 'R&M', 30),
    ('mm', 'M&M', 40),
    ('amc', 'AMC', 50),
    ('iev', 'IEV', 60),
    ('projects', 'Projects', 70)
  ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ---------------------------------------------------------------------------
  -- Grants: billing.user_vertical_grant
  -- ---------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS billing.user_vertical_grant (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vertical_id uuid NOT NULL REFERENCES billing.vertical(id) ON DELETE CASCADE,
    source text NOT NULL DEFAULT 'manual'
      CHECK (source IN ('default', 'manual')),
    granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, vertical_id)
  );

  CREATE INDEX IF NOT EXISTS idx_billing_user_vertical_grant_user
    ON billing.user_vertical_grant (user_id);
  CREATE INDEX IF NOT EXISTS idx_billing_user_vertical_grant_vertical
    ON billing.user_vertical_grant (vertical_id);

  COMMENT ON TABLE billing.vertical IS
    'Canonical billing business lines (Manpower, M&M, …). Codes match frontend vertical keys.';
  COMMENT ON TABLE billing.user_vertical_grant IS
    'Which billing verticals a user may access. source=default means seeded from HR team; grants remain editable rows.';
END $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
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
  IF cleaned IN ('mm', 'm_m') THEN RETURN 'mm'; END IF;
  IF cleaned IN ('amc') THEN RETURN 'amc'; END IF;
  IF cleaned IN ('iev') THEN RETURN 'iev'; END IF;
  IF cleaned IN ('projects', 'project') THEN RETURN 'projects'; END IF;

  -- Label-ish inputs already stripped of punctuation (r&m → rm via cleaned)
  IF cleaned = 'randm' THEN RETURN 'rm'; END IF;

  RETURN cleaned;
END;
$$;

CREATE OR REPLACE FUNCTION billing.default_vertical_codes_for_team(p_team text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  t text;
BEGIN
  t := lower(btrim(COALESCE(p_team, '')));
  t := regexp_replace(t, '\s+', ' ', 'g');

  IF t IN ('billing', 'finance', 'finance/accounts', 'management') THEN
    RETURN ARRAY['manpower', 'training', 'rm', 'mm', 'amc', 'iev', 'projects'];
  END IF;

  IF t IN ('commercial', 'commercialmt', 'commercial mt') THEN
    RETURN ARRAY['manpower', 'training'];
  END IF;

  IF t IN ('r&m', 'r & m', 'commercialrm', 'commercial rm') THEN
    RETURN ARRAY['rm'];
  END IF;

  IF t IN ('maintenance', 'maintenance-ftc', 'maintenance ftc') THEN
    RETURN ARRAY['mm'];
  END IF;

  IF t IN ('projects', 'projects-ftc', 'projects ftc') THEN
    RETURN ARRAY['projects'];
  END IF;

  IF t IN ('training') THEN
    RETURN ARRAY['training'];
  END IF;

  IF t IN ('amc') THEN
    RETURN ARRAY['amc'];
  END IF;

  RETURN ARRAY[]::text[];
END;
$$;

CREATE OR REPLACE FUNCTION billing.profile_has_module_prefix(p public.profiles, p_prefixes text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  pref text;
  mod text;
  sub text;
  team_key text;
BEGIN
  team_key := lower(btrim(COALESCE(p.team, '')));
  FOREACH pref IN ARRAY p_prefixes LOOP
    IF team_key = lower(pref) THEN RETURN true; END IF;
  END LOOP;

  FOR mod IN
    SELECT lower(btrim(m.val))
    FROM jsonb_array_elements_text(COALESCE(p.allowed_modules, '[]'::jsonb)) m(val)
  LOOP
    FOREACH pref IN ARRAY p_prefixes LOOP
      IF mod = lower(pref) THEN RETURN true; END IF;
    END LOOP;
  END LOOP;

  FOR sub IN
    SELECT lower(btrim(s.val))
    FROM jsonb_array_elements_text(
      COALESCE(to_jsonb(p) -> 'allowed_sub_modules', '[]'::jsonb)
    ) s(val)
  LOOP
    FOREACH pref IN ARRAY p_prefixes LOOP
      IF sub = lower(pref) OR sub LIKE (lower(pref) || '.%') THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION billing.current_user_is_billing_super()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  );
$$;

-- Implied verticals for PO Entry writers (keeps Commercial / Maintenance / Projects working).
CREATE OR REPLACE FUNCTION billing.current_user_implied_vertical_codes()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, billing
SET row_security = off
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  codes text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN codes; END IF;

  IF billing.profile_has_module_prefix(
    p, ARRAY['commercial', 'commercialmt', 'sales']
  ) THEN
    codes := codes || ARRAY['manpower', 'training'];
  END IF;

  IF billing.profile_has_module_prefix(
    p, ARRAY['commercialrm', 'r&m']
  ) THEN
    codes := codes || ARRAY['rm', 'mm', 'amc', 'iev'];
  END IF;

  IF billing.profile_has_module_prefix(p, ARRAY['maintenance']) THEN
    codes := codes || ARRAY['mm'];
  END IF;

  IF billing.profile_has_module_prefix(p, ARRAY['projects']) THEN
    codes := codes || ARRAY['projects'];
  END IF;

  RETURN (
    SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
    FROM unnest(codes) AS x
  );
END;
$$;

CREATE OR REPLACE FUNCTION billing.current_user_granted_vertical_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, billing
SET row_security = off
AS $$
  SELECT COALESCE(array_agg(v.code ORDER BY v.sort_order), ARRAY[]::text[])
  FROM billing.user_vertical_grant g
  JOIN billing.vertical v ON v.id = g.vertical_id
  WHERE g.user_id = auth.uid()
    AND v.is_active;
$$;

CREATE OR REPLACE FUNCTION billing.current_user_can_access_vertical(p_vertical_raw text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, billing
SET row_security = off
AS $$
DECLARE
  code text;
BEGIN
  IF billing.current_user_is_billing_super() THEN
    RETURN true;
  END IF;

  -- Must still have schema-level billing access.
  IF NOT billing.current_user_has_billing_access() THEN
    RETURN false;
  END IF;

  code := billing.normalize_vertical_code(p_vertical_raw);
  IF code IS NULL OR code = '' THEN
    -- Rows with unknown/empty vertical: allow only if user has any grant or implied access.
    RETURN cardinality(billing.current_user_granted_vertical_codes()) > 0
        OR cardinality(billing.current_user_implied_vertical_codes()) > 0;
  END IF;

  IF code = ANY (billing.current_user_granted_vertical_codes()) THEN
    RETURN true;
  END IF;

  IF code = ANY (billing.current_user_implied_vertical_codes()) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION billing.current_user_can_access_po_id(p_po_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, billing
SET row_security = off
AS $$
DECLARE
  v text;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN billing.current_user_is_billing_super()
        OR cardinality(billing.current_user_granted_vertical_codes()) > 0
        OR cardinality(billing.current_user_implied_vertical_codes()) > 0;
  END IF;

  IF billing.current_user_is_billing_super() THEN
    RETURN true;
  END IF;

  IF NOT billing.current_user_has_billing_access() THEN
    RETURN false;
  END IF;

  SELECT vertical INTO v FROM billing.po_wo WHERE id = p_po_id;
  IF NOT FOUND THEN
    -- Parent missing: deny for non-super (avoid leaking orphan children).
    RETURN false;
  END IF;

  RETURN billing.current_user_can_access_vertical(v);
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin / self RPCs (single source of truth for UI + seed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION billing.is_profile_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid
      AND (
        p.role IN ('super_admin', 'super_admin_pro', 'admin')
        OR lower(btrim(COALESCE(p.role, ''))) IN ('superadmin', 'superadmin_pro')
      )
  );
$$;

CREATE OR REPLACE FUNCTION billing.list_verticals()
RETURNS TABLE (
  id uuid,
  code text,
  label text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = billing
AS $$
  SELECT v.id, v.code, v.label, v.sort_order
  FROM billing.vertical v
  WHERE v.is_active
  ORDER BY v.sort_order, v.label;
$$;

CREATE OR REPLACE FUNCTION billing.list_my_vertical_grants()
RETURNS TABLE (
  grant_id uuid,
  vertical_id uuid,
  code text,
  label text,
  source text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = billing
AS $$
  SELECT g.id, v.id, v.code, v.label, g.source, g.created_at
  FROM billing.user_vertical_grant g
  JOIN billing.vertical v ON v.id = g.vertical_id
  WHERE g.user_id = auth.uid()
    AND v.is_active
  ORDER BY v.sort_order, v.label;
$$;

CREATE OR REPLACE FUNCTION billing.admin_list_user_vertical_grants(p_user_id uuid)
RETURNS TABLE (
  grant_id uuid,
  vertical_id uuid,
  code text,
  label text,
  source text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, billing
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT billing.is_profile_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can list vertical grants for other users'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, v.id, v.code, v.label, g.source, g.created_at
  FROM billing.user_vertical_grant g
  JOIN billing.vertical v ON v.id = g.vertical_id
  WHERE g.user_id = p_user_id
    AND v.is_active
  ORDER BY v.sort_order, v.label;
END;
$$;

CREATE OR REPLACE FUNCTION billing.admin_grant_user_vertical(
  p_user_id uuid,
  p_vertical_code text,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing
SET row_security = off
AS $$
DECLARE
  v_id uuid;
  v_code text;
  src text;
  g billing.user_vertical_grant%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT billing.is_profile_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can grant billing verticals'
      USING ERRCODE = '42501';
  END IF;

  v_code := billing.normalize_vertical_code(p_vertical_code);
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Unknown billing vertical: %', p_vertical_code;
  END IF;

  SELECT v.id INTO v_id
  FROM billing.vertical v
  WHERE v.code = v_code AND v.is_active;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Unknown billing vertical: %', p_vertical_code;
  END IF;

  src := CASE WHEN lower(btrim(COALESCE(p_source, 'manual'))) = 'default' THEN 'default' ELSE 'manual' END;

  INSERT INTO billing.user_vertical_grant (user_id, vertical_id, source, granted_by)
  VALUES (p_user_id, v_id, src, auth.uid())
  ON CONFLICT (user_id, vertical_id) DO UPDATE
    SET updated_at = now(),
        -- Keep original source if already present; only bump audit timestamp.
        granted_by = COALESCE(billing.user_vertical_grant.granted_by, EXCLUDED.granted_by)
  RETURNING * INTO g;

  RETURN jsonb_build_object(
    'grant_id', g.id,
    'user_id', g.user_id,
    'vertical_id', g.vertical_id,
    'code', v_code,
    'source', g.source
  );
END;
$$;

CREATE OR REPLACE FUNCTION billing.admin_revoke_user_vertical(
  p_user_id uuid,
  p_vertical_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing
SET row_security = off
AS $$
DECLARE
  v_code text;
  v_id uuid;
  deleted_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT billing.is_profile_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can revoke billing verticals'
      USING ERRCODE = '42501';
  END IF;

  v_code := billing.normalize_vertical_code(p_vertical_code);
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Unknown billing vertical: %', p_vertical_code;
  END IF;

  SELECT v.id INTO v_id
  FROM billing.vertical v
  WHERE v.code = v_code;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'removed', false, 'code', v_code);
  END IF;

  DELETE FROM billing.user_vertical_grant
  WHERE user_id = p_user_id AND vertical_id = v_id
  RETURNING id INTO deleted_id;

  RETURN jsonb_build_object(
    'ok', true,
    'removed', deleted_id IS NOT NULL,
    'code', v_code
  );
END;
$$;

-- Seed team defaults only when the user currently has zero grants.
CREATE OR REPLACE FUNCTION billing.admin_seed_default_vertical_grants(
  p_user_id uuid,
  p_team text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing
SET row_security = off
AS $$
DECLARE
  team_val text;
  codes text[];
  v_code text;
  inserted int := 0;
  existing int;
BEGIN
  IF auth.uid() IS NULL OR NOT billing.is_profile_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can seed billing vertical grants'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int INTO existing
  FROM billing.user_vertical_grant
  WHERE user_id = p_user_id;

  IF existing > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'seeded', false,
      'reason', 'already_has_grants',
      'existing', existing
    );
  END IF;

  IF p_team IS NULL THEN
    SELECT team INTO team_val FROM public.profiles WHERE id = p_user_id;
  ELSE
    team_val := p_team;
  END IF;

  codes := billing.default_vertical_codes_for_team(team_val);

  FOREACH v_code IN ARRAY codes LOOP
    PERFORM billing.admin_grant_user_vertical(p_user_id, v_code, 'default');
    inserted := inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'seeded', true,
    'team', team_val,
    'codes', to_jsonb(codes),
    'inserted', inserted
  );
END;
$$;

-- Profile has billing module (full or sub) — used by backfill / app.
CREATE OR REPLACE FUNCTION billing.profile_has_billing_module(p public.profiles)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF lower(btrim(COALESCE(p.team, ''))) IN ('billing', 'tracking') THEN
    RETURN true;
  END IF;
  RETURN billing.profile_has_module_prefix(p, ARRAY['billing', 'tracking']);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS policies on grant tables + tighten data policies by vertical
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE billing.vertical ENABLE ROW LEVEL SECURITY;
  ALTER TABLE billing.user_vertical_grant ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS billing_vertical_select ON billing.vertical;
  CREATE POLICY billing_vertical_select ON billing.vertical
    FOR SELECT TO authenticated
    USING (is_active OR billing.current_user_is_billing_super());

  DROP POLICY IF EXISTS billing_user_vertical_grant_select_own ON billing.user_vertical_grant;
  CREATE POLICY billing_user_vertical_grant_select_own ON billing.user_vertical_grant
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR billing.is_profile_admin(auth.uid())
    );

  -- Mutations go through SECURITY DEFINER RPCs (no direct insert/update/delete for authenticated).
END $$;

-- Replace billing data policies with vertical-aware checks.
DO $$
BEGIN
  DROP POLICY IF EXISTS billing_access_po_wo ON billing.po_wo;
  DROP POLICY IF EXISTS "billing_access_po_wo" ON billing.po_wo;
  CREATE POLICY billing_access_po_wo ON billing.po_wo
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_vertical(vertical)
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_vertical(vertical)
    );

  DROP POLICY IF EXISTS billing_access_po_rate_category ON billing.po_rate_category;
  DROP POLICY IF EXISTS "billing_access_po_rate_category" ON billing.po_rate_category;
  CREATE POLICY billing_access_po_rate_category ON billing.po_rate_category
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(po_id)
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(po_id)
    );

  DROP POLICY IF EXISTS billing_access_po_contact_log ON billing.po_contact_log;
  DROP POLICY IF EXISTS "billing_access_po_contact_log" ON billing.po_contact_log;
  CREATE POLICY billing_access_po_contact_log ON billing.po_contact_log
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(po_id)
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(po_id)
    );

  DROP POLICY IF EXISTS billing_access_invoice ON billing.invoice;
  DROP POLICY IF EXISTS "billing_access_invoice" ON billing.invoice;
  CREATE POLICY billing_access_invoice ON billing.invoice
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(po_id)
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(po_id)
    );

  DROP POLICY IF EXISTS billing_access_invoice_line_item ON billing.invoice_line_item;
  DROP POLICY IF EXISTS "billing_access_invoice_line_item" ON billing.invoice_line_item;
  CREATE POLICY billing_access_invoice_line_item ON billing.invoice_line_item
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND EXISTS (
        SELECT 1 FROM billing.invoice i
        WHERE i.id = invoice_id
          AND billing.current_user_can_access_po_id(i.po_id)
      )
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND EXISTS (
        SELECT 1 FROM billing.invoice i
        WHERE i.id = invoice_id
          AND billing.current_user_can_access_po_id(i.po_id)
      )
    );

  DROP POLICY IF EXISTS billing_access_invoice_attachment ON billing.invoice_attachment;
  DROP POLICY IF EXISTS "billing_access_invoice_attachment" ON billing.invoice_attachment;
  CREATE POLICY billing_access_invoice_attachment ON billing.invoice_attachment
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND EXISTS (
        SELECT 1 FROM billing.invoice i
        WHERE i.id = invoice_id
          AND billing.current_user_can_access_po_id(i.po_id)
      )
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND EXISTS (
        SELECT 1 FROM billing.invoice i
        WHERE i.id = invoice_id
          AND billing.current_user_can_access_po_id(i.po_id)
      )
    );

  DROP POLICY IF EXISTS billing_access_credit_debit_note ON billing.credit_debit_note;
  DROP POLICY IF EXISTS "billing_access_credit_debit_note" ON billing.credit_debit_note;
  CREATE POLICY billing_access_credit_debit_note ON billing.credit_debit_note
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND (
        parent_invoice_id IS NULL
        OR EXISTS (
          SELECT 1 FROM billing.invoice i
          WHERE i.id = parent_invoice_id
            AND billing.current_user_can_access_po_id(i.po_id)
        )
      )
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND (
        parent_invoice_id IS NULL
        OR EXISTS (
          SELECT 1 FROM billing.invoice i
          WHERE i.id = parent_invoice_id
            AND billing.current_user_can_access_po_id(i.po_id)
        )
      )
    );

  DROP POLICY IF EXISTS billing_access_payment_advice ON billing.payment_advice;
  DROP POLICY IF EXISTS "billing_access_payment_advice" ON billing.payment_advice;
  CREATE POLICY billing_access_payment_advice ON billing.payment_advice
    FOR ALL TO authenticated
    USING (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(
        (SELECT i.po_id FROM billing.invoice i WHERE i.id = invoice_id)
      )
    )
    WITH CHECK (
      billing.current_user_has_billing_access()
      AND billing.current_user_can_access_po_id(
        (SELECT i.po_id FROM billing.invoice i WHERE i.id = invoice_id)
      )
    );
END $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA billing TO authenticated;
GRANT SELECT ON billing.vertical TO authenticated;
GRANT SELECT ON billing.user_vertical_grant TO authenticated;

GRANT EXECUTE ON FUNCTION billing.normalize_vertical_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.default_vertical_codes_for_team(text) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.current_user_is_billing_super() TO authenticated;
GRANT EXECUTE ON FUNCTION billing.current_user_implied_vertical_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION billing.current_user_granted_vertical_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION billing.current_user_can_access_vertical(text) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.current_user_can_access_po_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.list_verticals() TO authenticated;
GRANT EXECUTE ON FUNCTION billing.list_my_vertical_grants() TO authenticated;
GRANT EXECUTE ON FUNCTION billing.admin_list_user_vertical_grants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.admin_grant_user_vertical(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.admin_revoke_user_vertical(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.admin_seed_default_vertical_grants(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION billing.is_profile_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: seed defaults for users who already have Billing module access
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r public.profiles%ROWTYPE;
  codes text[];
  v_code text;
  v_id uuid;
  existing int;
BEGIN
  IF to_regclass('billing.user_vertical_grant') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM public.profiles LOOP
    IF NOT billing.profile_has_billing_module(r) THEN
      CONTINUE;
    END IF;

    SELECT count(*)::int INTO existing
    FROM billing.user_vertical_grant g
    WHERE g.user_id = r.id;

    IF existing > 0 THEN
      CONTINUE;
    END IF;

    codes := billing.default_vertical_codes_for_team(r.team);
    -- Billing team with empty map still gets nothing; Finance/Billing/Management mapped above.
    -- If team unmapped but they have billing module, leave empty (admin must assign).
    FOREACH v_code IN ARRAY codes LOOP
      SELECT v.id INTO v_id
      FROM billing.vertical v
      WHERE v.code = v_code;
      IF v_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO billing.user_vertical_grant (user_id, vertical_id, source, granted_by)
      VALUES (r.id, v_id, 'default', NULL)
      ON CONFLICT (user_id, vertical_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

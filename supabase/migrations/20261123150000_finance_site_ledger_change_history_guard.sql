-- Site Ledger (P&L) — change history + guard against stale-tab component wipes.
--
-- Background (incident 2026-11, components disappearing from P&L sites):
--   Site Setup used to call finance.replace_site_structure with the browser's whole copy of a
--   site. A tab opened before another user's edit deleted that user's components; browser
--   activity-log rows only said "replaced finance site structure", with no before/after.
--
-- This migration:
--   1. finance.ledger_change_history — row-level before/after for setup tables, stamped with
--      the real database actor (auth.uid() / JWT email). Rows written without an end-user
--      JWT (SQL editor, service role, cron) are flagged actor_kind = 'system'.
--   2. finance.replace_site_structure becomes NON-DESTRUCTIVE: it still inserts/updates the
--      rows it is given, but refuses to delete rows that are missing from the payload.
--      The fixed client no longer calls it for existing sites (it sends per-row changes);
--      this stops browser tabs still running the OLD bundle from wiping components — they
--      get an error asking them to reload instead.
--
-- No financial figures are changed by this migration.

CREATE TABLE IF NOT EXISTS finance.ledger_change_history (
  id            bigserial PRIMARY KEY,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  table_name    text        NOT NULL,
  operation     text        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  row_id        uuid,
  site_id       uuid,
  actor_user_id uuid,
  actor_email   text,
  actor_kind    text        NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'system')),
  old_row       jsonb,
  new_row       jsonb
);

CREATE INDEX IF NOT EXISTS idx_ledger_change_history_site_time
  ON finance.ledger_change_history (site_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_change_history_table_time
  ON finance.ledger_change_history (table_name, changed_at DESC);

COMMENT ON TABLE finance.ledger_change_history IS
  'Append-only before/after history of Site Ledger setup tables. actor_* come from the request JWT '
  '(auth.uid()), never from the browser. actor_kind=system means no end-user JWT (SQL editor, service role).';

CREATE OR REPLACE FUNCTION finance.ledger_change_history_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, auth
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_old   jsonb;
  v_new   jsonb;
  v_row   jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;

  -- Skip no-op updates (same values written again) so history stays meaningful.
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
    RETURN NULL;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_email := nullif(auth.jwt() ->> 'email', '');
  END IF;
  v_row := coalesce(v_new, v_old);

  INSERT INTO finance.ledger_change_history (
    table_name, operation, row_id, site_id,
    actor_user_id, actor_email, actor_kind, old_row, new_row
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    nullif(v_row ->> 'id', '')::uuid,
    CASE
      WHEN TG_TABLE_NAME = 'sites' THEN nullif(v_row ->> 'id', '')::uuid
      ELSE nullif(v_row ->> 'site_id', '')::uuid
    END,
    v_uid,
    v_email,
    CASE WHEN v_uid IS NULL THEN 'system' ELSE 'user' END,
    v_old,
    v_new
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION finance.ledger_change_history_capture() FROM public, anon, authenticated;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'sites',
    'site_expense_structure',
    'expense_parent_heads',
    'expense_child_heads',
    'cost_allocations',
    'budget_versions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ledger_change_history ON finance.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER ledger_change_history AFTER INSERT OR UPDATE OR DELETE ON finance.%I
         FOR EACH ROW EXECUTE FUNCTION finance.ledger_change_history_capture()',
      tbl
    );
  END LOOP;
END
$$;

-- Read-only for finance admins through the API; written only by the trigger.
ALTER TABLE finance.ledger_change_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance.ledger_change_history FROM anon, authenticated;
GRANT SELECT ON finance.ledger_change_history TO authenticated;
DROP POLICY IF EXISTS ledger_change_history_read ON finance.ledger_change_history;
CREATE POLICY ledger_change_history_read ON finance.ledger_change_history
  FOR SELECT TO authenticated
  USING (finance.current_user_has_finance_admin());

-- 2. Non-destructive structure replace (old-bundle guard) -------------------------------
CREATE OR REPLACE FUNCTION finance.replace_site_structure(
  p_site_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = finance
AS $$
DECLARE
  v_rows      jsonb := COALESCE(p_rows, '[]'::jsonb);
  v_expected  integer;
  v_missing   integer;
  v_actual    integer;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'replace_site_structure: site_id is required';
  END IF;
  v_expected := COALESCE(jsonb_array_length(v_rows), 0);

  -- Rows in the database that this payload would delete.
  SELECT COUNT(*)::integer INTO v_missing
  FROM finance.site_expense_structure s
  WHERE s.site_id = p_site_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_rows) e
      WHERE (e ->> 'child_head_id')::uuid = s.child_head_id
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION
      'This page is out of date: saving would remove % component(s) from the site that are not on your screen. Reload Site Ledger (Ctrl+F5) and make the change again.',
      v_missing
      USING ERRCODE = 'P0409';
  END IF;

  INSERT INTO finance.site_expense_structure (site_id, parent_head_id, child_head_id, sort_order)
  SELECT
    p_site_id,
    (elem ->> 'parent_head_id')::uuid,
    (elem ->> 'child_head_id')::uuid,
    COALESCE((elem ->> 'sort_order')::integer, 0)
  FROM jsonb_array_elements(v_rows) AS elem
  ON CONFLICT (site_id, child_head_id) DO UPDATE
    SET parent_head_id = EXCLUDED.parent_head_id,
        sort_order     = EXCLUDED.sort_order;

  SELECT COUNT(*)::integer INTO v_actual
  FROM finance.site_expense_structure
  WHERE site_id = p_site_id;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'replace_site_structure: expected % rows after save, found %',
      v_expected, v_actual;
  END IF;

  RETURN v_actual;
END;
$$;

COMMENT ON FUNCTION finance.replace_site_structure(uuid, jsonb) IS
  'Upsert-only since 2026-11-23: refuses to delete components missing from the payload (stale browser tab guard).';

-- Atomic replace helpers for Site Ledger delete+insert writes.
-- Prevents data loss when a client-side delete commits but the following insert
-- fails or writes fewer rows than expected.

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
  v_expected integer;
  v_actual integer;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'replace_site_structure: site_id is required';
  END IF;

  v_expected := COALESCE(jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)), 0);

  DELETE FROM finance.site_expense_structure
  WHERE site_id = p_site_id;

  IF v_expected > 0 THEN
    INSERT INTO finance.site_expense_structure (
      site_id,
      parent_head_id,
      child_head_id,
      sort_order
    )
    SELECT
      p_site_id,
      (elem->>'parent_head_id')::uuid,
      (elem->>'child_head_id')::uuid,
      COALESCE((elem->>'sort_order')::integer, 0)
    FROM jsonb_array_elements(p_rows) AS elem;
  END IF;

  SELECT COUNT(*)::integer INTO v_actual
  FROM finance.site_expense_structure
  WHERE site_id = p_site_id;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'replace_site_structure: expected % rows after replace, found %',
      v_expected, v_actual;
  END IF;

  RETURN v_actual;
END;
$$;

CREATE OR REPLACE FUNCTION finance.replace_budget_lines(
  p_budget_version_id uuid,
  p_revenue_rows jsonb,
  p_expense_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = finance
AS $$
DECLARE
  v_expected_rev integer;
  v_expected_exp integer;
  v_actual_rev integer;
  v_actual_exp integer;
BEGIN
  IF p_budget_version_id IS NULL THEN
    RAISE EXCEPTION 'replace_budget_lines: budget_version_id is required';
  END IF;

  v_expected_rev := COALESCE(jsonb_array_length(COALESCE(p_revenue_rows, '[]'::jsonb)), 0);
  v_expected_exp := COALESCE(jsonb_array_length(COALESCE(p_expense_rows, '[]'::jsonb)), 0);

  DELETE FROM finance.budget_revenue_lines
  WHERE budget_version_id = p_budget_version_id;

  DELETE FROM finance.budget_expense_lines
  WHERE budget_version_id = p_budget_version_id;

  IF v_expected_rev > 0 THEN
    INSERT INTO finance.budget_revenue_lines (
      budget_version_id,
      revenue_head_id,
      amount
    )
    SELECT
      p_budget_version_id,
      (elem->>'revenue_head_id')::uuid,
      COALESCE((elem->>'amount')::numeric, 0)
    FROM jsonb_array_elements(p_revenue_rows) AS elem;
  END IF;

  IF v_expected_exp > 0 THEN
    INSERT INTO finance.budget_expense_lines (
      budget_version_id,
      child_head_id,
      amount
    )
    SELECT
      p_budget_version_id,
      (elem->>'child_head_id')::uuid,
      COALESCE((elem->>'amount')::numeric, 0)
    FROM jsonb_array_elements(p_expense_rows) AS elem;
  END IF;

  SELECT COUNT(*)::integer INTO v_actual_rev
  FROM finance.budget_revenue_lines
  WHERE budget_version_id = p_budget_version_id;

  SELECT COUNT(*)::integer INTO v_actual_exp
  FROM finance.budget_expense_lines
  WHERE budget_version_id = p_budget_version_id;

  IF v_actual_rev IS DISTINCT FROM v_expected_rev
     OR v_actual_exp IS DISTINCT FROM v_expected_exp THEN
    RAISE EXCEPTION
      'replace_budget_lines: expected revenue=% expense=%, found revenue=% expense=%',
      v_expected_rev, v_expected_exp, v_actual_rev, v_actual_exp;
  END IF;

  RETURN v_actual_rev + v_actual_exp;
END;
$$;

CREATE OR REPLACE FUNCTION finance.replace_period_entry_lines(
  p_period_entry_id uuid,
  p_revenue_rows jsonb,
  p_expense_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = finance
AS $$
DECLARE
  v_expected_rev integer;
  v_expected_exp integer;
  v_actual_rev integer;
  v_actual_exp integer;
BEGIN
  IF p_period_entry_id IS NULL THEN
    RAISE EXCEPTION 'replace_period_entry_lines: period_entry_id is required';
  END IF;

  v_expected_rev := COALESCE(jsonb_array_length(COALESCE(p_revenue_rows, '[]'::jsonb)), 0);
  v_expected_exp := COALESCE(jsonb_array_length(COALESCE(p_expense_rows, '[]'::jsonb)), 0);

  DELETE FROM finance.revenue_entry_lines
  WHERE period_entry_id = p_period_entry_id;

  DELETE FROM finance.expense_entry_lines
  WHERE period_entry_id = p_period_entry_id;

  IF v_expected_rev > 0 THEN
    INSERT INTO finance.revenue_entry_lines (
      period_entry_id,
      revenue_head_id,
      amount
    )
    SELECT
      p_period_entry_id,
      (elem->>'revenue_head_id')::uuid,
      COALESCE((elem->>'amount')::numeric, 0)
    FROM jsonb_array_elements(p_revenue_rows) AS elem;
  END IF;

  IF v_expected_exp > 0 THEN
    INSERT INTO finance.expense_entry_lines (
      period_entry_id,
      child_head_id,
      amount
    )
    SELECT
      p_period_entry_id,
      (elem->>'child_head_id')::uuid,
      COALESCE((elem->>'amount')::numeric, 0)
    FROM jsonb_array_elements(p_expense_rows) AS elem;
  END IF;

  SELECT COUNT(*)::integer INTO v_actual_rev
  FROM finance.revenue_entry_lines
  WHERE period_entry_id = p_period_entry_id;

  SELECT COUNT(*)::integer INTO v_actual_exp
  FROM finance.expense_entry_lines
  WHERE period_entry_id = p_period_entry_id;

  IF v_actual_rev IS DISTINCT FROM v_expected_rev
     OR v_actual_exp IS DISTINCT FROM v_expected_exp THEN
    RAISE EXCEPTION
      'replace_period_entry_lines: expected revenue=% expense=%, found revenue=% expense=%',
      v_expected_rev, v_expected_exp, v_actual_rev, v_actual_exp;
  END IF;

  RETURN v_actual_rev + v_actual_exp;
END;
$$;

GRANT EXECUTE ON FUNCTION finance.replace_site_structure(uuid, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.replace_budget_lines(uuid, jsonb, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.replace_period_entry_lines(uuid, jsonb, jsonb)
  TO authenticated, service_role;

-- =============================================================================
-- Finance P&L: Super Admin must have full SELECT/DML on finance tables.
--
-- PnL was returning HTTP 403 on finance.revenue_entry_lines (and related tables)
-- when the signed-in user is Super Admin but finance.current_user_has_finance_admin()
-- did not recognise their role spelling / could not execute the helper.
--
-- Fix:
--   1) Short-circuit on public.is_current_user_admin() (normalized super_admin*).
--   2) Use public.normalize_erp_role() for remaining role checks.
--   3) GRANT EXECUTE on finance RLS helpers to authenticated.
--   4) Re-assert finance_*_admin policies (unchanged manager policies).
-- Does not change app/UI logic or mutate finance data rows.
-- =============================================================================

CREATE OR REPLACE FUNCTION finance.current_user_has_finance_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  -- Super Admin / Super Admin Pro (all stored spellings via is_current_user_admin).
  IF public.is_current_user_admin() THEN
    RETURN true;
  END IF;

  -- Module / sub-module grants (finance, finance.pl, finance.pl.fire, …).
  IF public.current_user_can_access_module('finance') THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        public.normalize_erp_role(p.role) = 'admin'
        OR lower(btrim(coalesce(p.team, ''))) IN ('finance', 'finance/accounts')
        OR (p.allowed_modules IS NOT NULL AND p.allowed_modules @> '"finance"'::jsonb)
      )
  ) THEN
    RETURN true;
  END IF;

  -- No profile row yet (bootstrap) — allow so first login is not locked out.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IS NULL
      AND p.team IS NULL
      AND (p.allowed_modules IS NULL OR p.allowed_modules = '[]'::jsonb)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION finance.current_user_has_finance_admin() IS
  'True for Super Admin*, Finance team/module/sub-module grants, or unset bootstrap profiles.';

-- Callers need EXECUTE on helpers used inside RLS policies.
GRANT USAGE ON SCHEMA finance TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.current_user_has_finance_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finance.current_user_can_access_site(uuid) TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO authenticated, service_role;

-- Re-assert admin policies so Super Admin path cannot be missing on any finance table.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settings',
    'revenue_heads',
    'expense_parent_heads',
    'expense_child_heads',
    'user_site_access',
    'import_export_logs',
    'sites',
    'site_expense_structure',
    'budget_versions',
    'budget_revenue_lines',
    'budget_expense_lines',
    'period_entries',
    'revenue_entry_lines',
    'expense_entry_lines',
    'cost_allocations'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS finance_%s_admin ON finance.%s', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY finance_%s_admin ON finance.%s
         FOR ALL TO authenticated
         USING (finance.current_user_has_finance_admin())
         WITH CHECK (finance.current_user_has_finance_admin())',
      tbl, tbl
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

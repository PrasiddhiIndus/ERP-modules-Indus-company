-- =============================================================================
-- Finance P&L: RLS must honour User Management sub-module grants.
--
-- Bug: finance.current_user_has_finance_admin() only checked
--   team = 'finance' OR allowed_modules @> '"finance"'
-- so users with allowed_sub_modules like "finance.pl" / "finance.pl.fire"
-- could open the P&L UI but loaded zero sites / heads (RLS filtered everything).
--
-- Fix: also grant when public.current_user_can_access_module('finance') is true
-- (covers allowed_modules, allowed_sub_modules parent key, and mapped team).
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
  -- Prefer shared module gate (role / team / allowed_modules / allowed_sub_modules).
  IF public.current_user_can_access_module('finance') THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR lower(btrim(coalesce(p.team, ''))) IN ('finance', 'finance/accounts')
        OR (p.allowed_modules IS NOT NULL AND p.allowed_modules @> '"finance"'::jsonb)
      )
  ) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN
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
  'True for Super Admin, Finance team/module, or finance.* sub-module grants (e.g. finance.pl).';

NOTIFY pgrst, 'reload schema';

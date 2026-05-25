-- Module-scoped roles: Team and Extra modules grant the same read/edit backend access.
-- Managers can approve selected-module workflows in the app; executives can edit but not approve.

CREATE OR REPLACE FUNCTION public.current_user_has_fire_tender_shared_catalog_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.team = 'fireTender'
          OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'fireTender'
          OR p.role IN ('super_admin', 'super_admin_pro')
        )
    );
$$;

COMMENT ON FUNCTION public.current_user_has_fire_tender_shared_catalog_access() IS
  'RLS helper: Fire Tender shared catalog - team/extra module fireTender, super admins, or no profiles row (legacy).';

CREATE OR REPLACE FUNCTION public.is_current_user_software_subscriptions_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('super_admin', 'super_admin_pro')
        OR p.team = 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
      )
  );
$$;

COMMENT ON FUNCTION public.is_current_user_software_subscriptions_editor() IS
  'Super Admin tiers or IT/IS team/extra module (profiles.team/allowed_modules = itIs) may manage software_subscriptions.';

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
  -- Super admins always have access.
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  ) INTO has_access;
  IF has_access THEN RETURN true; END IF;

  -- Executives/managers get Billing only when Billing/Commercial is their Team or Extra module.
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'billing')
        OR p.team IN ('billing', 'commercial', 'commercialMt', 'commercialRm')
        OR (
          p.allowed_modules IS NOT NULL
          AND (
            p.allowed_modules @> '"billing"'::jsonb
            OR p.allowed_modules @> '"commercialMt"'::jsonb
            OR p.allowed_modules @> '"commercialRm"'::jsonb
            OR p.allowed_modules @> '"commercial"'::jsonb
          )
        )
      )
  ) INTO has_access;
  IF has_access THEN RETURN true; END IF;

  -- Allow when profile isn't set up yet (bootstrap environments).
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RETURN true;
  END IF;

  -- Legacy allow: profile exists but role/team unset and no modules.
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
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

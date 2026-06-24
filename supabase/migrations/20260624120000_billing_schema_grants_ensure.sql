-- Ensure authenticated clients can reach billing.po_wo (Commercial PO Entry + Billing).
-- Without USAGE on schema billing, PostgREST returns: permission denied for schema billing.
-- Also re-apply commercial module access on billing RLS helper (idempotent).

CREATE SCHEMA IF NOT EXISTS billing;

GRANT USAGE ON SCHEMA billing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA billing TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA billing
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Refresh billing access helper (includes commercialMt / commercialRm teams).
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
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'super_admin_pro')
  ) INTO has_access;
  IF has_access THEN RETURN true; END IF;

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

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RETURN true;
  END IF;

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

GRANT EXECUTE ON FUNCTION billing.current_user_has_billing_access() TO authenticated;

-- Software subscriptions: drop legacy editor policies and align access with User Management grants.
-- Ensures anyone with IT/IS module or itIs.subscriptions gets full SELECT/INSERT/UPDATE/DELETE
-- (view, update, delete) consistently — fixing intermittent RLS denials for authorized accounts.

CREATE OR REPLACE FUNCTION public.current_user_has_software_subscriptions_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        -- Super Admin (normalized)
        replace(lower(btrim(coalesce(p.role, ''))), ' ', '_') IN (
          'super_admin',
          'super_admin_pro',
          'superadmin',
          'superadmin_pro'
        )
        -- IT/IS team labels (UI + Employee Master)
        OR lower(btrim(coalesce(p.team, ''))) IN (
          'itis',
          'it_is',
          'it/is',
          'it-is',
          'it',
          'is',
          'information system',
          'information systems'
        )
        -- Full module grant (camelCase or lower)
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'softwareSubscriptions'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_modules, '[]'::jsonb)) m(val)
          WHERE lower(btrim(m.val)) IN (
            'itis',
            'it_is',
            'it/is',
            'softwaresubscriptions',
            'software_subscriptions'
          )
        )
        -- Sub-module grant from User Management (itIs.subscriptions, etc.)
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE
            lower(btrim(s.val)) IN (
              'itis.subscriptions',
              'itis',
              'softwaresubscriptions',
              'software_subscriptions'
            )
            OR lower(btrim(s.val)) LIKE 'itis.%'
            OR lower(btrim(s.val)) LIKE 'softwaresubscriptions.%'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_software_subscriptions_access() IS
  'RLS helper: software_subscriptions full CRUD for Super Admin, IT/IS team, itIs module, or itIs.subscriptions.';

-- Keep legacy helper in sync (any leftover policy names)
CREATE OR REPLACE FUNCTION public.is_current_user_software_subscriptions_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.current_user_has_software_subscriptions_access();
$$;

COMMENT ON FUNCTION public.is_current_user_software_subscriptions_editor() IS
  'Deprecated alias — delegates to current_user_has_software_subscriptions_access().';

GRANT EXECUTE ON FUNCTION public.current_user_has_software_subscriptions_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_software_subscriptions_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_software_subscriptions_editor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_software_subscriptions_editor() TO service_role;

-- Drop ALL prior policy names (super_admin / editor / access) then recreate access policies
DROP POLICY IF EXISTS "software_subscriptions_select_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_insert_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_update_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_delete_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_select_editor" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_insert_editor" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_update_editor" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_delete_editor" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_select_access" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_insert_access" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_update_access" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_delete_access" ON public.software_subscriptions;

CREATE POLICY "software_subscriptions_select_access"
  ON public.software_subscriptions FOR SELECT
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscriptions_insert_access"
  ON public.software_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscriptions_update_access"
  ON public.software_subscriptions FOR UPDATE
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access())
  WITH CHECK (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscriptions_delete_access"
  ON public.software_subscriptions FOR DELETE
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access());

-- Invoice file metadata
DROP POLICY IF EXISTS "software_subscription_invoice_files_select_admin" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_insert_admin" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_delete_admin" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_select_editor" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_insert_editor" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_delete_editor" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_select_access" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_insert_access" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_update_access" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_delete_access" ON public.software_subscription_invoice_files;

CREATE POLICY "software_subscription_invoice_files_select_access"
  ON public.software_subscription_invoice_files FOR SELECT
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscription_invoice_files_insert_access"
  ON public.software_subscription_invoice_files FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscription_invoice_files_update_access"
  ON public.software_subscription_invoice_files FOR UPDATE
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access())
  WITH CHECK (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscription_invoice_files_delete_access"
  ON public.software_subscription_invoice_files FOR DELETE
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access());

-- Storage bucket
DROP POLICY IF EXISTS "software_subscription_invoices_select_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_insert_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_update_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_delete_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_select_editor" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_insert_editor" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_update_editor" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_delete_editor" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_select_access" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_insert_access" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_update_access" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_delete_access" ON storage.objects;

CREATE POLICY "software_subscription_invoices_select_access"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'software-subscription-invoices'
    AND public.current_user_has_software_subscriptions_access()
  );

CREATE POLICY "software_subscription_invoices_insert_access"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'software-subscription-invoices'
    AND public.current_user_has_software_subscriptions_access()
  );

CREATE POLICY "software_subscription_invoices_update_access"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'software-subscription-invoices'
    AND public.current_user_has_software_subscriptions_access()
  )
  WITH CHECK (
    bucket_id = 'software-subscription-invoices'
    AND public.current_user_has_software_subscriptions_access()
  );

CREATE POLICY "software_subscription_invoices_delete_access"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'software-subscription-invoices'
    AND public.current_user_has_software_subscriptions_access()
  );

-- Software subscriptions: allow Super Admin and IT/IS module users (matches UI + R2 API).
-- Previous policies used only is_current_user_admin() (super_admin / super_admin_pro),
-- so IT/IS accounts that land on this page got permission errors.

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
        -- IT/IS team labels
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
        -- Full module grant
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itIs'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'itis'
        OR COALESCE(p.allowed_modules, '[]'::jsonb) ? 'softwareSubscriptions'
        -- Sub-module grant (itIs.subscriptions, etc.)
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(p.allowed_sub_modules, '[]'::jsonb)) s(val)
          WHERE lower(btrim(s.val)) IN (
              'itis.subscriptions',
              'itis',
              'softwaresubscriptions'
            )
            OR lower(btrim(s.val)) LIKE 'itis.%'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.current_user_has_software_subscriptions_access() IS
  'RLS helper: software_subscriptions — Super Admin or IT/IS team/module (aligned with UI and R2 API).';

GRANT EXECUTE ON FUNCTION public.current_user_has_software_subscriptions_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_software_subscriptions_access() TO service_role;

-- software_subscriptions
DROP POLICY IF EXISTS "software_subscriptions_select_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_insert_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_update_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_delete_super_admin" ON public.software_subscriptions;
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

-- invoice file metadata table
DROP POLICY IF EXISTS "software_subscription_invoice_files_select_admin" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_insert_admin" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_delete_admin" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_select_access" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_insert_access" ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_delete_access" ON public.software_subscription_invoice_files;

CREATE POLICY "software_subscription_invoice_files_select_access"
  ON public.software_subscription_invoice_files FOR SELECT
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscription_invoice_files_insert_access"
  ON public.software_subscription_invoice_files FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_software_subscriptions_access());

CREATE POLICY "software_subscription_invoice_files_delete_access"
  ON public.software_subscription_invoice_files FOR DELETE
  TO authenticated
  USING (public.current_user_has_software_subscriptions_access());

-- Storage bucket for legacy Supabase-hosted invoices
DROP POLICY IF EXISTS "software_subscription_invoices_select_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_insert_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_update_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_delete_super_admin" ON storage.objects;
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

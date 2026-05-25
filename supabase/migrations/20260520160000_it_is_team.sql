-- IT/IS team/extra module: software subscriptions + invoice storage

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

-- software_subscriptions table
DROP POLICY IF EXISTS "software_subscriptions_select_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_insert_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_update_super_admin" ON public.software_subscriptions;
DROP POLICY IF EXISTS "software_subscriptions_delete_super_admin" ON public.software_subscriptions;

CREATE POLICY "software_subscriptions_select_editor"
  ON public.software_subscriptions FOR SELECT
  TO authenticated
  USING (public.is_current_user_software_subscriptions_editor());

CREATE POLICY "software_subscriptions_insert_editor"
  ON public.software_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_user_software_subscriptions_editor());

CREATE POLICY "software_subscriptions_update_editor"
  ON public.software_subscriptions FOR UPDATE
  TO authenticated
  USING (public.is_current_user_software_subscriptions_editor())
  WITH CHECK (public.is_current_user_software_subscriptions_editor());

CREATE POLICY "software_subscriptions_delete_editor"
  ON public.software_subscriptions FOR DELETE
  TO authenticated
  USING (public.is_current_user_software_subscriptions_editor());

-- software_subscription_invoice_files
DROP POLICY IF EXISTS "software_subscription_invoice_files_select_admin"
  ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_insert_admin"
  ON public.software_subscription_invoice_files;
DROP POLICY IF EXISTS "software_subscription_invoice_files_delete_admin"
  ON public.software_subscription_invoice_files;

CREATE POLICY "software_subscription_invoice_files_select_editor"
  ON public.software_subscription_invoice_files FOR SELECT
  TO authenticated
  USING (public.is_current_user_software_subscriptions_editor());

CREATE POLICY "software_subscription_invoice_files_insert_editor"
  ON public.software_subscription_invoice_files FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_user_software_subscriptions_editor());

CREATE POLICY "software_subscription_invoice_files_delete_editor"
  ON public.software_subscription_invoice_files FOR DELETE
  TO authenticated
  USING (public.is_current_user_software_subscriptions_editor());

-- Storage bucket: software-subscription-invoices
DROP POLICY IF EXISTS "software_subscription_invoices_select_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_insert_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_update_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "software_subscription_invoices_delete_super_admin" ON storage.objects;

CREATE POLICY "software_subscription_invoices_select_editor"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'software-subscription-invoices'
    AND public.is_current_user_software_subscriptions_editor()
  );

CREATE POLICY "software_subscription_invoices_insert_editor"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'software-subscription-invoices'
    AND public.is_current_user_software_subscriptions_editor()
  );

CREATE POLICY "software_subscription_invoices_update_editor"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'software-subscription-invoices'
    AND public.is_current_user_software_subscriptions_editor()
  )
  WITH CHECK (
    bucket_id = 'software-subscription-invoices'
    AND public.is_current_user_software_subscriptions_editor()
  );

CREATE POLICY "software_subscription_invoices_delete_editor"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'software-subscription-invoices'
    AND public.is_current_user_software_subscriptions_editor()
  );

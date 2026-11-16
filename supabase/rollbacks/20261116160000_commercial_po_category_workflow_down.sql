-- Rollback for 20261116160000_commercial_po_category_workflow.sql (Commercial PO At Glance only).
-- After running this, re-run the "Header guard … digital sign-off" and "Save" sections of
-- 20261116120000_commercial_po_at_glance.sql to restore the previous cm_oc_signoff_stamp and cm_oc_save.
-- Sign-off rows of the new stages are deleted; the po_category column is dropped.

DROP FUNCTION IF EXISTS public.cm_oc_sign_stage(uuid, text);
DROP FUNCTION IF EXISTS public.cm_oc_signature_file(uuid, text);
DROP FUNCTION IF EXISTS public.cm_oc_user_signature(uuid);
DROP FUNCTION IF EXISTS public.cm_oc_stage_label(text);
DROP FUNCTION IF EXISTS public.cm_oc_category_stages(text);

ALTER TABLE public.cm_oc_signoff DISABLE TRIGGER cm_oc_signoff_stamp;
DELETE FROM public.cm_oc_signoff
 WHERE slot IN ('CREATOR', 'COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS', 'SAFETY_HEAD');
ALTER TABLE public.cm_oc_signoff ENABLE TRIGGER cm_oc_signoff_stamp;
DELETE FROM public.cm_oc_signoff_assignees
 WHERE slot IN ('COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS', 'SAFETY_HEAD');

ALTER TABLE public.cm_oc_signoff DROP CONSTRAINT IF EXISTS cm_oc_signoff_slot_check;
ALTER TABLE public.cm_oc_signoff ADD CONSTRAINT cm_oc_signoff_slot_check CHECK (slot IN (
  'VP_COMMERCIAL', 'BILLING', 'IR', 'SALARY', 'OPERATIONS', 'ADMIN', 'PNC', 'ACCOUNTS', 'ARUN', 'ATIN'
));
ALTER TABLE public.cm_oc_signoff_assignees DROP CONSTRAINT IF EXISTS cm_oc_signoff_assignees_slot_check;
ALTER TABLE public.cm_oc_signoff_assignees ADD CONSTRAINT cm_oc_signoff_assignees_slot_check CHECK (slot IN (
  'VP_COMMERCIAL', 'BILLING', 'IR', 'SALARY', 'OPERATIONS', 'ADMIN', 'PNC', 'ACCOUNTS', 'ARUN', 'ATIN'
));

ALTER TABLE public.cm_oc_master DROP CONSTRAINT IF EXISTS cm_oc_master_po_category_check;
ALTER TABLE public.cm_oc_master DROP COLUMN IF EXISTS po_category;

GRANT INSERT, UPDATE, DELETE ON public.cm_oc_signoff TO authenticated;
DROP POLICY IF EXISTS cm_oc_signoff_insert ON public.cm_oc_signoff;
CREATE POLICY cm_oc_signoff_insert ON public.cm_oc_signoff FOR INSERT TO authenticated
  WITH CHECK (public.cm_oc_current_user_has_access());
DROP POLICY IF EXISTS cm_oc_signoff_update ON public.cm_oc_signoff;
CREATE POLICY cm_oc_signoff_update ON public.cm_oc_signoff FOR UPDATE TO authenticated
  USING (public.cm_oc_current_user_has_access()) WITH CHECK (public.cm_oc_current_user_has_access());
DROP POLICY IF EXISTS cm_oc_signoff_delete ON public.cm_oc_signoff;
CREATE POLICY cm_oc_signoff_delete ON public.cm_oc_signoff FOR DELETE TO authenticated
  USING (public.cm_oc_current_user_has_access());

NOTIFY pgrst, 'reload schema';

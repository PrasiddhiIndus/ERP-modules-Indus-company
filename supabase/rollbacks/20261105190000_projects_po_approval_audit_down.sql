-- Rollback for 20261105190000_projects_po_approval_audit.sql.
-- Restores pj_oc_signoff_stamp to its 20261105170000 version, then drops the approval history.
-- WARNING: deletes the Projects PO At Glance approval / modification history.

CREATE OR REPLACE FUNCTION public.pj_oc_signoff_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_later text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_later := CASE OLD.slot
      WHEN 'PROJECT_USER' THEN 'PLANNING'
      WHEN 'PLANNING' THEN 'VERTICAL_HEAD'
      WHEN 'VERTICAL_HEAD' THEN 'FINANCE'
      ELSE NULL END;
    IF v_later IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pj_oc_signoff s
      WHERE s.oc_id = OLD.oc_id AND s.slot = v_later
    ) THEN
      RAISE EXCEPTION 'This stage cannot be removed while a later stage is approved.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pj_oc_master m WHERE m.id = OLD.oc_id) THEN
      PERFORM public.pj_oc_assert_can_sign(OLD.slot, OLD.oc_id);
    END IF;
    RETURN OLD;
  END IF;

  NEW.signed_by := btrim(NEW.signed_by);
  IF TG_OP = 'UPDATE' AND NEW.signed_by = OLD.signed_by AND NEW.slot = OLD.slot THEN
    NEW.signed_at := OLD.signed_at;
    NEW.signed_user_id := OLD.signed_user_id;
  ELSE
    PERFORM public.pj_oc_assert_can_sign(NEW.slot, NEW.oc_id);
    NEW.signed_at := now();
    NEW.signed_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pj_oc_signoff_log ON public.pj_oc_signoff;
DROP TRIGGER IF EXISTS pj_oc_master_log_created ON public.pj_oc_master;
DROP FUNCTION IF EXISTS public.pj_oc_request_modification(uuid, text);
DROP FUNCTION IF EXISTS public.pj_oc_signoff_log();
DROP FUNCTION IF EXISTS public.pj_oc_master_log_created();
DROP FUNCTION IF EXISTS public.pj_oc_is_returned(uuid);
DROP TABLE IF EXISTS public.pj_oc_approval_log;

NOTIFY pgrst, 'reload schema';

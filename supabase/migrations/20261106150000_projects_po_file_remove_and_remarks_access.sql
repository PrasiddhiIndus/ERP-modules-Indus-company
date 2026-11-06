-- Projects PO At Glance: remove a saved purchase order file, and let Execution
-- and the Department Head save remarks without changing the rest of the PO.
-- The person who created the PO, and Finance, keep the existing save path.

CREATE OR REPLACE FUNCTION public.pj_oc_user_is_remarks_only(p_created_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT p_created_by IS DISTINCT FROM auth.uid()
     AND NOT public.oc_current_user_is_finance()
     AND EXISTS (
       SELECT 1
         FROM public.pj_oc_signoff_assignees a
        WHERE a.slot IN ('PLANNING', 'VERTICAL_HEAD')
          AND lower(btrim(a.employee_code)) = lower(btrim(COALESCE(public.oc_current_employee_code(), '')))
          AND btrim(COALESCE(public.oc_current_employee_code(), '')) <> ''
     );
$body$;

CREATE OR REPLACE FUNCTION public.pj_oc_guard_reviewer_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pj_oc_user_is_remarks_only(OLD.created_by) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'remarks' - 'remarks_date' - 'updated_by' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'remarks' - 'remarks_date' - 'updated_by' - 'updated_at') THEN
    RAISE EXCEPTION 'You can add remarks on this PO. The rest is view only.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS pj_oc_guard_reviewer_edit ON public.pj_oc_master;
CREATE TRIGGER pj_oc_guard_reviewer_edit
  BEFORE UPDATE ON public.pj_oc_master
  FOR EACH ROW
  EXECUTE FUNCTION public.pj_oc_guard_reviewer_edit();

CREATE OR REPLACE FUNCTION public.pj_oc_set_remarks(p_id uuid, p_remarks text, p_remarks_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_created uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pj_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Projects PO At Glance.' USING ERRCODE = '42501';
  END IF;
  SELECT m.created_by INTO v_created FROM public.pj_oc_master m WHERE m.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.pj_oc_user_is_remarks_only(v_created) THEN
    RAISE EXCEPTION 'You can add remarks on this PO. The rest is view only.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.pj_oc_master
     SET remarks = nullif(btrim(COALESCE(p_remarks, '')), ''),
         remarks_date = p_remarks_date
   WHERE id = p_id;
END;
$body$;

CREATE OR REPLACE FUNCTION public.pj_oc_set_po_document(p_id uuid, p_name text, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_created uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pj_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Projects PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR nullif(btrim(COALESCE(p_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Choose a purchase order file to upload.' USING ERRCODE = 'P0001';
  END IF;
  SELECT m.created_by INTO v_created FROM public.pj_oc_master m WHERE m.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
  IF public.pj_oc_user_is_remarks_only(v_created) THEN
    RAISE EXCEPTION 'You can add remarks on this PO. The rest is view only.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.pj_oc_master
     SET po_document_name = nullif(btrim(COALESCE(p_name, '')), ''),
         po_document_path = btrim(p_path)
   WHERE id = p_id;
END;
$body$;

CREATE OR REPLACE FUNCTION public.pj_oc_clear_po_document(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_created uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pj_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Projects PO At Glance.' USING ERRCODE = '42501';
  END IF;
  SELECT m.created_by INTO v_created FROM public.pj_oc_master m WHERE m.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
  IF public.pj_oc_user_is_remarks_only(v_created) THEN
    RAISE EXCEPTION 'You can add remarks on this PO. The rest is view only.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.pj_oc_master
     SET po_document_name = NULL,
         po_document_path = NULL
   WHERE id = p_id;
END;
$body$;

REVOKE ALL ON FUNCTION public.pj_oc_user_is_remarks_only(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pj_oc_guard_reviewer_edit() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pj_oc_set_remarks(uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pj_oc_set_po_document(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pj_oc_clear_po_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pj_oc_set_remarks(uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pj_oc_set_po_document(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pj_oc_clear_po_document(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

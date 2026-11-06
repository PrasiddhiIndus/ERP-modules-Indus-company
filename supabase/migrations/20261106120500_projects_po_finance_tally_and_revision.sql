-- Projects PO At Glance:
-- * Finance can save Cost Center in Tally on its own, without waiting for the other signatures.
-- * The person assigned to the stage that is open (Execution, Department Head, or Finance)
--   can send the PO back to its creator with remarks. If every stage is already signed,
--   the assigned Finance signer can still send it back.

CREATE OR REPLACE FUNCTION public.finance_po_set_cost_center(
  p_department text,
  p_id uuid,
  p_cost_center text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value text := nullif(btrim(COALESCE(p_cost_center, '')), '');
  v_updated timestamptz;
BEGIN
  IF NOT public.finance_po_current_user_has_master_access()
     AND NOT public.oc_current_user_is_finance() THEN
    RAISE EXCEPTION 'Only the Finance Department can fill Cost Center in Tally.' USING ERRCODE = '42501';
  END IF;
  IF p_department <> 'projects' THEN
    RAISE EXCEPTION 'Cost Center in Tally is changed from Finance on Projects PO At Glance.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.pj_oc_master
     SET cost_center_tally = v_value
   WHERE id = p_id
   RETURNING updated_at INTO v_updated;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('cost_center_tally', v_value, 'updated_at', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_po_set_cost_center(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_po_set_cost_center(text, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pj_oc_request_modification(p_oc_id uuid, p_remarks text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remarks text := nullif(btrim(COALESCE(p_remarks, '')), '');
  v_slot text;
  v_a public.pj_oc_signoff_assignees%ROWTYPE;
  v_finance boolean := public.finance_po_current_user_has_master_access() OR public.oc_current_user_is_finance();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;
  IF v_remarks IS NULL THEN
    RAISE EXCEPTION 'Remarks are required to send this PO for revision.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.pj_oc_master m WHERE m.id = p_oc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
  IF public.pj_oc_is_returned(p_oc_id) THEN
    RAISE EXCEPTION 'This PO is already back with its creator for revision.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pj_oc_signoff s
     WHERE s.oc_id = p_oc_id AND s.slot = 'PROJECT_USER' AND nullif(btrim(s.signed_by), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'OC Creation must be signed before this PO can be sent for revision.' USING ERRCODE = 'P0001';
  END IF;

  v_slot := CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.pj_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot = 'PLANNING') THEN 'PLANNING'
    WHEN NOT EXISTS (SELECT 1 FROM public.pj_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot = 'VERTICAL_HEAD') THEN 'VERTICAL_HEAD'
    ELSE 'FINANCE'
  END;

  IF NOT public.pj_oc_current_user_has_access() AND NOT (v_slot = 'FINANCE' AND v_finance) THEN
    RAISE EXCEPTION 'You do not have access to Projects PO At Glance.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_a FROM public.pj_oc_signoff_assignees WHERE slot = v_slot;
  IF NOT FOUND OR lower(btrim(v_a.employee_code)) IS DISTINCT FROM lower(public.oc_current_employee_code()) THEN
    RAISE EXCEPTION 'Only the person assigned to the current stage can send this PO for revision.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.pj_oc_approval_log (oc_id, action, slot, remarks, actor_user_id, actor_name)
  VALUES (p_oc_id, 'MODIFICATION_REQUESTED', v_slot, v_remarks, auth.uid(),
          COALESCE(nullif(btrim(v_a.employee_name), ''), public.finance_po_actor_name()));

  PERFORM set_config('pj_oc.workflow_reset', p_oc_id::text, true);
  DELETE FROM public.pj_oc_signoff WHERE oc_id = p_oc_id;
  PERFORM set_config('pj_oc.workflow_reset', '', true);
END;
$$;

DROP POLICY IF EXISTS pj_oc_approval_log_select ON public.pj_oc_approval_log;
CREATE POLICY pj_oc_approval_log_select ON public.pj_oc_approval_log FOR SELECT TO authenticated
  USING (
    public.pj_oc_current_user_has_access()
    OR public.finance_po_current_user_has_master_access()
  );

NOTIFY pgrst, 'reload schema';

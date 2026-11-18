-- Revert Cost Center in Tally to Projects-only (prior behaviour).

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

NOTIFY pgrst, 'reload schema';

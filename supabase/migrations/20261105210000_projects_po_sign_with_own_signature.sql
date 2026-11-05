-- Projects PO At Glance only: one-click "Sign" with the signer's own Indus One digital signature.
--
-- pj_oc_sign_stage(oc, slot) signs one stage for the logged-in user:
--   * the user must have their own signature uploaded (looked up by their login / employee code through
--     employee_signature_file_for_user — never another employee's file, and nothing is chosen by hand);
--   * the signed name is the user's own Employee Master name;
--   * the existing sign-off trigger still enforces the assignee, the stage order and the modification return,
--     stamps the exact signing date and time and the signer's login (signed_user_id), and writes the audit trail.
-- No tables or existing rows are changed. Rollback: supabase/rollbacks/20261105210000_projects_po_sign_with_own_signature_down.sql

CREATE OR REPLACE FUNCTION public.pj_oc_sign_stage(p_oc_id uuid, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_name text;
  v_sig jsonb;
  v_row public.pj_oc_signoff%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.pj_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Projects PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_slot NOT IN ('PROJECT_USER', 'PLANNING', 'VERTICAL_HEAD', 'FINANCE') THEN
    RAISE EXCEPTION 'Unknown sign-off stage.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.pj_oc_master m WHERE m.id = p_oc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pj_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot = p_slot) THEN
    RAISE EXCEPTION 'This stage is already signed.' USING ERRCODE = 'P0001';
  END IF;

  v_sig := public.employee_signature_file_for_user(v_uid);
  IF v_sig IS NULL OR nullif(btrim(v_sig ->> 'objectKey'), '') IS NULL THEN
    RAISE EXCEPTION 'No digital signature was found for your employee code. Upload your signature in Indus One, then sign again.'
      USING ERRCODE = 'P0001';
  END IF;

  v_code := nullif(btrim(COALESCE(public.oc_current_employee_code(), '')), '');
  SELECT nullif(btrim(e.full_name), '')
    INTO v_name
    FROM public.admin_ifsp_employee_master e
   WHERE e.id = (v_sig ->> 'employeeMasterId')::bigint;
  IF v_name IS NULL AND v_code IS NOT NULL THEN
    SELECT nullif(btrim(a.employee_name), '') INTO v_name
      FROM public.pj_oc_signoff_assignees a
     WHERE a.slot = p_slot AND lower(btrim(a.employee_code)) = lower(v_code);
  END IF;
  v_name := COALESCE(v_name, public.finance_po_actor_name());

  INSERT INTO public.pj_oc_signoff (oc_id, slot, signed_by)
  VALUES (p_oc_id, p_slot, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'slot', v_row.slot,
    'signed_by', v_row.signed_by,
    'signed_at', v_row.signed_at,
    'signed_user_id', v_row.signed_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pj_oc_sign_stage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pj_oc_sign_stage(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

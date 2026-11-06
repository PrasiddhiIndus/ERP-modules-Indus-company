-- Projects PO At Glance: the name stored on Sign comes from the current Employee Master row
-- for the signer's employee code. An older assignment name is used only when that row has no name.
-- Sign-off rules, order, and the signing time are unchanged.

CREATE OR REPLACE FUNCTION public.pj_oc_sign_stage(p_oc_id uuid, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
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

  v_code := nullif(btrim(COALESCE(public.oc_current_employee_code(), v_sig ->> 'employeeCode', '')), '');
  SELECT nullif(btrim(e.full_name), '')
    INTO v_name
    FROM public.admin_ifsp_employee_master e
   WHERE e.id = nullif(v_sig ->> 'employeeMasterId', '')::bigint;

  IF v_name IS NULL AND v_code IS NOT NULL THEN
    SELECT nullif(btrim(e.full_name), '')
      INTO v_name
      FROM public.admin_ifsp_employee_master e
     WHERE lower(btrim(e.employee_code)) = lower(v_code)
     ORDER BY CASE WHEN lower(coalesce(e.status, '')) = 'active' THEN 0 ELSE 1 END,
              e.id DESC
     LIMIT 1;
  END IF;

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
$body$;

REVOKE ALL ON FUNCTION public.pj_oc_sign_stage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pj_oc_sign_stage(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

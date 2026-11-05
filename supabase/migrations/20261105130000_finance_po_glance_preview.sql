-- Finance Master PO At Glance: open a department PO in the same form, read-only,
-- sign only the Finance box, and keep OC No. locked until every other required
-- signatory has signed. Department save functions are unchanged.

CREATE OR REPLACE FUNCTION public.finance_po_required_other_slots(p_department text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_department
    WHEN 'iev' THEN ARRAY['SALES', 'PLANNING', 'IEV_HEAD']::text[]
    WHEN 'maintenance' THEN ARRAY['MM_USER', 'VERTICAL_HEAD']::text[]
    WHEN 'projects' THEN ARRAY['PROJECT_USER', 'PLANNING', 'VERTICAL_HEAD']::text[]
    WHEN 'rm' THEN ARRAY['RM_USER', 'VERTICAL_HEAD']::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_other_signoffs_complete(p_department text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_need text[] := public.finance_po_required_other_slots(p_department);
  v_have text[];
BEGIN
  IF p_department = 'iev' THEN
    SELECT coalesce(array_agg(s.slot), '{}') INTO v_have
    FROM public.oc_signoff s
    WHERE s.oc_id = p_id AND btrim(coalesce(s.signed_by, '')) <> '' AND s.slot = ANY (v_need);
  ELSIF p_department = 'maintenance' THEN
    SELECT coalesce(array_agg(s.slot), '{}') INTO v_have
    FROM public.mm_oc_signoff s
    WHERE s.oc_id = p_id AND btrim(coalesce(s.signed_by, '')) <> '' AND s.slot = ANY (v_need);
  ELSIF p_department = 'projects' THEN
    SELECT coalesce(array_agg(s.slot), '{}') INTO v_have
    FROM public.pj_oc_signoff s
    WHERE s.oc_id = p_id AND btrim(coalesce(s.signed_by, '')) <> '' AND s.slot = ANY (v_need);
  ELSIF p_department = 'rm' THEN
    SELECT coalesce(array_agg(s.slot), '{}') INTO v_have
    FROM public.rm_oc_signoff s
    WHERE s.oc_id = p_id AND btrim(coalesce(s.signed_by, '')) <> '' AND s.slot = ANY (v_need);
  ELSE
    RETURN false;
  END IF;
  RETURN v_need <@ coalesce(v_have, '{}');
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_glance_detail(p_department text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master jsonb;
  v_security jsonb;
  v_conditions jsonb;
  v_penalty jsonb;
  v_milestones jsonb;
  v_contacts jsonb;
  v_signoff jsonb;
  v_assignees jsonb;
BEGIN
  IF NOT public.finance_po_current_user_has_master_access() THEN
    RAISE EXCEPTION 'You do not have access to Master PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_department NOT IN ('iev', 'maintenance', 'projects', 'rm') THEN
    RAISE EXCEPTION 'Unknown department.' USING ERRCODE = '22023';
  END IF;

  IF p_department = 'iev' THEN
    SELECT to_jsonb(m) INTO v_master FROM public.oc_master m WHERE m.id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.seq), '[]'::jsonb) INTO v_security FROM public.oc_security_items s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_conditions FROM public.oc_fixed_conditions c WHERE c.oc_id = p_id;
    SELECT to_jsonb(p) INTO v_penalty FROM public.oc_penalty p WHERE p.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.seq), '[]'::jsonb) INTO v_milestones FROM public.oc_payment_milestones m WHERE m.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.seq), '[]'::jsonb) INTO v_contacts FROM public.oc_contacts c WHERE c.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_signoff FROM public.oc_signoff s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('slot', a.slot, 'employee_code', a.employee_code, 'employee_name', a.employee_name)), '[]'::jsonb)
      INTO v_assignees FROM public.oc_signoff_assignees a;
  ELSIF p_department = 'maintenance' THEN
    SELECT to_jsonb(m) INTO v_master FROM public.mm_oc_master m WHERE m.id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.seq), '[]'::jsonb) INTO v_security FROM public.mm_oc_security_items s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_conditions FROM public.mm_oc_fixed_conditions c WHERE c.oc_id = p_id;
    SELECT to_jsonb(p) INTO v_penalty FROM public.mm_oc_penalty p WHERE p.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.seq), '[]'::jsonb) INTO v_milestones FROM public.mm_oc_payment_milestones m WHERE m.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.seq), '[]'::jsonb) INTO v_contacts FROM public.mm_oc_contacts c WHERE c.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_signoff FROM public.mm_oc_signoff s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('slot', a.slot, 'employee_code', a.employee_code, 'employee_name', a.employee_name)), '[]'::jsonb)
      INTO v_assignees FROM public.mm_oc_signoff_assignees a;
  ELSIF p_department = 'projects' THEN
    SELECT to_jsonb(m) INTO v_master FROM public.pj_oc_master m WHERE m.id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.seq), '[]'::jsonb) INTO v_security FROM public.pj_oc_security_items s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_conditions FROM public.pj_oc_fixed_conditions c WHERE c.oc_id = p_id;
    SELECT to_jsonb(p) INTO v_penalty FROM public.pj_oc_penalty p WHERE p.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.seq), '[]'::jsonb) INTO v_milestones FROM public.pj_oc_payment_milestones m WHERE m.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.seq), '[]'::jsonb) INTO v_contacts FROM public.pj_oc_contacts c WHERE c.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_signoff FROM public.pj_oc_signoff s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('slot', a.slot, 'employee_code', a.employee_code, 'employee_name', a.employee_name)), '[]'::jsonb)
      INTO v_assignees FROM public.pj_oc_signoff_assignees a;
  ELSE
    SELECT to_jsonb(m) INTO v_master FROM public.rm_oc_master m WHERE m.id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.seq), '[]'::jsonb) INTO v_security FROM public.rm_oc_security_items s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO v_conditions FROM public.rm_oc_fixed_conditions c WHERE c.oc_id = p_id;
    SELECT to_jsonb(p) INTO v_penalty FROM public.rm_oc_penalty p WHERE p.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.seq), '[]'::jsonb) INTO v_milestones FROM public.rm_oc_payment_milestones m WHERE m.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.seq), '[]'::jsonb) INTO v_contacts FROM public.rm_oc_contacts c WHERE c.oc_id = p_id;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_signoff FROM public.rm_oc_signoff s WHERE s.oc_id = p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('slot', a.slot, 'employee_code', a.employee_code, 'employee_name', a.employee_name)), '[]'::jsonb)
      INTO v_assignees FROM public.rm_oc_signoff_assignees a;
  END IF;

  IF v_master IS NULL THEN
    RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'master', v_master,
    'security', v_security,
    'conditions', v_conditions,
    'penalty', v_penalty,
    'milestones', v_milestones,
    'contacts', v_contacts,
    'signoff', v_signoff,
    'assignees', v_assignees
  );
END;
$$;

-- Records only the Finance Department signature. Other boxes stay with the department.
CREATE OR REPLACE FUNCTION public.finance_po_sign(p_department text, p_id uuid, p_signed_by text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := NULLIF(btrim(p_signed_by), '');
  v_exists boolean;
BEGIN
  IF NOT public.finance_po_current_user_has_master_access() THEN
    RAISE EXCEPTION 'You do not have access to Master PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_department NOT IN ('iev', 'maintenance', 'projects', 'rm') THEN
    RAISE EXCEPTION 'Unknown department.' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Type your name to sign.' USING ERRCODE = '22023';
  END IF;

  IF p_department = 'iev' THEN
    IF NOT EXISTS (SELECT 1 FROM public.oc_master m WHERE m.id = p_id) THEN
      RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.oc_signoff s WHERE s.oc_id = p_id AND s.slot = 'FINANCE') INTO v_exists;
    IF v_exists THEN
      UPDATE public.oc_signoff SET signed_by = v_name WHERE oc_id = p_id AND slot = 'FINANCE' AND signed_by IS DISTINCT FROM v_name;
    ELSE
      INSERT INTO public.oc_signoff (oc_id, slot, signed_by) VALUES (p_id, 'FINANCE', v_name);
    END IF;
  ELSIF p_department = 'maintenance' THEN
    IF NOT EXISTS (SELECT 1 FROM public.mm_oc_master m WHERE m.id = p_id) THEN
      RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.mm_oc_signoff s WHERE s.oc_id = p_id AND s.slot = 'FINANCE') INTO v_exists;
    IF v_exists THEN
      UPDATE public.mm_oc_signoff SET signed_by = v_name WHERE oc_id = p_id AND slot = 'FINANCE' AND signed_by IS DISTINCT FROM v_name;
    ELSE
      INSERT INTO public.mm_oc_signoff (oc_id, slot, signed_by) VALUES (p_id, 'FINANCE', v_name);
    END IF;
  ELSIF p_department = 'projects' THEN
    IF NOT EXISTS (SELECT 1 FROM public.pj_oc_master m WHERE m.id = p_id) THEN
      RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.pj_oc_signoff s WHERE s.oc_id = p_id AND s.slot = 'FINANCE') INTO v_exists;
    IF v_exists THEN
      UPDATE public.pj_oc_signoff SET signed_by = v_name WHERE oc_id = p_id AND slot = 'FINANCE' AND signed_by IS DISTINCT FROM v_name;
    ELSE
      INSERT INTO public.pj_oc_signoff (oc_id, slot, signed_by) VALUES (p_id, 'FINANCE', v_name);
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.rm_oc_master m WHERE m.id = p_id) THEN
      RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.rm_oc_signoff s WHERE s.oc_id = p_id AND s.slot = 'FINANCE') INTO v_exists;
    IF v_exists THEN
      UPDATE public.rm_oc_signoff SET signed_by = v_name WHERE oc_id = p_id AND slot = 'FINANCE' AND signed_by IS DISTINCT FROM v_name;
    ELSE
      INSERT INTO public.rm_oc_signoff (oc_id, slot, signed_by) VALUES (p_id, 'FINANCE', v_name);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_po_set_oc_no(
  p_department text,
  p_id uuid,
  p_oc_no text,
  p_oc_date date,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc_no text := NULLIF(btrim(p_oc_no), '');
  v_old_oc_no text;
  v_old_oc_date date;
  v_updated timestamptz;
  v_po_wo_no text;
  v_new_updated timestamptz;
  v_name text;
BEGIN
  IF NOT public.finance_po_current_user_has_master_access() THEN
    RAISE EXCEPTION 'You do not have access to Master PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF p_department NOT IN ('iev', 'maintenance', 'projects', 'rm') THEN
    RAISE EXCEPTION 'Unknown department.' USING ERRCODE = '22023';
  END IF;
  IF v_oc_no IS NULL THEN
    RAISE EXCEPTION 'OC No. is required.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_oc_no) > 80 THEN
    RAISE EXCEPTION 'OC No. must be 80 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  IF p_department = 'iev' THEN
    SELECT m.oc_no, m.oc_date, m.updated_at, m.po_wo_no INTO v_old_oc_no, v_old_oc_date, v_updated, v_po_wo_no
      FROM public.oc_master m WHERE m.id = p_id FOR UPDATE;
  ELSIF p_department = 'maintenance' THEN
    SELECT m.oc_no, m.oc_date, m.updated_at, m.po_wo_no INTO v_old_oc_no, v_old_oc_date, v_updated, v_po_wo_no
      FROM public.mm_oc_master m WHERE m.id = p_id FOR UPDATE;
  ELSIF p_department = 'projects' THEN
    SELECT m.oc_no, m.oc_date, m.updated_at, m.po_wo_no INTO v_old_oc_no, v_old_oc_date, v_updated, v_po_wo_no
      FROM public.pj_oc_master m WHERE m.id = p_id FOR UPDATE;
  ELSE
    SELECT m.oc_no, m.oc_date, m.updated_at, m.po_wo_no INTO v_old_oc_no, v_old_oc_date, v_updated, v_po_wo_no
      FROM public.rm_oc_master m WHERE m.id = p_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_updated IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This PO was changed by someone else. Refresh the list and try again.' USING ERRCODE = 'P0001';
  END IF;
  IF v_old_oc_no IS NOT DISTINCT FROM v_oc_no AND v_old_oc_date IS NOT DISTINCT FROM p_oc_date THEN
    RETURN jsonb_build_object('oc_no', v_old_oc_no, 'oc_date', v_old_oc_date, 'updated_at', v_updated, 'changed', false);
  END IF;
  IF NOT public.finance_po_other_signoffs_complete(p_department, p_id) THEN
    RAISE EXCEPTION 'OC Number stays locked until every other required signatory has signed.' USING ERRCODE = 'P0001';
  END IF;

  IF p_department = 'iev' THEN
    IF EXISTS (SELECT 1 FROM public.oc_master WHERE upper(btrim(oc_no)) = upper(v_oc_no) AND id <> p_id) THEN
      RAISE EXCEPTION 'OC No. % is already used in IEV. Enter a different number.', v_oc_no USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.oc_master SET oc_no = v_oc_no, oc_date = p_oc_date WHERE id = p_id
      RETURNING updated_at INTO v_new_updated;
  ELSIF p_department = 'maintenance' THEN
    IF EXISTS (SELECT 1 FROM public.mm_oc_master WHERE upper(btrim(oc_no)) = upper(v_oc_no) AND id <> p_id) THEN
      RAISE EXCEPTION 'OC No. % is already used in Maintenance. Enter a different number.', v_oc_no USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.mm_oc_master SET oc_no = v_oc_no, oc_date = p_oc_date WHERE id = p_id
      RETURNING updated_at INTO v_new_updated;
  ELSIF p_department = 'projects' THEN
    IF EXISTS (SELECT 1 FROM public.pj_oc_master WHERE upper(btrim(oc_no)) = upper(v_oc_no) AND id <> p_id) THEN
      RAISE EXCEPTION 'OC No. % is already used in Projects. Enter a different number.', v_oc_no USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.pj_oc_master SET oc_no = v_oc_no, oc_date = p_oc_date WHERE id = p_id
      RETURNING updated_at INTO v_new_updated;
  ELSE
    IF EXISTS (SELECT 1 FROM public.rm_oc_master WHERE upper(btrim(oc_no)) = upper(v_oc_no) AND id <> p_id) THEN
      RAISE EXCEPTION 'OC No. % is already used in R&M. Enter a different number.', v_oc_no USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.rm_oc_master SET oc_no = v_oc_no, oc_date = p_oc_date WHERE id = p_id
      RETURNING updated_at INTO v_new_updated;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.username), ''), p.email) INTO v_name FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.finance_oc_no_audit (department, po_id, po_wo_no, old_oc_no, new_oc_no, old_oc_date, new_oc_date, changed_by, changed_by_name)
  VALUES (p_department, p_id, v_po_wo_no, v_old_oc_no, v_oc_no, v_old_oc_date, p_oc_date, auth.uid(), v_name);

  RETURN jsonb_build_object('oc_no', v_oc_no, 'oc_date', p_oc_date, 'updated_at', v_new_updated, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_po_required_other_slots(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_po_other_signoffs_complete(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_po_glance_detail(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_po_sign(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_po_glance_detail(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_po_sign(text, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

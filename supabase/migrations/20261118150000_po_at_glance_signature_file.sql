-- =============================================================================
-- PO At Glance (IEV, Maintenance, R&M): signature of the login that signed a box.
--   * oc_dept_signature_file(department, oc_id, slot) returns the Indus One / Employee Master signature
--     file of signed_user_id (already stamped by each *_oc_signoff_stamp trigger) for one saved box.
--   * Gated by the department's own PO At Glance access, or Finance Master PO At Glance access.
--   * Read only: no table, column, trigger, sign-off rule or existing function is changed.
--     Projects (pj_oc_signature_file) and Commercial (cm_oc_signature_file) keep their own functions.
-- Rollback: supabase/rollbacks/20261118150000_po_at_glance_signature_file_down.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.oc_dept_signature_file(p_department text, p_oc_id uuid, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_slot text := upper(btrim(coalesce(p_slot, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;

  IF p_department = 'iev' THEN
    IF NOT public.oc_current_user_has_access() AND NOT public.finance_po_current_user_has_master_access() THEN
      RAISE EXCEPTION 'You do not have access to IEV PO At Glance.' USING ERRCODE = '42501';
    END IF;
    SELECT s.signed_user_id INTO v_user
      FROM public.oc_signoff s
     WHERE s.oc_id = p_oc_id AND s.slot = v_slot AND nullif(btrim(s.signed_by), '') IS NOT NULL;
  ELSIF p_department = 'maintenance' THEN
    IF NOT public.mm_oc_current_user_has_access() AND NOT public.finance_po_current_user_has_master_access() THEN
      RAISE EXCEPTION 'You do not have access to Maintenance PO At Glance.' USING ERRCODE = '42501';
    END IF;
    SELECT s.signed_user_id INTO v_user
      FROM public.mm_oc_signoff s
     WHERE s.oc_id = p_oc_id AND s.slot = v_slot AND nullif(btrim(s.signed_by), '') IS NOT NULL;
  ELSIF p_department = 'rm' THEN
    IF NOT public.rm_oc_current_user_has_access() AND NOT public.finance_po_current_user_has_master_access() THEN
      RAISE EXCEPTION 'You do not have access to R&M PO At Glance.' USING ERRCODE = '42501';
    END IF;
    SELECT s.signed_user_id INTO v_user
      FROM public.rm_oc_signoff s
     WHERE s.oc_id = p_oc_id AND s.slot = v_slot AND nullif(btrim(s.signed_by), '') IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Unknown department.' USING ERRCODE = '22023';
  END IF;

  -- Same lookup Projects uses (Indus One signature first, then the Employee Master signature document).
  RETURN public.pj_oc_user_signature(v_user);
END;
$$;

COMMENT ON FUNCTION public.oc_dept_signature_file(text, uuid, text) IS
  'PO At Glance (iev / maintenance / rm): signature file of the login that signed one saved sign-off box.';

REVOKE ALL ON FUNCTION public.oc_dept_signature_file(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_dept_signature_file(text, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

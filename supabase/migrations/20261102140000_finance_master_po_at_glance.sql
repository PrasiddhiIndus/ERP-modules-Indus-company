-- =============================================================================
-- Finance → Master PO At Glance (additive only; nothing existing is altered).
--
-- One Finance view over the PO At Glance records of every department, without copying them:
--
--   * finance_po_glance_list()            read-only header + sign-off summary from oc_master (IEV)
--                                         and mm_oc_master (Maintenance)
--   * finance_po_set_oc_no(...)           sets ONLY oc_no / oc_date on one PO; every other column,
--                                         sign-off and child row is left as it is
--   * finance_po_oc_history(dept, id)     the OC No. change log for one PO
--   * finance_oc_no_audit                 append-only log written by finance_po_set_oc_no
--
-- Who: oc_current_user_is_finance() (Finance Department people and Super Admins) — the same rule the
-- department guards (oc_master_guard / mm_oc_master_guard) already apply to the OC No. Those guards
-- still run on the update, so the Finance-only rule and the per-department unique index are unchanged.
-- Concurrency: the caller passes the updated_at it loaded; a PO changed since then is rejected.
--
-- New department later: add a branch to the three functions and to the department CHECK below.
-- Rollback: supabase/rollbacks/20261102140000_finance_master_po_at_glance_down.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.finance_oc_no_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department text NOT NULL CHECK (department IN ('iev', 'maintenance')),
  po_id uuid NOT NULL,
  po_wo_no text,
  old_oc_no text,
  new_oc_no text,
  old_oc_date date,
  new_oc_date date,
  changed_by uuid DEFAULT auth.uid(),
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_oc_no_audit_po ON public.finance_oc_no_audit (department, po_id, changed_at DESC);

ALTER TABLE public.finance_oc_no_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_oc_no_audit_select ON public.finance_oc_no_audit;
CREATE POLICY finance_oc_no_audit_select ON public.finance_oc_no_audit FOR SELECT TO authenticated
  USING (public.oc_current_user_is_finance());
-- No insert / update / delete policies: rows are written only by finance_po_set_oc_no.

-- ---------------------------------------------------------------------------
-- List
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_po_glance_list()
RETURNS TABLE (
  department text,
  id uuid,
  po_wo_no text,
  po_date date,
  client_name text,
  project_description text,
  cost_center_tally text,
  contract_value numeric,
  currency text,
  delivery_date date,
  oc_no text,
  oc_date date,
  signed_slots text[],
  total_slots integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.oc_current_user_is_finance() THEN
    RAISE EXCEPTION 'Only the Finance Department can open Master PO At Glance.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 'iev'::text, m.id, m.po_wo_no, m.po_date, m.client_name, m.project_description, m.cost_center_tally,
         m.contract_value, m.currency, m.delivery_date, m.oc_no, m.oc_date,
         COALESCE((SELECT array_agg(s.slot ORDER BY s.slot) FROM public.oc_signoff s WHERE s.oc_id = m.id), '{}'),
         4, m.created_at, m.updated_at
  FROM public.oc_master m
  UNION ALL
  SELECT 'maintenance'::text, m.id, m.po_wo_no, m.po_date, m.client_name, m.project_description, m.cost_center_tally,
         m.contract_value, m.currency, m.delivery_date, m.oc_no, m.oc_date,
         COALESCE((SELECT array_agg(s.slot ORDER BY s.slot) FROM public.mm_oc_signoff s WHERE s.oc_id = m.id), '{}'),
         3, m.created_at, m.updated_at
  FROM public.mm_oc_master m
  ORDER BY 15 DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Set OC No.
-- ---------------------------------------------------------------------------
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
  IF NOT public.oc_current_user_is_finance() THEN
    RAISE EXCEPTION 'Only the Finance Department can fill or change the OC No.' USING ERRCODE = '42501';
  END IF;
  IF p_department NOT IN ('iev', 'maintenance') THEN
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
  ELSE
    SELECT m.oc_no, m.oc_date, m.updated_at, m.po_wo_no INTO v_old_oc_no, v_old_oc_date, v_updated, v_po_wo_no
      FROM public.mm_oc_master m WHERE m.id = p_id FOR UPDATE;
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

  IF p_department = 'iev' THEN
    IF EXISTS (SELECT 1 FROM public.oc_master WHERE upper(btrim(oc_no)) = upper(v_oc_no) AND id <> p_id) THEN
      RAISE EXCEPTION 'OC No. % is already used in IEV. Enter a different number.', v_oc_no USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.oc_master SET oc_no = v_oc_no, oc_date = p_oc_date WHERE id = p_id
      RETURNING updated_at INTO v_new_updated;
  ELSE
    IF EXISTS (SELECT 1 FROM public.mm_oc_master WHERE upper(btrim(oc_no)) = upper(v_oc_no) AND id <> p_id) THEN
      RAISE EXCEPTION 'OC No. % is already used in Maintenance. Enter a different number.', v_oc_no USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.mm_oc_master SET oc_no = v_oc_no, oc_date = p_oc_date WHERE id = p_id
      RETURNING updated_at INTO v_new_updated;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.username), ''), p.email) INTO v_name FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.finance_oc_no_audit (department, po_id, po_wo_no, old_oc_no, new_oc_no, old_oc_date, new_oc_date, changed_by, changed_by_name)
  VALUES (p_department, p_id, v_po_wo_no, v_old_oc_no, v_oc_no, v_old_oc_date, p_oc_date, auth.uid(), v_name);

  RETURN jsonb_build_object('oc_no', v_oc_no, 'oc_date', p_oc_date, 'updated_at', v_new_updated, 'changed', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_po_oc_history(p_department text, p_id uuid)
RETURNS SETOF public.finance_oc_no_audit
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.oc_current_user_is_finance() THEN
    RAISE EXCEPTION 'Only the Finance Department can view OC No. history.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM public.finance_oc_no_audit a
  WHERE a.department = p_department AND a.po_id = p_id
  ORDER BY a.changed_at DESC;
END;
$$;

REVOKE ALL ON TABLE public.finance_oc_no_audit FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.finance_oc_no_audit TO authenticated;
REVOKE ALL ON FUNCTION public.finance_po_glance_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_po_set_oc_no(text, uuid, text, date, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_po_oc_history(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_po_glance_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_po_set_oc_no(text, uuid, text, date, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_po_oc_history(text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

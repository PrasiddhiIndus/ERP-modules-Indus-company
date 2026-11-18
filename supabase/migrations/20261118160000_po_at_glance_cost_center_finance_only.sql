-- =============================================================================
-- PO At Glance: Cost Center in Tally is Finance Department only, on every PO type.
--   * New guard trigger on oc_master, mm_oc_master, pj_oc_master, rm_oc_master and cm_oc_master:
--     filling or changing cost_center_tally is allowed only for a Finance Department person / Super Admin
--     (oc_current_user_is_finance) or a Master PO At Glance user (finance_po_current_user_has_master_access).
--     Same rule and same place as the existing OC No. guard, so it applies to every save path.
--     Unchanged values (any department's normal save) pass; server jobs without a login (auth.uid() NULL) pass.
--   * finance_po_set_cost_center also accepts IEV and R&M, so Finance can fill it from Master PO At Glance
--     on every PO type (it already handled Projects and Maintenance).
--   * OC No. is already Finance-only on all five tables (existing *_oc_master_guard triggers) — not changed.
--   * No table, column, existing trigger, sign-off rule or other permission is changed.
-- Rollback: supabase/rollbacks/20261118160000_po_at_glance_cost_center_finance_only_down.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.po_glance_cost_center_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new text := nullif(btrim(coalesce(NEW.cost_center_tally, '')), '');
  v_old text := CASE WHEN TG_OP = 'UPDATE' THEN nullif(btrim(coalesce(OLD.cost_center_tally, '')), '') END;
BEGIN
  IF auth.uid() IS NOT NULL
     AND ((TG_OP = 'INSERT' AND v_new IS NOT NULL)
          OR (TG_OP = 'UPDATE' AND v_new IS DISTINCT FROM v_old))
     AND NOT public.oc_current_user_is_finance()
     AND NOT public.finance_po_current_user_has_master_access() THEN
    RAISE EXCEPTION 'Only the Finance Department can fill or change Cost Center in Tally.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.po_glance_cost_center_guard() IS
  'PO At Glance: only Finance Department / Master PO At Glance users may fill or change cost_center_tally.';

REVOKE ALL ON FUNCTION public.po_glance_cost_center_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS po_glance_cost_center_guard ON public.oc_master;
CREATE TRIGGER po_glance_cost_center_guard
  BEFORE INSERT OR UPDATE OF cost_center_tally ON public.oc_master
  FOR EACH ROW EXECUTE FUNCTION public.po_glance_cost_center_guard();

DROP TRIGGER IF EXISTS po_glance_cost_center_guard ON public.mm_oc_master;
CREATE TRIGGER po_glance_cost_center_guard
  BEFORE INSERT OR UPDATE OF cost_center_tally ON public.mm_oc_master
  FOR EACH ROW EXECUTE FUNCTION public.po_glance_cost_center_guard();

DROP TRIGGER IF EXISTS po_glance_cost_center_guard ON public.pj_oc_master;
CREATE TRIGGER po_glance_cost_center_guard
  BEFORE INSERT OR UPDATE OF cost_center_tally ON public.pj_oc_master
  FOR EACH ROW EXECUTE FUNCTION public.po_glance_cost_center_guard();

DROP TRIGGER IF EXISTS po_glance_cost_center_guard ON public.rm_oc_master;
CREATE TRIGGER po_glance_cost_center_guard
  BEFORE INSERT OR UPDATE OF cost_center_tally ON public.rm_oc_master
  FOR EACH ROW EXECUTE FUNCTION public.po_glance_cost_center_guard();

DROP TRIGGER IF EXISTS po_glance_cost_center_guard ON public.cm_oc_master;
CREATE TRIGGER po_glance_cost_center_guard
  BEFORE INSERT OR UPDATE OF cost_center_tally ON public.cm_oc_master
  FOR EACH ROW EXECUTE FUNCTION public.po_glance_cost_center_guard();

-- Master PO At Glance: Finance fills Cost Center in Tally on every PO type (was Projects and Maintenance only).
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

  IF p_department = 'projects' THEN
    UPDATE public.pj_oc_master
       SET cost_center_tally = v_value
     WHERE id = p_id
     RETURNING updated_at INTO v_updated;
  ELSIF p_department = 'maintenance' THEN
    UPDATE public.mm_oc_master
       SET cost_center_tally = v_value
     WHERE id = p_id
     RETURNING updated_at INTO v_updated;
  ELSIF p_department = 'iev' THEN
    UPDATE public.oc_master
       SET cost_center_tally = v_value
     WHERE id = p_id
     RETURNING updated_at INTO v_updated;
  ELSIF p_department = 'rm' THEN
    UPDATE public.rm_oc_master
       SET cost_center_tally = v_value
     WHERE id = p_id
     RETURNING updated_at INTO v_updated;
  ELSE
    RAISE EXCEPTION 'Unknown department.' USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance no longer exists.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('cost_center_tally', v_value, 'updated_at', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_po_set_cost_center(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_po_set_cost_center(text, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

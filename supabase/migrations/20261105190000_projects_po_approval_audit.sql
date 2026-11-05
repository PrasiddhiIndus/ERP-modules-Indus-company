-- Projects PO At Glance only: stage-wise approval history and "Request Modification".
--
-- * pj_oc_approval_log  — one row per action on a Projects OC (created, stage approved, modification requested,
--                         resubmitted, signature removed). Read-only for users; written only by the triggers and RPC below.
-- * pj_oc_request_modification(oc, remarks) — the assigned Department Head sends the OC back to its creator with
--                         mandatory remarks. The current cycle's signatures are cleared (they stay in the log) and the
--                         workflow restarts at Stage 1 (OC Creation). Later stages stay closed until the creator resubmits.
-- * The creator resubmits by signing OC Creation again (normal save). That is logged as RESUBMITTED.
--
-- Existing PO data, assignments and permissions are not changed. Existing signatures are copied into the log once
-- so every OC opens with its history. Rollback: supabase/rollbacks/20261105190000_projects_po_approval_audit_down.sql

CREATE TABLE IF NOT EXISTS public.pj_oc_approval_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oc_id uuid NOT NULL REFERENCES public.pj_oc_master(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('CREATED', 'APPROVED', 'MODIFICATION_REQUESTED', 'RESUBMITTED', 'SIGNATURE_REMOVED')),
  slot text CHECK (slot IS NULL OR slot IN ('PROJECT_USER', 'PLANNING', 'VERTICAL_HEAD', 'FINANCE')),
  remarks text,
  actor_user_id uuid,
  actor_name text NOT NULL,
  backfilled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pj_oc_approval_log_oc ON public.pj_oc_approval_log (oc_id, created_at, id);

ALTER TABLE public.pj_oc_approval_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pj_oc_approval_log_select ON public.pj_oc_approval_log;
CREATE POLICY pj_oc_approval_log_select ON public.pj_oc_approval_log FOR SELECT TO authenticated
  USING (public.pj_oc_current_user_has_access());
REVOKE ALL ON public.pj_oc_approval_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pj_oc_approval_log TO authenticated;
GRANT ALL ON public.pj_oc_approval_log TO service_role;

-- True while the OC is back with its creator (latest return is newer than the latest resubmission).
CREATE OR REPLACE FUNCTION public.pj_oc_is_returned(p_oc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT l.action = 'MODIFICATION_REQUESTED'
      FROM public.pj_oc_approval_log l
     WHERE l.oc_id = p_oc_id AND l.action IN ('MODIFICATION_REQUESTED', 'RESUBMITTED')
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT 1
  ), false);
$$;

-- Same rules as 20261105170000, plus: the Request Modification reset may clear signatures, and later stages
-- cannot sign while the OC is back with its creator.
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
    IF current_setting('pj_oc.workflow_reset', true) = OLD.oc_id::text THEN
      RETURN OLD;
    END IF;
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
    IF NEW.slot <> 'PROJECT_USER' AND public.pj_oc_is_returned(NEW.oc_id) THEN
      RAISE EXCEPTION 'This OC was returned for modification. The creator must resubmit it before later stages can approve.'
        USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.pj_oc_assert_can_sign(NEW.slot, NEW.oc_id);
    NEW.signed_at := now();
    NEW.signed_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Logs every sign-off change (department save, Finance review, or reset).
CREATE OR REPLACE FUNCTION public.pj_oc_signoff_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('pj_oc.workflow_reset', true) = OLD.oc_id::text
       OR NOT EXISTS (SELECT 1 FROM public.pj_oc_master m WHERE m.id = OLD.oc_id) THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.pj_oc_approval_log (oc_id, action, slot, actor_user_id, actor_name)
    VALUES (OLD.oc_id, 'SIGNATURE_REMOVED', OLD.slot, auth.uid(), public.finance_po_actor_name());
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.signed_by = OLD.signed_by AND NEW.slot = OLD.slot THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.pj_oc_approval_log (oc_id, action, slot, actor_user_id, actor_name)
  VALUES (
    NEW.oc_id,
    CASE WHEN NEW.slot = 'PROJECT_USER' AND public.pj_oc_is_returned(NEW.oc_id) THEN 'RESUBMITTED' ELSE 'APPROVED' END,
    NEW.slot,
    auth.uid(),
    COALESCE(nullif(btrim(NEW.signed_by), ''), public.finance_po_actor_name())
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS pj_oc_signoff_log ON public.pj_oc_signoff;
CREATE TRIGGER pj_oc_signoff_log
  AFTER INSERT OR UPDATE OR DELETE ON public.pj_oc_signoff
  FOR EACH ROW EXECUTE FUNCTION public.pj_oc_signoff_log();

CREATE OR REPLACE FUNCTION public.pj_oc_master_log_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pj_oc_approval_log (oc_id, action, actor_user_id, actor_name)
  VALUES (NEW.id, 'CREATED', auth.uid(), public.finance_po_actor_name());
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS pj_oc_master_log_created ON public.pj_oc_master;
CREATE TRIGGER pj_oc_master_log_created
  AFTER INSERT ON public.pj_oc_master
  FOR EACH ROW EXECUTE FUNCTION public.pj_oc_master_log_created();

-- Department Head → back to the creator, with mandatory remarks.
CREATE OR REPLACE FUNCTION public.pj_oc_request_modification(p_oc_id uuid, p_remarks text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remarks text := nullif(btrim(COALESCE(p_remarks, '')), '');
  v_a public.pj_oc_signoff_assignees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pj_oc_current_user_has_access() THEN
    RAISE EXCEPTION 'You do not have access to Projects PO At Glance.' USING ERRCODE = '42501';
  END IF;
  IF v_remarks IS NULL THEN
    RAISE EXCEPTION 'Remarks are required to request a modification.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.pj_oc_master m WHERE m.id = p_oc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This PO At Glance could not be found.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_a FROM public.pj_oc_signoff_assignees WHERE slot = 'VERTICAL_HEAD';
  IF NOT FOUND OR lower(btrim(v_a.employee_code)) IS DISTINCT FROM lower(public.oc_current_employee_code()) THEN
    RAISE EXCEPTION 'Only the assigned Department Head can request a modification.' USING ERRCODE = 'P0001';
  END IF;
  IF public.pj_oc_is_returned(p_oc_id) THEN
    RAISE EXCEPTION 'This OC is already back with its creator for modification.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pj_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot = 'PLANNING')
     OR EXISTS (SELECT 1 FROM public.pj_oc_signoff s WHERE s.oc_id = p_oc_id AND s.slot IN ('VERTICAL_HEAD', 'FINANCE')) THEN
    RAISE EXCEPTION 'A modification can be requested only while the OC is waiting for Department Head approval.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.pj_oc_approval_log (oc_id, action, slot, remarks, actor_user_id, actor_name)
  VALUES (p_oc_id, 'MODIFICATION_REQUESTED', 'VERTICAL_HEAD', v_remarks, auth.uid(),
          COALESCE(nullif(btrim(v_a.employee_name), ''), public.finance_po_actor_name()));

  PERFORM set_config('pj_oc.workflow_reset', p_oc_id::text, true);
  DELETE FROM public.pj_oc_signoff WHERE oc_id = p_oc_id;
  PERFORM set_config('pj_oc.workflow_reset', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pj_oc_is_returned(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pj_oc_signoff_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pj_oc_master_log_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pj_oc_request_modification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pj_oc_is_returned(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pj_oc_request_modification(uuid, text) TO authenticated, service_role;

-- One-time history for OCs that already exist (only the new log table is written).
INSERT INTO public.pj_oc_approval_log (oc_id, action, actor_user_id, actor_name, backfilled, created_at)
SELECT m.id, 'CREATED', m.created_by,
       COALESCE(
         (SELECT nullif(btrim(e.full_name), '') FROM public.admin_ifsp_employee_master e
           WHERE e.user_id = m.created_by
           ORDER BY CASE WHEN lower(coalesce(e.status, '')) = 'active' THEN 0 ELSE 1 END, e.id LIMIT 1),
         (SELECT coalesce(nullif(btrim(p.username), ''), nullif(btrim(p.email), '')) FROM public.profiles p WHERE p.id = m.created_by),
         'Unknown user'),
       true, m.created_at
  FROM public.pj_oc_master m
 WHERE NOT EXISTS (SELECT 1 FROM public.pj_oc_approval_log l WHERE l.oc_id = m.id);

INSERT INTO public.pj_oc_approval_log (oc_id, action, slot, actor_user_id, actor_name, backfilled, created_at)
SELECT s.oc_id, 'APPROVED', s.slot, s.signed_user_id, s.signed_by, true, s.signed_at
  FROM public.pj_oc_signoff s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.pj_oc_approval_log l
    WHERE l.oc_id = s.oc_id AND l.slot = s.slot AND l.action IN ('APPROVED', 'RESUBMITTED')
 );

NOTIFY pgrst, 'reload schema';

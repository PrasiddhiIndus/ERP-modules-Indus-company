-- =============================================================================
-- Admin In-house Recruitment — core helpers, requisition approval workflow and the
-- manager-intake bridge (requisitions raised from Indus One).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by signed-in users directly)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_actor_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce(
    (
      SELECT coalesce(
        nullif(btrim(m.full_name), ''),
        nullif(btrim(to_jsonb(p) ->> 'full_name'), ''),
        nullif(btrim(to_jsonb(p) ->> 'username'), ''),
        nullif(btrim(to_jsonb(p) ->> 'email'), '')
      )
      FROM public.profiles p
      LEFT JOIN public.admin_ifsp_employee_master m
        ON nullif(btrim(coalesce(to_jsonb(p) ->> 'employee_code', '')), '') IS NOT NULL
       AND lower(btrim(m.employee_code)) = lower(btrim(to_jsonb(p) ->> 'employee_code'))
      WHERE p.id = p_user_id
      LIMIT 1
    ),
    CASE WHEN p_user_id IS NULL THEN 'System' ELSE 'User' END
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_log(
  p_candidate_id uuid,
  p_requisition_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_from text,
  p_to text,
  p_summary text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_actor_kind text DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text := coalesce(p_actor_kind, CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END);
BEGIN
  INSERT INTO public.admin_recruitment_events (
    candidate_id, requisition_id, entity_type, entity_id, action, from_status, to_status,
    summary, details, actor_id, actor_name, actor_kind
  ) VALUES (
    p_candidate_id, p_requisition_id, p_entity_type, p_entity_id, p_action, p_from, p_to,
    p_summary, coalesce(p_details, '{}'::jsonb),
    CASE WHEN v_kind = 'user' THEN v_uid END,
    coalesce(p_actor_name, CASE WHEN v_kind = 'user' THEN public.admin_recruitment_actor_name(v_uid) ELSE 'System' END),
    v_kind
  );

  IF p_candidate_id IS NOT NULL THEN
    UPDATE public.admin_recruitment_candidates SET last_activity_at = now() WHERE id = p_candidate_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_require(p_cap text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_recruitment_can(p_cap) THEN
    RAISE EXCEPTION 'You do not have permission to perform this recruitment action.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_require_service()
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'This action is only available to the recruitment service.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_check_version(p_expected integer, p_actual integer)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_expected IS NOT NULL AND p_expected <> p_actual THEN
    RAISE EXCEPTION 'This record was updated by someone else. Refresh and try again.' USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_clean(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(coalesce(p_value, '')), '')
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_phone_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(regexp_replace(coalesce(p_value, ''), '\D', '', 'g')) >= 10
      THEN right(regexp_replace(p_value, '\D', '', 'g'), 10)
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_email_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(lower(btrim(coalesce(p_value, ''))), '')
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_num(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::numeric;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'Enter a valid number (received "%").', p_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::date;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'Enter a valid date (received "%").', p_value;
END;
$$;

-- Idempotency: returns the stored result for a repeated request key (after locking it).
CREATE OR REPLACE FUNCTION public.admin_recruitment_request_begin(p_key text, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_recruitment:' || p_action || ':' || p_key, 0));
  SELECT result INTO v_result
  FROM public.admin_recruitment_request_keys
  WHERE key = p_action || ':' || p_key;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_request_end(p_key text, p_action text, p_result jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_key IS NOT NULL AND btrim(p_key) <> '' THEN
    INSERT INTO public.admin_recruitment_request_keys (key, action, result, actor_id)
    VALUES (p_action || ':' || p_key, p_action, p_result, auth.uid())
    ON CONFLICT (key) DO NOTHING;
  END IF;
  RETURN p_result;
END;
$$;

-- Stage change without validation (callers validate first).
CREATE OR REPLACE FUNCTION public.admin_recruitment_set_stage(
  p_candidate_id uuid,
  p_to text,
  p_summary text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_actor_kind text DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
  v_req uuid;
BEGIN
  SELECT stage, requisition_id INTO v_from, v_req
  FROM public.admin_recruitment_candidates WHERE id = p_candidate_id;
  IF v_from IS NULL OR v_from = p_to THEN
    RETURN;
  END IF;
  UPDATE public.admin_recruitment_candidates
  SET stage = p_to, version = version + 1
  WHERE id = p_candidate_id;
  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_req, 'candidate', p_candidate_id, 'stage_changed', v_from, p_to,
    p_summary, p_details, p_actor_kind, p_actor_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_assert_live(p_candidate public.admin_recruitment_candidates)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_candidate.outcome IS NOT NULL THEN
    RAISE EXCEPTION 'This candidate is closed (%). Reopen the candidate before continuing.',
      replace(p_candidate.outcome, '_', ' ');
  END IF;
  IF p_candidate.stage = 'employee_created' THEN
    RAISE EXCEPTION 'This candidate has already been converted to an employee.';
  END IF;
END;
$$;

-- Recruitment can only run against an approved requisition. First use opens it.
CREATE OR REPLACE FUNCTION public.admin_recruitment_use_requisition(p_requisition_id uuid, p_candidate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
BEGIN
  IF p_requisition_id IS NULL THEN
    RAISE EXCEPTION 'Link this candidate to an approved requisition first.';
  END IF;
  SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE id = p_requisition_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisition not found.';
  END IF;
  IF v_req.status NOT IN ('approved', 'open') THEN
    RAISE EXCEPTION 'Requisition % is %. Recruitment can proceed only after it is approved.',
      v_req.requisition_no, replace(v_req.status, '_', ' ');
  END IF;
  IF v_req.status = 'approved' THEN
    UPDATE public.admin_recruitment_requisitions
    SET status = 'open', opened_at = now(), version = version + 1
    WHERE id = v_req.id;
    PERFORM public.admin_recruitment_log(
      p_candidate_id, v_req.id, 'requisition', v_req.id, 'opened', 'approved', 'open',
      'Requisition opened for hiring', '{}'::jsonb
    );
    PERFORM public.admin_recruitment_sync_intake(v_req.id, NULL);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Manager intake bridge (requisitions raised from Indus One)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_sync_intake(p_requisition_id uuid, p_remarks text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
  v_status text;
BEGIN
  SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE id = p_requisition_id;
  IF NOT FOUND OR v_req.source_ref IS NULL OR to_regclass('public.hr_candidate_requisitions') IS NULL THEN
    RETURN;
  END IF;

  v_status := CASE v_req.status
    WHEN 'approved' THEN 'approved'
    WHEN 'open' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'filled' THEN 'filled'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END;

  BEGIN
    PERFORM set_config('admin_recruitment.syncing_intake', 'on', true);
    UPDATE public.hr_candidate_requisitions
    SET status = v_status,
        hr_remarks = coalesce(public.admin_recruitment_clean(p_remarks), hr_remarks),
        reviewed_by = CASE WHEN v_status <> 'pending' THEN coalesce(auth.uid(), reviewed_by) ELSE reviewed_by END,
        reviewed_at = CASE WHEN v_status <> 'pending' AND reviewed_at IS NULL THEN now() ELSE reviewed_at END,
        calling_started_at = CASE WHEN v_req.status = 'open' AND calling_started_at IS NULL THEN now() ELSE calling_started_at END,
        updated_at = now()
    WHERE id = v_req.source_ref;
    PERFORM set_config('admin_recruitment.syncing_intake', 'off', true);
  EXCEPTION WHEN others THEN
    PERFORM set_config('admin_recruitment.syncing_intake', 'off', true);
    RAISE WARNING 'admin recruitment: could not update manager requisition %: %', v_req.source_ref, SQLERRM;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_import_intake(p_intake_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_row record;
  v_no text;
  v_status text;
  v_id uuid;
  v_levels integer;
BEGIN
  SELECT id INTO v_id FROM public.admin_recruitment_requisitions WHERE source_ref = p_intake_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT r.*, m.full_name AS raiser_name, m.department AS raiser_department
    INTO v_row
  FROM public.hr_candidate_requisitions r
  LEFT JOIN public.admin_ifsp_employee_master m ON m.id = r.employee_master_id
  WHERE r.id = p_intake_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_no := public.admin_recruitment_clean(v_row.requisition_no);
  IF v_no IS NULL OR EXISTS (SELECT 1 FROM public.admin_recruitment_requisitions WHERE requisition_no = v_no) THEN
    v_no := public.admin_recruitment_next_ref('REQ');
  END IF;

  v_status := CASE v_row.status
    WHEN 'approved' THEN CASE WHEN v_row.calling_started_at IS NOT NULL THEN 'open' ELSE 'approved' END
    WHEN 'rejected' THEN 'rejected'
    WHEN 'filled' THEN 'filled'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending_approval'
  END;

  SELECT approval_levels INTO v_levels FROM public.admin_recruitment_settings WHERE id;

  INSERT INTO public.admin_recruitment_requisitions (
    requisition_no, source, source_ref, designation, department, openings, location, employment_type,
    experience_min, skills, required_by, reason, status, status_reason,
    approval_levels_required, approval_level_done,
    raised_by, raised_by_name, submitted_at, decided_at, opened_at, closed_at, created_at
  ) VALUES (
    v_no, 'indus_one', v_row.id,
    coalesce(public.admin_recruitment_clean(v_row.designation_requested), 'Not specified'),
    coalesce(public.admin_recruitment_clean(v_row.department), v_row.raiser_department),
    greatest(1, coalesce(v_row.positions_count, 1)),
    v_row.location,
    coalesce(public.admin_recruitment_clean(v_row.employment_type), 'Permanent'),
    v_row.experience_min_years,
    v_row.skills_required,
    v_row.required_by_date,
    v_row.justification,
    v_status,
    CASE WHEN v_status IN ('rejected', 'cancelled') THEN v_row.hr_remarks END,
    coalesce(v_levels, 1),
    CASE WHEN v_status IN ('approved', 'open', 'filled') THEN coalesce(v_levels, 1) ELSE 0 END,
    v_row.raised_by_user_id,
    v_row.raiser_name,
    v_row.created_at,
    CASE WHEN v_status IN ('approved', 'open', 'filled', 'rejected') THEN coalesce(v_row.reviewed_at, v_row.updated_at) END,
    CASE WHEN v_status IN ('open', 'filled') THEN coalesce(v_row.calling_started_at, v_row.reviewed_at) END,
    CASE WHEN v_status IN ('filled', 'cancelled') THEN v_row.updated_at END,
    coalesce(v_row.created_at, now())
  )
  RETURNING id INTO v_id;

  PERFORM public.admin_recruitment_log(
    NULL, v_id, 'requisition', v_id,
    CASE WHEN v_status = 'pending_approval' THEN 'submitted' ELSE 'imported' END,
    NULL, v_status,
    CASE WHEN v_status = 'pending_approval'
      THEN 'Raised by ' || coalesce(v_row.raiser_name, 'manager') || ' from Indus One — awaiting approval'
      ELSE 'Imported from manager requests (' || replace(v_status, '_', ' ') || ')'
    END,
    jsonb_build_object('source', 'indus_one'),
    'user',
    coalesce(v_row.raiser_name, 'Manager')
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_recruitment_intake_bridge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
BEGIN
  IF coalesce(current_setting('admin_recruitment.syncing_intake', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.admin_recruitment_import_intake(NEW.id);
    ELSIF TG_OP = 'UPDATE' THEN
      SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE source_ref = NEW.id FOR UPDATE;
      IF NOT FOUND THEN
        PERFORM public.admin_recruitment_import_intake(NEW.id);
      ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
            AND v_req.status NOT IN ('cancelled', 'filled', 'rejected') THEN
        UPDATE public.admin_recruitment_requisitions
        SET status = 'cancelled', closed_at = now(), version = version + 1,
            status_reason = coalesce(public.admin_recruitment_clean(NEW.hr_remarks), 'Withdrawn by the requesting manager')
        WHERE id = v_req.id;
        PERFORM public.admin_recruitment_log(
          NULL, v_req.id, 'requisition', v_req.id, 'cancelled', v_req.status, 'cancelled',
          'Withdrawn by the requesting manager', '{}'::jsonb, 'user', coalesce(v_req.raised_by_name, 'Manager')
        );
      ELSIF v_req.status IN ('submitted', 'pending_approval') THEN
        UPDATE public.admin_recruitment_requisitions
        SET designation = coalesce(public.admin_recruitment_clean(NEW.designation_requested), designation),
            department = coalesce(public.admin_recruitment_clean(NEW.department), department),
            openings = greatest(1, coalesce(NEW.positions_count, openings)),
            location = NEW.location,
            employment_type = coalesce(public.admin_recruitment_clean(NEW.employment_type), employment_type),
            experience_min = NEW.experience_min_years,
            skills = NEW.skills_required,
            required_by = NEW.required_by_date,
            reason = NEW.justification
        WHERE id = v_req.id;
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'admin recruitment intake bridge: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.hr_candidate_requisitions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_admin_recruitment_intake_bridge ON public.hr_candidate_requisitions';
    EXECUTE 'CREATE TRIGGER trg_admin_recruitment_intake_bridge
             AFTER INSERT OR UPDATE ON public.hr_candidate_requisitions
             FOR EACH ROW EXECUTE FUNCTION public.admin_recruitment_intake_bridge()';
    PERFORM public.admin_recruitment_import_intake(r.id)
    FROM public.hr_candidate_requisitions r
    ORDER BY r.created_at;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Requisitions: create / edit draft
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_save(
  p_id uuid,
  p_payload jsonb,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
  v_designation text := public.admin_recruitment_clean(p_payload ->> 'designation');
  v_openings integer;
  v_priority text := coalesce(public.admin_recruitment_clean(p_payload ->> 'priority'), 'normal');
  v_from text;
BEGIN
  PERFORM public.admin_recruitment_require('requisitions');

  IF v_designation IS NULL THEN
    RAISE EXCEPTION 'Position / designation is required.';
  END IF;
  v_openings := coalesce(public.admin_recruitment_num(p_payload ->> 'openings'), 1)::integer;
  IF v_openings < 1 OR v_openings > 999 THEN
    RAISE EXCEPTION 'Number of openings must be between 1 and 999.';
  END IF;
  IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    v_priority := 'normal';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.admin_recruitment_requisitions (
      requisition_no, source, designation, department, openings, location, employment_type,
      experience_min, experience_max, skills, qualification, required_by, reason, other_requirements,
      priority, status, raised_by, raised_by_name
    ) VALUES (
      public.admin_recruitment_next_ref('REQ'), 'erp', v_designation,
      public.admin_recruitment_clean(p_payload ->> 'department'),
      v_openings,
      public.admin_recruitment_clean(p_payload ->> 'location'),
      coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), 'Permanent'),
      public.admin_recruitment_num(p_payload ->> 'experienceMin'),
      public.admin_recruitment_num(p_payload ->> 'experienceMax'),
      public.admin_recruitment_clean(p_payload ->> 'skills'),
      public.admin_recruitment_clean(p_payload ->> 'qualification'),
      public.admin_recruitment_date(p_payload ->> 'requiredBy'),
      public.admin_recruitment_clean(p_payload ->> 'reason'),
      public.admin_recruitment_clean(p_payload ->> 'otherRequirements'),
      v_priority, 'draft', auth.uid(), public.admin_recruitment_actor_name(auth.uid())
    )
    RETURNING * INTO v_req;

    PERFORM public.admin_recruitment_log(
      NULL, v_req.id, 'requisition', v_req.id, 'created', NULL, 'draft',
      'Requisition drafted', '{}'::jsonb
    );
    RETURN to_jsonb(v_req);
  END IF;

  SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisition not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_req.version);
  IF v_req.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only draft or rejected requisitions can be edited.';
  END IF;
  IF v_req.source = 'indus_one' THEN
    RAISE EXCEPTION 'This requisition was raised by a manager and can only be changed by them.';
  END IF;
  v_from := v_req.status;

  UPDATE public.admin_recruitment_requisitions
  SET designation = v_designation,
      department = public.admin_recruitment_clean(p_payload ->> 'department'),
      openings = v_openings,
      location = public.admin_recruitment_clean(p_payload ->> 'location'),
      employment_type = coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), 'Permanent'),
      experience_min = public.admin_recruitment_num(p_payload ->> 'experienceMin'),
      experience_max = public.admin_recruitment_num(p_payload ->> 'experienceMax'),
      skills = public.admin_recruitment_clean(p_payload ->> 'skills'),
      qualification = public.admin_recruitment_clean(p_payload ->> 'qualification'),
      required_by = public.admin_recruitment_date(p_payload ->> 'requiredBy'),
      reason = public.admin_recruitment_clean(p_payload ->> 'reason'),
      other_requirements = public.admin_recruitment_clean(p_payload ->> 'otherRequirements'),
      priority = v_priority,
      status = 'draft',
      approval_level_done = 0,
      version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_req;

  PERFORM public.admin_recruitment_log(
    NULL, v_req.id, 'requisition', v_req.id,
    CASE WHEN v_from = 'rejected' THEN 'returned_to_draft' ELSE 'updated' END,
    v_from, 'draft',
    CASE WHEN v_from = 'rejected' THEN 'Revised after rejection' ELSE 'Draft updated' END,
    '{}'::jsonb
  );
  RETURN to_jsonb(v_req);
END;
$$;

-- ---------------------------------------------------------------------------
-- Requisitions: submit for approval (Draft → Submitted → Pending Approval)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_submit(
  p_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
  v_levels integer;
  v_missing text[] := '{}';
BEGIN
  PERFORM public.admin_recruitment_require('requisitions');

  SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisition not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_req.version);
  IF v_req.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft requisitions can be submitted (current status: %).', replace(v_req.status, '_', ' ');
  END IF;

  IF v_req.location IS NULL THEN v_missing := v_missing || 'location / site'; END IF;
  IF v_req.required_by IS NULL THEN v_missing := v_missing || 'required-by date'; END IF;
  IF v_req.reason IS NULL THEN v_missing := v_missing || 'reason'; END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Complete these fields before submitting: %.', array_to_string(v_missing, ', ');
  END IF;
  IF v_req.required_by < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The required-by date is in the past.';
  END IF;

  SELECT approval_levels INTO v_levels FROM public.admin_recruitment_settings WHERE id;

  UPDATE public.admin_recruitment_requisitions
  SET status = 'pending_approval',
      submitted_at = now(),
      approval_levels_required = coalesce(v_levels, 1),
      approval_level_done = 0,
      status_reason = NULL,
      version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_req;

  PERFORM public.admin_recruitment_log(
    NULL, v_req.id, 'requisition', v_req.id, 'submitted', 'draft', 'submitted',
    'Submitted for approval', '{}'::jsonb
  );
  PERFORM public.admin_recruitment_log(
    NULL, v_req.id, 'requisition', v_req.id, 'routed', 'submitted', 'pending_approval',
    format('Awaiting approval (%s level%s)', v_req.approval_levels_required,
           CASE WHEN v_req.approval_levels_required > 1 THEN 's' ELSE '' END),
    jsonb_build_object('levels', v_req.approval_levels_required)
  );
  RETURN to_jsonb(v_req);
END;
$$;

-- ---------------------------------------------------------------------------
-- Requisitions: approve / reject (multi-level)
--   Level 1: users with the approver permission (or Admin role).
--   Level 2+: Admin / Super Admin role only, and a different person from earlier levels.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_decide(
  p_id uuid,
  p_decision text,
  p_remarks text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
  v_uid uuid := auth.uid();
  v_role text;
  v_level integer;
  v_remarks text := public.admin_recruitment_clean(p_remarks);
  v_name text := public.admin_recruitment_actor_name(auth.uid());
BEGIN
  PERFORM public.admin_recruitment_require('approve');
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unknown decision.';
  END IF;

  SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisition not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_req.version);
  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This requisition is not awaiting approval (current status: %).', replace(v_req.status, '_', ' ');
  END IF;

  SELECT public.normalize_erp_role(p.role) INTO v_role FROM public.profiles p WHERE p.id = v_uid;

  IF v_req.raised_by = v_uid AND coalesce(v_role, '') NOT IN ('super_admin', 'super_admin_pro') THEN
    RAISE EXCEPTION 'You cannot approve or reject a requisition you raised.';
  END IF;

  v_level := v_req.approval_level_done + 1;

  IF v_level > 1 THEN
    IF coalesce(v_role, '') NOT IN ('admin', 'super_admin', 'super_admin_pro') THEN
      RAISE EXCEPTION 'Level % approval needs an Admin or Super Admin.', v_level;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.admin_recruitment_events e
      WHERE e.requisition_id = v_req.id
        AND e.action = 'approved'
        AND e.actor_id = v_uid
        AND e.created_at >= coalesce(v_req.submitted_at, v_req.created_at)
    ) THEN
      RAISE EXCEPTION 'A different approver must give the next approval level.';
    END IF;
  END IF;

  IF p_decision = 'reject' THEN
    IF v_remarks IS NULL THEN
      RAISE EXCEPTION 'Enter a reason for rejecting this requisition.';
    END IF;
    UPDATE public.admin_recruitment_requisitions
    SET status = 'rejected', status_reason = v_remarks, decided_at = now(),
        decided_by = v_uid, decided_by_name = v_name, version = version + 1
    WHERE id = p_id
    RETURNING * INTO v_req;
    PERFORM public.admin_recruitment_log(
      NULL, v_req.id, 'requisition', v_req.id, 'rejected', 'pending_approval', 'rejected',
      format('Rejected at level %s', v_level),
      jsonb_build_object('level', v_level, 'remarks', v_remarks)
    );
    PERFORM public.admin_recruitment_sync_intake(v_req.id, v_remarks);
    RETURN to_jsonb(v_req);
  END IF;

  IF v_level >= v_req.approval_levels_required THEN
    UPDATE public.admin_recruitment_requisitions
    SET status = 'approved', approval_level_done = v_level, status_reason = NULL,
        decided_at = now(), decided_by = v_uid, decided_by_name = v_name, version = version + 1
    WHERE id = p_id
    RETURNING * INTO v_req;
    PERFORM public.admin_recruitment_log(
      NULL, v_req.id, 'requisition', v_req.id, 'approved', 'pending_approval', 'approved',
      CASE WHEN v_req.approval_levels_required > 1 THEN format('Final approval (level %s)', v_level) ELSE 'Approved' END,
      jsonb_build_object('level', v_level, 'remarks', v_remarks, 'final', true)
    );
    PERFORM public.admin_recruitment_sync_intake(v_req.id, v_remarks);
  ELSE
    UPDATE public.admin_recruitment_requisitions
    SET approval_level_done = v_level, version = version + 1
    WHERE id = p_id
    RETURNING * INTO v_req;
    PERFORM public.admin_recruitment_log(
      NULL, v_req.id, 'requisition', v_req.id, 'approved', 'pending_approval', 'pending_approval',
      format('Approved at level %s of %s — awaiting next approver', v_level, v_req.approval_levels_required),
      jsonb_build_object('level', v_level, 'remarks', v_remarks, 'final', false)
    );
  END IF;

  RETURN to_jsonb(v_req);
END;
$$;

-- ---------------------------------------------------------------------------
-- Requisitions: open / filled / cancel / reopen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_recruitment_requisition_transition(
  p_id uuid,
  p_action text,
  p_remarks text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_recruitment_requisitions%rowtype;
  v_from text;
  v_to text;
  v_remarks text := public.admin_recruitment_clean(p_remarks);
  v_blocking integer;
BEGIN
  PERFORM public.admin_recruitment_require('requisitions');

  SELECT * INTO v_req FROM public.admin_recruitment_requisitions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisition not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_req.version);
  v_from := v_req.status;

  CASE p_action
    WHEN 'open' THEN
      IF v_from <> 'approved' THEN
        RAISE EXCEPTION 'Only approved requisitions can be opened for hiring.';
      END IF;
      v_to := 'open';
    WHEN 'fill' THEN
      IF v_from <> 'open' THEN
        RAISE EXCEPTION 'Only open requisitions can be marked filled.';
      END IF;
      v_to := 'filled';
    WHEN 'cancel' THEN
      IF v_from NOT IN ('draft', 'submitted', 'pending_approval', 'approved', 'open') THEN
        RAISE EXCEPTION 'This requisition cannot be cancelled (current status: %).', replace(v_from, '_', ' ');
      END IF;
      IF v_remarks IS NULL THEN
        RAISE EXCEPTION 'Enter a reason for cancelling this requisition.';
      END IF;
      SELECT count(*) INTO v_blocking
      FROM public.admin_recruitment_candidates c
      WHERE c.requisition_id = v_req.id
        AND c.outcome IS NULL
        AND public.admin_recruitment_stage_rank(c.stage) BETWEEN public.admin_recruitment_stage_rank('offer')
                                                         AND public.admin_recruitment_stage_rank('ready_to_join');
      IF v_blocking > 0 THEN
        RAISE EXCEPTION '% candidate(s) on this requisition already have an offer. Close or withdraw them before cancelling.', v_blocking;
      END IF;
      v_to := 'cancelled';
    WHEN 'reopen' THEN
      IF v_from NOT IN ('filled', 'cancelled') OR v_req.decided_at IS NULL OR v_req.approval_level_done < v_req.approval_levels_required THEN
        RAISE EXCEPTION 'Only previously approved requisitions that are filled or cancelled can be reopened.';
      END IF;
      PERFORM public.admin_recruitment_require('approve');
      IF v_remarks IS NULL THEN
        RAISE EXCEPTION 'Enter a reason for reopening this requisition.';
      END IF;
      v_to := 'open';
    ELSE
      RAISE EXCEPTION 'Unknown requisition action.';
  END CASE;

  UPDATE public.admin_recruitment_requisitions
  SET status = v_to,
      status_reason = CASE WHEN v_to IN ('cancelled', 'filled') THEN v_remarks ELSE NULL END,
      opened_at = CASE WHEN v_to = 'open' THEN coalesce(opened_at, now()) ELSE opened_at END,
      closed_at = CASE WHEN v_to IN ('cancelled', 'filled') THEN now() WHEN v_to = 'open' THEN NULL ELSE closed_at END,
      version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_req;

  PERFORM public.admin_recruitment_log(
    NULL, v_req.id, 'requisition', v_req.id,
    CASE p_action WHEN 'open' THEN 'opened' WHEN 'fill' THEN 'filled' WHEN 'cancel' THEN 'cancelled' ELSE 'reopened' END,
    v_from, v_to,
    CASE p_action
      WHEN 'open' THEN 'Opened for hiring'
      WHEN 'fill' THEN 'Marked filled'
      WHEN 'cancel' THEN 'Cancelled'
      ELSE 'Reopened for hiring'
    END,
    jsonb_build_object('remarks', v_remarks)
  );
  PERFORM public.admin_recruitment_sync_intake(v_req.id, v_remarks);
  RETURN to_jsonb(v_req);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_recruitment_actor_name(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_log(uuid, uuid, text, uuid, text, text, text, text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_require(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_request_begin(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_request_end(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_set_stage(uuid, text, text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_use_requisition(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_sync_intake(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_import_intake(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_intake_bridge() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_recruitment_requisition_save(uuid, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_requisition_submit(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_requisition_decide(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_recruitment_requisition_transition(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_requisition_save(uuid, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_requisition_submit(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_requisition_decide(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_requisition_transition(uuid, text, text, integer) TO authenticated;

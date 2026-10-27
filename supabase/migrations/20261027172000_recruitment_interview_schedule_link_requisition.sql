-- Allow scheduling an interview to also link the candidate to an approved/open
-- requisition when they were added without one ("Not linked yet").

CREATE OR REPLACE FUNCTION public.admin_recruitment_interview_schedule(
  p_candidate_id uuid,
  p_payload jsonb,
  p_request_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev jsonb;
  v_c public.admin_recruitment_candidates%rowtype;
  v_at timestamptz := nullif(p_payload ->> 'scheduledAt', '')::timestamptz;
  v_mode text := lower(coalesce(public.admin_recruitment_clean(p_payload ->> 'mode'), 'office'));
  v_interviewers jsonb := CASE WHEN jsonb_typeof(p_payload -> 'interviewers') = 'array' THEN p_payload -> 'interviewers' ELSE '[]'::jsonb END;
  v_link_req uuid := nullif(p_payload ->> 'requisitionId', '')::uuid;
  v_round integer;
  v_row public.admin_recruitment_interviews%rowtype;
BEGIN
  PERFORM public.admin_recruitment_require('interviews');

  v_prev := public.admin_recruitment_request_begin(p_request_key, 'interview_schedule');
  IF v_prev IS NOT NULL THEN
    RETURN v_prev;
  END IF;

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage NOT IN ('shortlisted', 'interview') THEN
    RAISE EXCEPTION 'Interviews can be scheduled for shortlisted candidates (current stage: %).', replace(v_c.stage, '_', ' ');
  END IF;
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'Interview date and time are required.';
  END IF;
  IF v_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'The interview time is in the past.';
  END IF;
  IF v_mode NOT IN ('office', 'online', 'phone') THEN
    RAISE EXCEPTION 'Choose Office, Online or Phone.';
  END IF;
  IF jsonb_array_length(v_interviewers) = 0
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_interviewers) i WHERE public.admin_recruitment_clean(i ->> 'name') IS NOT NULL) THEN
    RAISE EXCEPTION 'Assign at least one interviewer.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_recruitment_interviews WHERE candidate_id = p_candidate_id AND status = 'scheduled') THEN
    RAISE EXCEPTION 'This candidate already has a scheduled interview. Reschedule or complete it first.';
  END IF;

  -- Link requisition at schedule time when the candidate was added without one.
  IF v_c.requisition_id IS NULL THEN
    IF v_link_req IS NULL THEN
      RAISE EXCEPTION 'Link this candidate to an approved requisition first.';
    END IF;
    PERFORM 1 FROM public.admin_recruitment_requisitions
    WHERE id = v_link_req AND status IN ('approved', 'open');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Candidates can only be linked to approved requisitions.';
    END IF;
    UPDATE public.admin_recruitment_candidates
    SET
      requisition_id = v_link_req,
      version = version + 1,
      updated_at = now(),
      last_activity_at = now()
    WHERE id = p_candidate_id;
    PERFORM public.admin_recruitment_log(
      p_candidate_id, v_link_req, 'candidate', p_candidate_id, 'profile_updated', NULL, NULL,
      'Linked to requisition when scheduling interview',
      jsonb_build_object('requisitionId', v_link_req)
    );
    SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id;
  ELSIF v_link_req IS NOT NULL AND v_link_req IS DISTINCT FROM v_c.requisition_id THEN
    RAISE EXCEPTION 'This candidate is already linked to a different requisition.';
  END IF;

  PERFORM public.admin_recruitment_use_requisition(v_c.requisition_id, p_candidate_id);

  SELECT coalesce(max(round_no), 0) + 1 INTO v_round
  FROM public.admin_recruitment_interviews
  WHERE candidate_id = p_candidate_id AND status IN ('attended', 'evaluated');

  INSERT INTO public.admin_recruitment_interviews (
    candidate_id, round_no, round_name, scheduled_at, duration_mins, mode, location, interviewers,
    status, created_by, created_by_name
  ) VALUES (
    p_candidate_id, v_round,
    coalesce(public.admin_recruitment_clean(p_payload ->> 'roundName'), 'Round ' || v_round),
    v_at,
    coalesce(public.admin_recruitment_num(p_payload ->> 'durationMins')::integer, 45),
    v_mode,
    public.admin_recruitment_clean(p_payload ->> 'location'),
    v_interviewers,
    'scheduled', auth.uid(), public.admin_recruitment_actor_name(auth.uid())
  )
  RETURNING * INTO v_row;

  PERFORM public.admin_recruitment_log(
    p_candidate_id, v_c.requisition_id, 'interview', v_row.id, 'interview_scheduled', NULL, 'scheduled',
    format('%s scheduled (%s) with %s', v_row.round_name, v_mode,
           (SELECT string_agg(i ->> 'name', ', ') FROM jsonb_array_elements(v_interviewers) i)),
    jsonb_build_object('scheduledAt', v_at)
  );

  IF v_c.stage = 'shortlisted' THEN
    PERFORM public.admin_recruitment_set_stage(p_candidate_id, 'interview', 'Moved to Interview', '{}'::jsonb);
  END IF;

  RETURN public.admin_recruitment_request_end(p_request_key, 'interview_schedule', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_interview_schedule(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_interview_schedule(uuid, jsonb, text) TO authenticated;

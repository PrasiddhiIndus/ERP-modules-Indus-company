-- Allow recruiters to skip interviews for a shortlisted (or in-interview)
-- candidate and move them straight to Selected so an offer can be prepared.

CREATE OR REPLACE FUNCTION public.admin_recruitment_bypass_interview(
  p_candidate_id uuid,
  p_note text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_note text := public.admin_recruitment_clean(p_note);
  v_cancelled integer := 0;
BEGIN
  PERFORM public.admin_recruitment_require('candidates');
  PERFORM public.admin_recruitment_require('offers');

  SELECT * INTO v_c
  FROM public.admin_recruitment_candidates
  WHERE id = p_candidate_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_c.version);
  PERFORM public.admin_recruitment_assert_live(v_c);

  IF v_c.stage NOT IN ('shortlisted', 'interview') THEN
    RAISE EXCEPTION 'Interview can be skipped only for shortlisted or interview-stage candidates (current: %).',
      replace(v_c.stage, '_', ' ');
  END IF;

  IF v_c.requisition_id IS NULL THEN
    RAISE EXCEPTION 'Link this candidate to an approved requisition before preparing an offer.';
  END IF;

  -- Drop any open interview rounds — bypass means we will not evaluate them.
  UPDATE public.admin_recruitment_interviews
  SET
    status = 'cancelled',
    status_reason = coalesce(v_note, 'Interview skipped — moving to offer'),
    version = version + 1,
    updated_at = now()
  WHERE candidate_id = p_candidate_id
    AND status IN ('scheduled', 'attended');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  PERFORM public.admin_recruitment_use_requisition(v_c.requisition_id, p_candidate_id);

  PERFORM public.admin_recruitment_set_stage(
    p_candidate_id,
    'selected',
    'Interview skipped — selected for offer'
      || CASE WHEN v_note IS NOT NULL THEN ' — ' || v_note ELSE '' END,
    jsonb_build_object(
      'bypassInterview', true,
      'note', v_note,
      'cancelledInterviews', v_cancelled
    )
  );

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id;
  RETURN to_jsonb(v_c);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_bypass_interview(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_bypass_interview(uuid, text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

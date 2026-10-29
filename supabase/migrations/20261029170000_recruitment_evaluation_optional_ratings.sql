-- Evaluation parameters / ratings / per-row comments are optional.
-- Average is computed only from scores that are present (1–5). Recommendation rules unchanged.

CREATE OR REPLACE FUNCTION public.admin_recruitment_interview_evaluate(
  p_id uuid,
  p_ratings jsonb,
  p_recommendation text,
  p_remarks text,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_i public.admin_recruitment_interviews%rowtype;
  v_c public.admin_recruitment_candidates%rowtype;
  v_avg numeric;
  v_bad integer;
  v_remarks text := public.admin_recruitment_clean(p_remarks);
  v_first boolean;
  v_payload jsonb := coalesce(p_ratings, '{}'::jsonb);
BEGIN
  PERFORM public.admin_recruitment_require('interviews');
  IF p_recommendation NOT IN ('strong_hire', 'hire', 'hold', 'reject') THEN
    RAISE EXCEPTION 'Choose a final recommendation.';
  END IF;
  IF jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid evaluation payload.';
  END IF;

  -- Only score keys (not __remarks) must be 1–5 when present; all criteria optional.
  SELECT count(*) INTO v_bad
  FROM jsonb_each(v_payload) r
  WHERE r.key <> '__remarks'
    AND coalesce(r.value #>> '{}', '') !~ '^[1-5]$';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Each rating must be between 1 and 5.';
  END IF;
  IF p_recommendation IN ('hold', 'reject') AND v_remarks IS NULL THEN
    RAISE EXCEPTION 'Add remarks explaining the % recommendation.', p_recommendation;
  END IF;

  SELECT * INTO v_i FROM public.admin_recruitment_interviews WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Interview not found.';
  END IF;
  PERFORM public.admin_recruitment_check_version(p_expected_version, v_i.version);
  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = v_i.candidate_id FOR UPDATE;

  IF v_i.status NOT IN ('attended', 'evaluated') THEN
    RAISE EXCEPTION 'Mark the interview as attended before recording the evaluation.';
  END IF;
  IF v_i.status = 'evaluated' AND public.admin_recruitment_stage_rank(v_c.stage) > public.admin_recruitment_stage_rank('interview') THEN
    RAISE EXCEPTION 'The evaluation is locked because the candidate has moved past the interview stage.';
  END IF;
  v_first := v_i.status = 'attended';

  SELECT round(avg((r.value #>> '{}')::numeric), 1) INTO v_avg
  FROM jsonb_each(v_payload) r
  WHERE r.key <> '__remarks'
    AND coalesce(r.value #>> '{}', '') ~ '^[1-5]$';

  UPDATE public.admin_recruitment_interviews
  SET status = 'evaluated',
      ratings = v_payload,
      overall_rating = v_avg,
      recommendation = p_recommendation,
      remarks = v_remarks,
      evaluated_by = auth.uid(),
      evaluated_by_name = public.admin_recruitment_actor_name(auth.uid()),
      evaluated_at = now(),
      version = version + 1
  WHERE id = p_id
  RETURNING * INTO v_i;

  PERFORM public.admin_recruitment_log(
    v_i.candidate_id, v_c.requisition_id, 'interview', v_i.id,
    CASE WHEN v_first THEN 'interview_evaluated' ELSE 'interview_evaluation_updated' END,
    CASE WHEN v_first THEN 'attended' ELSE 'evaluated' END, 'evaluated',
    CASE
      WHEN v_avg IS NULL THEN format('%s evaluated — %s', v_i.round_name, replace(p_recommendation, '_', ' '))
      ELSE format('%s evaluated — %s/5, %s', v_i.round_name, v_avg, replace(p_recommendation, '_', ' '))
    END,
    jsonb_build_object('rating', v_avg, 'recommendation', p_recommendation)
  );
  RETURN to_jsonb(v_i);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recruitment_interview_evaluate(uuid, jsonb, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recruitment_interview_evaluate(uuid, jsonb, text, text, integer) TO authenticated, service_role;

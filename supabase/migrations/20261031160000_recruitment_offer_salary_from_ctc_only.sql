-- Prepare offer no longer accepts a typed monthly salary. Always use the
-- candidate CTC calculator value (expected_ctc).

CREATE OR REPLACE FUNCTION public.admin_recruitment_offer_save_draft(
  p_candidate_id uuid,
  p_offer_id uuid,
  p_payload jsonb,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.admin_recruitment_candidates%rowtype;
  v_r public.admin_recruitment_requisitions%rowtype;
  v_o public.admin_recruitment_offers%rowtype;
  v_gross numeric;
  v_join date := public.admin_recruitment_date(p_payload ->> 'joiningDate');
BEGIN
  PERFORM public.admin_recruitment_require('offers');

  SELECT * INTO v_c FROM public.admin_recruitment_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;
  PERFORM public.admin_recruitment_assert_live(v_c);
  IF v_c.stage <> 'selected' THEN
    RAISE EXCEPTION 'Offers can be prepared only for selected candidates (current stage: %).', replace(v_c.stage, '_', ' ');
  END IF;
  SELECT * INTO v_r FROM public.admin_recruitment_requisitions WHERE id = v_c.requisition_id;

  v_gross := v_c.expected_ctc;
  IF v_gross IS NULL OR v_gross <= 0 THEN
    RAISE EXCEPTION 'Save this candidate''s CTC (CTC calculator on the candidate page) before preparing the offer.';
  END IF;

  IF v_join IS NOT NULL AND v_join < public.admin_recruitment_today() THEN
    RAISE EXCEPTION 'The joining date cannot be in the past.';
  END IF;

  IF p_offer_id IS NULL THEN
    BEGIN
      INSERT INTO public.admin_recruitment_offers (
        candidate_id, status, designation, department, location, employment_type,
        monthly_gross, annual_ctc, joining_date, terms, created_by, created_by_name
      ) VALUES (
        p_candidate_id, 'draft',
        coalesce(public.admin_recruitment_clean(p_payload ->> 'designation'), v_r.designation, 'Pending'),
        coalesce(public.admin_recruitment_clean(p_payload ->> 'department'), v_r.department),
        coalesce(public.admin_recruitment_clean(p_payload ->> 'location'), v_r.location),
        coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), v_r.employment_type, 'Permanent'),
        v_gross, v_gross * 12, v_join,
        public.admin_recruitment_clean(p_payload ->> 'terms'),
        auth.uid(), public.admin_recruitment_actor_name(auth.uid())
      )
      RETURNING * INTO v_o;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'This candidate already has an active offer.';
    END;
    PERFORM public.admin_recruitment_log(p_candidate_id, v_c.requisition_id, 'offer', v_o.id, 'offer_drafted', NULL, 'draft', 'Offer draft prepared', '{}'::jsonb);
  ELSE
    SELECT * INTO v_o FROM public.admin_recruitment_offers WHERE id = p_offer_id AND candidate_id = p_candidate_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Offer not found.';
    END IF;
    PERFORM public.admin_recruitment_check_version(p_expected_version, v_o.version);
    IF v_o.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft offers can be edited. Withdraw the offer and prepare a new one.';
    END IF;
    UPDATE public.admin_recruitment_offers SET
      designation = coalesce(public.admin_recruitment_clean(p_payload ->> 'designation'), designation),
      department = CASE WHEN p_payload ? 'department' THEN public.admin_recruitment_clean(p_payload ->> 'department') ELSE department END,
      location = CASE WHEN p_payload ? 'location' THEN public.admin_recruitment_clean(p_payload ->> 'location') ELSE location END,
      employment_type = coalesce(public.admin_recruitment_clean(p_payload ->> 'employmentType'), employment_type),
      monthly_gross = v_gross,
      annual_ctc = v_gross * 12,
      joining_date = CASE WHEN p_payload ? 'joiningDate' THEN v_join ELSE joining_date END,
      terms = CASE WHEN p_payload ? 'terms' THEN public.admin_recruitment_clean(p_payload ->> 'terms') ELSE terms END,
      version = version + 1
    WHERE id = p_offer_id
    RETURNING * INTO v_o;
  END IF;

  RETURN to_jsonb(v_o);
END;
$$;

COMMENT ON FUNCTION public.admin_recruitment_offer_save_draft(uuid, uuid, jsonb, integer) IS
  'Save offer draft. Monthly salary always comes from candidate expected_ctc (CTC calculator).';

NOTIFY pgrst, 'reload schema';

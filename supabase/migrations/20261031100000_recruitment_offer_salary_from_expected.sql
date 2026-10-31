-- Offer draft: when Monthly gross is not supplied, use the candidate's recruitment
-- salary (expected_ctc) — the amount captured during hiring — not payroll/CTC.

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
  v_gross numeric := public.admin_recruitment_num(p_payload ->> 'monthlyGross');
  v_ctc numeric := public.admin_recruitment_num(p_payload ->> 'annualCtc');
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

  -- New drafts: fall back to recruitment-captured expected salary when monthly gross omitted.
  IF p_offer_id IS NULL AND v_gross IS NULL THEN
    v_gross := v_c.expected_ctc;
  END IF;

  IF v_gross IS NOT NULL AND v_gross <= 0 THEN
    RAISE EXCEPTION 'Monthly gross must be greater than zero.';
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
        v_gross, coalesce(v_ctc, CASE WHEN v_gross IS NOT NULL THEN v_gross * 12 ELSE NULL END), v_join,
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
      monthly_gross = CASE WHEN p_payload ? 'monthlyGross' THEN v_gross ELSE monthly_gross END,
      annual_ctc = CASE WHEN p_payload ? 'annualCtc' THEN v_ctc
                        WHEN p_payload ? 'monthlyGross' THEN CASE WHEN v_gross IS NOT NULL THEN v_gross * 12 ELSE NULL END
                        ELSE annual_ctc END,
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
  'Save offer draft. Monthly gross defaults to candidate expected_ctc (recruitment salary) when omitted on create.';

-- Align blank monthly_gross with recruitment expected salary.
UPDATE public.admin_recruitment_offers o
SET
  monthly_gross = c.expected_ctc,
  annual_ctc = c.expected_ctc * 12,
  updated_at = now()
FROM public.admin_recruitment_candidates c
WHERE o.candidate_id = c.id
  AND o.monthly_gross IS NULL
  AND c.expected_ctc IS NOT NULL
  AND c.expected_ctc > 0;

-- Neel Patel OFR/2026/00001: monthly_gross was a CTC-derived figure (27984) instead of the
-- recruitment-offered amount stored on the candidate (expected_ctc = 26000).
UPDATE public.admin_recruitment_offers o
SET
  monthly_gross = c.expected_ctc,
  annual_ctc = c.expected_ctc * 12,
  updated_at = now()
FROM public.admin_recruitment_candidates c
WHERE o.candidate_id = c.id
  AND o.offer_ref = 'IFSPL/OFR/2026/00001'
  AND c.expected_ctc IS NOT NULL
  AND c.expected_ctc > 0
  AND o.monthly_gross IS DISTINCT FROM c.expected_ctc;

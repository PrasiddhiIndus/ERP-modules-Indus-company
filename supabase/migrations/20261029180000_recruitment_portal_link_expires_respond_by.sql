-- Offer portal links expire at end of Respond-by (valid_until) day IST — not days after.
CREATE OR REPLACE FUNCTION public.admin_recruitment_portal_issue(
  p_candidate_id uuid,
  p_purpose text,
  p_ref_id uuid,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_expires timestamptz;
  v_valid_until date;
BEGIN
  PERFORM public.admin_recruitment_require_service();
  IF p_purpose NOT IN ('offer', 'appointment', 'documents') THEN
    RAISE EXCEPTION 'Unknown link purpose.';
  END IF;
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid token.';
  END IF;

  SELECT portal_link_days INTO v_days FROM public.admin_recruitment_settings WHERE id;
  v_expires := now() + make_interval(days => coalesce(v_days, 14));

  IF p_purpose = 'offer' THEN
    SELECT valid_until INTO v_valid_until FROM public.admin_recruitment_offers WHERE id = p_ref_id;
    IF v_valid_until IS NULL THEN
      RAISE EXCEPTION 'Offer respond-by date is missing.';
    END IF;
    -- Valid through the whole Respond-by date (Asia/Kolkata).
    v_expires := ((v_valid_until + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  END IF;

  UPDATE public.admin_recruitment_portal_tokens
  SET revoked_at = now()
  WHERE candidate_id = p_candidate_id AND purpose = p_purpose
    AND ref_id IS NOT DISTINCT FROM p_ref_id AND revoked_at IS NULL;

  INSERT INTO public.admin_recruitment_portal_tokens (candidate_id, purpose, ref_id, token_hash, expires_at)
  VALUES (p_candidate_id, p_purpose, p_ref_id, p_token_hash, v_expires);

  RETURN jsonb_build_object('expiresAt', v_expires);
END;
$$;

COMMENT ON FUNCTION public.admin_recruitment_portal_issue(uuid, text, uuid, text) IS
  'Issues a portal token. Offer links expire at end of offer valid_until (Respond by) in IST.';

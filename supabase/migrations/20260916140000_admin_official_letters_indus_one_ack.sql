-- Align ERP Admin with Indus One official-letter acknowledgment fields.
-- Indus One writes: agreed, acknowledged_at, acknowledged_name via acknowledge_my_official_letter.

ALTER TABLE public.admin_official_letters
  ADD COLUMN IF NOT EXISTS object_key text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_name text,
  ADD COLUMN IF NOT EXISTS agreed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_official_letters.object_key IS
  'Cloudflare R2 object key for the generated letter PDF (optional).';
COMMENT ON COLUMN public.admin_official_letters.acknowledged_at IS
  'When the employee acknowledged the letter in Indus One.';
COMMENT ON COLUMN public.admin_official_letters.acknowledged_name IS
  'Typed full name used as the employee signature.';
COMMENT ON COLUMN public.admin_official_letters.agreed IS
  'True after the employee checked Agree and signed in Indus One.';

CREATE INDEX IF NOT EXISTS admin_official_letters_emp_ack_idx
  ON public.admin_official_letters (employee_master_id, acknowledged_at DESC NULLS LAST);

DROP POLICY IF EXISTS admin_official_letters_select_own ON public.admin_official_letters;
CREATE POLICY admin_official_letters_select_own
  ON public.admin_official_letters
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master m
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.id = admin_official_letters.employee_master_id
        AND (
          m.user_id = auth.uid()
          OR (
            p.employee_code IS NOT NULL
            AND btrim(p.employee_code) <> ''
            AND public.emp_codes_match(m.employee_code, p.employee_code)
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.acknowledge_my_official_letter(
  p_letter_id uuid,
  p_signed_name text,
  p_agreed boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_official_letters;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF coalesce(p_agreed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'You must agree to continue';
  END IF;

  v_name := nullif(btrim(coalesce(p_signed_name, '')), '');
  IF v_name IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Please sign with your full name';
  END IF;

  IF p_letter_id IS NULL THEN
    RAISE EXCEPTION 'letter_id is required';
  END IF;

  SELECT l.*
  INTO v_row
  FROM public.admin_official_letters l
  JOIN public.admin_ifsp_employee_master m ON m.id = l.employee_master_id
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE l.id = p_letter_id
    AND (
      m.user_id = auth.uid()
      OR (
        p.employee_code IS NOT NULL
        AND btrim(p.employee_code) <> ''
        AND public.emp_codes_match(m.employee_code, p.employee_code)
      )
    )
  FOR UPDATE OF l;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not found or not available to you';
  END IF;

  IF v_row.acknowledged_at IS NOT NULL AND coalesce(v_row.agreed, false) THEN
    RETURN to_jsonb(v_row);
  END IF;

  UPDATE public.admin_official_letters
  SET
    agreed = true,
    acknowledged_name = v_name,
    acknowledged_at = now()
  WHERE id = p_letter_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_my_official_letter(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_my_official_letter(uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.acknowledge_my_official_letter(uuid, text, boolean) IS
  'Record Indus One agree + typed-name acknowledgment for the caller''s own official letter.';

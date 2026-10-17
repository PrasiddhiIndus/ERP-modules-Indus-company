-- Indus One access for personal greeting cards (birthday / wedding anniversary).
-- letter id = admin_personal_letters.id (uuid). template_file is text (jpg name), NOT a uuid.
-- Rollback: see supabase/rollbacks/20261016140000_admin_personal_letters_indus_one_down.sql

-- Own cards (celebrant)
DROP POLICY IF EXISTS admin_personal_letters_select_own ON public.admin_personal_letters;
CREATE POLICY admin_personal_letters_select_own
  ON public.admin_personal_letters
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_ifsp_employee_master m
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.id = admin_personal_letters.employee_master_id
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

-- Today's celebrations (any signed-in employee — for "X is celebrating…" notices)
DROP POLICY IF EXISTS admin_personal_letters_select_today ON public.admin_personal_letters;
CREATE POLICY admin_personal_letters_select_today
  ON public.admin_personal_letters
  FOR SELECT
  TO authenticated
  USING (
    occasion_date = ((now() AT TIME ZONE 'Asia/Kolkata')::date)
  );

-- My personal letters (no uuid argument needed)
CREATE OR REPLACE FUNCTION public.list_my_personal_letters()
RETURNS SETOF public.admin_personal_letters
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.*
  FROM public.admin_personal_letters l
  JOIN public.admin_ifsp_employee_master m ON m.id = l.employee_master_id
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND (
      m.user_id = auth.uid()
      OR (
        p.employee_code IS NOT NULL
        AND btrim(p.employee_code) <> ''
        AND public.emp_codes_match(m.employee_code, p.employee_code)
      )
    )
  ORDER BY l.occasion_date DESC, l.created_at DESC;
$$;

-- Today's celebrations for home notifications (no uuid argument)
CREATE OR REPLACE FUNCTION public.list_todays_personal_letter_celebrations()
RETURNS TABLE (
  id uuid,
  employee_master_id bigint,
  letter_kind text,
  occasion_date date,
  subject text,
  employee_full_name text,
  file_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.employee_master_id,
    l.letter_kind,
    l.occasion_date,
    l.subject,
    l.employee_full_name,
    l.file_name,
    l.created_at
  FROM public.admin_personal_letters l
  WHERE l.occasion_date = ((now() AT TIME ZONE 'Asia/Kolkata')::date)
  ORDER BY l.letter_kind, l.employee_full_name;
$$;

-- Fetch one letter by its own uuid (never pass template_file here)
CREATE OR REPLACE FUNCTION public.get_personal_letter_by_id(p_letter_id uuid)
RETURNS public.admin_personal_letters
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_personal_letters;
  v_today date := ((now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_is_own boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_letter_id IS NULL THEN
    RAISE EXCEPTION 'letter_id is required';
  END IF;

  SELECT l.*
  INTO v_row
  FROM public.admin_personal_letters l
  WHERE l.id = p_letter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personal letter not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.admin_ifsp_employee_master m
    LEFT JOIN public.profiles p ON p.id = auth.uid()
    WHERE m.id = v_row.employee_master_id
      AND (
        m.user_id = auth.uid()
        OR (
          p.employee_code IS NOT NULL
          AND btrim(p.employee_code) <> ''
          AND public.emp_codes_match(m.employee_code, p.employee_code)
        )
      )
  )
  INTO v_is_own;

  IF v_is_own OR v_row.occasion_date = v_today THEN
    RETURN v_row;
  END IF;

  -- Admin / HR module access (same idea as ERP admin UI)
  IF (SELECT public.current_user_can_access_module('admin'))
     OR (SELECT public.current_user_has_admin_module_access())
     OR (SELECT public.current_user_can_access_module('hr'))
  THEN
    RETURN v_row;
  END IF;

  RAISE EXCEPTION 'Personal letter not available to you';
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_personal_letters() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_todays_personal_letter_celebrations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_personal_letter_by_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_my_personal_letters() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_todays_personal_letter_celebrations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_personal_letter_by_id(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_my_personal_letters() IS
  'Indus One: greeting cards for the signed-in employee (no uuid arg).';
COMMENT ON FUNCTION public.list_todays_personal_letter_celebrations() IS
  'Indus One: who is celebrating birthday/anniversary today (IST).';
COMMENT ON FUNCTION public.get_personal_letter_by_id(uuid) IS
  'Indus One: one personal letter by admin_personal_letters.id (uuid). Do not pass template_file.';

NOTIFY pgrst, 'reload schema';

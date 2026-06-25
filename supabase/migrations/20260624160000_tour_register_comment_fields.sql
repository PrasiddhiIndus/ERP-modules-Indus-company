-- Tour comments: LMS tour_requests uses destination/purpose; admin mirror uses location/reason/remarks.

CREATE OR REPLACE FUNCTION public.tour_register_location_text(
  p_location text,
  p_destination text DEFAULT NULL,
  p_place text DEFAULT NULL,
  p_tour_location text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_destination, '')), ''),
    nullif(btrim(coalesce(p_place, '')), ''),
    nullif(btrim(coalesce(p_tour_location, '')), ''),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.tour_register_reason_text(
  p_reason text,
  p_purpose text DEFAULT NULL,
  p_remarks text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_purpose, '')), ''),
    nullif(btrim(coalesce(p_remarks, '')), ''),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.fetch_approved_tour_marks_for_register(
  p_from_date date,
  p_to_date date
)
RETURNS TABLE (
  employee_code text,
  register_date date,
  location text,
  reason text,
  tour_request_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indus_one, public
AS $$
BEGIN
  IF NOT (
    public.current_user_can_access_module('admin')
    OR (SELECT coalesce(indus_one.current_user_is_manager(), false))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH approved AS (
    SELECT
      ar.id,
      ar.employee_code,
      ar.from_date,
      ar.to_date,
      public.tour_register_location_text(ar.location) AS location,
      public.tour_register_reason_text(ar.reason, NULL, ar.remarks) AS reason
    FROM indus_one.admin_tour_requests ar
    WHERE lower(btrim(coalesce(ar.status, ''))) = 'approved'
      AND ar.from_date <= p_to_date
      AND ar.to_date >= p_from_date
    UNION ALL
    SELECT
      tr.id,
      tr.employee_code,
      tr.from_date,
      tr.to_date,
      public.tour_register_location_text(tr.location, tr.destination) AS location,
      public.tour_register_reason_text(tr.reason, tr.purpose, tr.remarks) AS reason
    FROM indus_one.tour_requests tr
    WHERE lower(btrim(coalesce(tr.status, ''))) = 'approved'
      AND tr.from_date <= p_to_date
      AND tr.to_date >= p_from_date
      AND NOT EXISTS (
        SELECT 1 FROM indus_one.admin_tour_requests ar WHERE ar.id = tr.id
      )
  ),
  mark_rows AS (
    SELECT
      m.employee_code,
      m.register_date,
      public.tour_register_location_text(
        coalesce(ar.location, tr.location),
        tr.destination
      ) AS location,
      public.tour_register_reason_text(
        coalesce(ar.reason, tr.reason),
        tr.purpose,
        coalesce(ar.remarks, tr.remarks)
      ) AS reason,
      m.tour_request_id
    FROM indus_one.admin_tour_attendance_marks m
    LEFT JOIN indus_one.admin_tour_requests ar ON ar.id = m.tour_request_id
    LEFT JOIN indus_one.tour_requests tr ON tr.id = m.tour_request_id
    WHERE coalesce(m.reverted, false) = false
      AND m.register_date >= p_from_date
      AND m.register_date <= p_to_date
  ),
  expanded AS (
    SELECT
      a.employee_code,
      gs.d::date AS register_date,
      a.location,
      a.reason,
      a.id AS tour_request_id
    FROM approved a
    CROSS JOIN LATERAL generate_series(
      greatest(a.from_date, p_from_date),
      least(a.to_date, p_to_date),
      interval '1 day'
    ) AS gs(d)
  )
  SELECT mr.employee_code, mr.register_date, mr.location, mr.reason, mr.tour_request_id
  FROM mark_rows mr
  UNION ALL
  SELECT e.employee_code, e.register_date, e.location, e.reason, e.tour_request_id
  FROM expanded e
  WHERE NOT EXISTS (
    SELECT 1
    FROM mark_rows mr
    WHERE btrim(coalesce(mr.employee_code, '')) = btrim(coalesce(e.employee_code, ''))
      AND mr.register_date = e.register_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_approved_tour_marks_for_register(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

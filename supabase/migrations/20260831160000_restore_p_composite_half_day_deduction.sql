-- Restore half-day balance deduction (0.5) for P/PL, P/CL, P/SL composite marks.
-- Register summary display counts these as 1 leave day in the client only.
-- Reverts the deductible-days change from 20260831150000 when that migration was applied.

CREATE OR REPLACE FUNCTION indus_one.admin_leave_deductible_days(p_req indus_one.admin_leave_requests)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indus_one, public
SET row_security = off
AS $$
  SELECT CASE
    WHEN indus_one.admin_leave_is_half_day_request(p_req) THEN (
      SELECT coalesce(sum(
        CASE
          WHEN indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
            AND indus_one.admin_leave_composite_half_day_mark(
                   indus_one.admin_leave_primary_attendance_mark(p_req.leave_type_code)
                 ) IS NOT NULL
          THEN 0.5::numeric
          WHEN NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
          THEN 0.5::numeric
          ELSE 0::numeric
        END
      ), 0)
      FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, p_req.employee_code) AS d
    )
    ELSE (
      SELECT count(*)::numeric
      FROM indus_one.admin_leave_working_dates(p_req.from_date, p_req.to_date, p_req.employee_code) AS d
      WHERE NOT indus_one.admin_leave_date_punch_priority(p_req.employee_code, d)
    )
  END;
$$;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Rules Console backend.
--
-- admin_attendance_rules        — catalogue of attendance / leave / C/O rules
--                                  (editable = wired into the engine; others are
--                                  documented read-only).
-- admin_attendance_rule_values  — append-only, dated values. department NULL =
--                                  company default; department row with value
--                                  NULL = "back to company default" from that date.
--
-- Seeds reproduce today's hard-coded behaviour exactly, then only these four
-- small C/O helpers are redefined to read the rules (same signatures, same
-- results with the seed values). Callers such as comp_off_try_earn_credit and
-- comp_off_is_earning_day are NOT redefined.
--   co.start_date            → indus_one.comp_off_cutoff_date()
--   co.expiry_months         → indus_one.comp_off_expiry_for_earned()
--   co.sunday_pod_only       → indus_one.comp_off_sunday_pod_only_employee()
--   co.third_saturday_earns  → indus_one.comp_off_third_saturday_excluded_employee()
-- wo.third_saturday_off and co.start_date are also read by the web app
-- (src/lib/attendanceRules.js).
--
-- Existing data: no UPDATE / DELETE / reconcile on any existing table. Only the
-- two new tables receive rows.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_attendance_rules (
  rule_key text PRIMARY KEY,
  module text NOT NULL CHECK (module IN ('weekly_off', 'attendance', 'leave', 'comp_off')),
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  value_type text NOT NULL CHECK (value_type IN ('boolean', 'number', 'date', 'text')),
  default_value jsonb NOT NULL,
  unit text,
  min_value numeric,
  max_value numeric,
  allows_department boolean NOT NULL DEFAULT false,
  editable boolean NOT NULL DEFAULT false,
  applies_note text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 100
);

CREATE OR REPLACE FUNCTION public.admin_rule_norm_department(p_dept text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_dept, ''))), '\s+', ' ', 'g'),
      '\s*-\s*', '-', 'g'
    ),
    ''
  );
$$;

CREATE TABLE IF NOT EXISTS public.admin_attendance_rule_values (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_key text NOT NULL REFERENCES public.admin_attendance_rules (rule_key) ON DELETE CASCADE,
  department text,
  department_key text,
  value jsonb,
  previous_value jsonb,
  effective_from date NOT NULL,
  reason text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_attendance_rule_values_dept_key_chk
    CHECK ((department IS NULL) = (department_key IS NULL)),
  CONSTRAINT admin_attendance_rule_values_global_not_null_chk
    CHECK (department IS NOT NULL OR value IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS admin_attendance_rule_values_lookup_idx
  ON public.admin_attendance_rule_values (rule_key, department_key, effective_from DESC, id DESC);

ALTER TABLE public.admin_attendance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_attendance_rule_values ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.admin_attendance_rules TO authenticated;
GRANT SELECT ON public.admin_attendance_rule_values TO authenticated;
GRANT ALL ON public.admin_attendance_rules TO service_role;
GRANT ALL ON public.admin_attendance_rule_values TO service_role;

-- Rule values drive attendance screens and C/O earning for every user, so any
-- signed-in user may read them. Writes go through admin_rules_save() only.
DROP POLICY IF EXISTS admin_attendance_rules_select ON public.admin_attendance_rules;
CREATE POLICY admin_attendance_rules_select ON public.admin_attendance_rules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS admin_attendance_rule_values_select ON public.admin_attendance_rule_values;
CREATE POLICY admin_attendance_rule_values_select ON public.admin_attendance_rule_values
  FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- Seed catalogue
-- -----------------------------------------------------------------------------
INSERT INTO public.admin_attendance_rules
  (rule_key, module, label, description, value_type, default_value, unit, min_value, max_value,
   allows_department, editable, applies_note, sort_order)
VALUES
  ('wo.sunday_off', 'weekly_off', 'Sunday is a weekly off',
   'Every Sunday is marked WO automatically for all employees.',
   'text', '"Yes, for everyone"', NULL, NULL, NULL, false, false,
   'Attendance register', 10),
  ('wo.third_saturday_off', 'weekly_off', '3rd Saturday is a weekly off',
   'When off, the 3rd Saturday is marked WO and counted as a paid day. Departments set to "No" work that day (blank, or P if punched).',
   'boolean', 'true', NULL, NULL, NULL, true, true,
   'Attendance register and monthly totals', 20),
  ('wo.holidays_auto', 'weekly_off', 'National / public holidays',
   'Dates in the holiday calendar are marked NH/PH automatically.',
   'text', '"From the holiday calendar"', NULL, NULL, NULL, false, false,
   'Holiday calendar', 30),

  ('att.half_day_cutoff', 'attendance', 'Half-day cut-off',
   'Working only up to this time counts as a half day.',
   'text', '"13:00"', NULL, NULL, NULL, false, false,
   'Punch processing', 10),
  ('att.purple_present', 'attendance', 'Late / short-day present (purple P)',
   'First punch between 12:00 and 15:00, or last punch before 12:00, is shown as a purple P.',
   'text', '"First punch 12:00–15:00 or last punch before 12:00"', NULL, NULL, NULL, false, false,
   'Punch processing', 20),
  ('att.shift_timing', 'attendance', 'Expected shift',
   'Expected in and out time used on the punch screens. No grace period.',
   'text', '"09:00 – 18:00, no grace"', NULL, NULL, NULL, false, false,
   'Punch screens', 30),
  ('att.punch_beats_leave', 'attendance', 'Punch overrides leave',
   'If an employee punches on a day with approved leave, the day shows as present.',
   'text', '"Yes"', NULL, NULL, NULL, false, false,
   'Attendance register', 40),

  ('leave.entitlements', 'leave', 'Yearly leave entitlement',
   'Prorated by month of joining. Contract, consultant and notice-period staff get 0.',
   'text', '"PL 18 · CL 8 · SL 8 · SBEL 2 · SPLA 0.5 · SPLB 0.5 · SPLM 3 · Paternity 3"', NULL, NULL, NULL, false, false,
   'Leave balances', 10),
  ('leave.probation', 'leave', 'Probation leave',
   'Employees on probation get leave credited monthly instead of yearly.',
   'text', '"1 CL + 1 SL per month"', NULL, NULL, NULL, false, false,
   'Leave balances', 20),
  ('leave.carry_forward', 'leave', 'Carry forward to next year',
   'Maximum unused days carried into the new leave year.',
   'text', '"PL 7 · SL 8 · CL 0"', NULL, NULL, NULL, false, false,
   'Year-end leave rollover', 30),
  ('leave.half_day', 'leave', 'Half-day leave',
   'A half-day leave deducts half a day from the balance.',
   'text', '"0.5 day"', NULL, NULL, NULL, false, false,
   'Leave balances', 40),
  ('leave.sandwich', 'leave', 'Sandwich rule',
   'A weekly off between two leave days is counted as leave. Holidays are never counted.',
   'text', '"Weekly off only"', NULL, NULL, NULL, false, false,
   'Leave requests', 50),
  ('leave.mixed_types', 'leave', 'Mixing PL / CL / SL',
   'Different leave types cannot be taken on back-to-back days, including across a weekly off or holiday (up to 14 days).',
   'text', '"Not allowed"', NULL, NULL, NULL, false, false,
   'Leave requests', 60),

  ('co.start_date', 'comp_off', 'C/O counted from',
   'Only work on or after this date earns or counts toward C/O balances.',
   'date', '"2026-09-01"', NULL, NULL, NULL, false, true,
   'C/O balances and earning', 10),
  ('co.expiry_months', 'comp_off', 'C/O expires after',
   'A C/O credit can be used for this many months after the day it was earned. Applies to newly earned credits.',
   'number', '2', 'months', 1, 24, false, true,
   'C/O earning', 20),
  ('co.sunday_pod_only', 'comp_off', 'Sunday C/O only for P(OD)',
   'When "Yes", a Sunday machine punch does not earn C/O; only P(OD) on Sunday earns it.',
   'boolean', 'false', NULL, NULL, NULL, true, true,
   'C/O earning', 30),
  ('co.third_saturday_earns', 'comp_off', 'Working the 3rd Saturday earns C/O',
   'When "No", working the 3rd Saturday does not earn C/O for that department.',
   'boolean', 'true', NULL, NULL, NULL, true, true,
   'C/O earning', 40),
  ('co.earning', 'comp_off', 'How C/O is earned',
   'Working on a weekly off, NH or PH earns one C/O. P, P(OD) and HD count; tour counts as P(OD).',
   'text', '"1 C/O per day worked"', NULL, NULL, NULL, false, false,
   'C/O earning', 50),
  ('co.usage_order', 'comp_off', 'Which C/O is used first',
   'Marking CO uses the credit that expires soonest.',
   'text', '"Soonest expiry first"', NULL, NULL, NULL, false, false,
   'C/O usage', 60)
ON CONFLICT (rule_key) DO NOTHING;

-- Current values (as hard-coded before this migration).
INSERT INTO public.admin_attendance_rule_values
  (rule_key, department, department_key, value, effective_from, reason, created_by, created_by_name)
SELECT v.rule_key, v.department, public.admin_rule_norm_department(v.department), v.value,
       DATE '2000-01-01', 'Existing rule at setup', NULL, 'System'
FROM (VALUES
  ('wo.third_saturday_off', NULL::text, 'true'::jsonb),
  ('wo.third_saturday_off', 'Production', 'false'::jsonb),
  ('wo.third_saturday_off', 'Production-FTC', 'false'::jsonb),
  ('wo.third_saturday_off', 'Production - Neotech', 'false'::jsonb),
  ('wo.third_saturday_off', 'R&M', 'false'::jsonb),
  ('wo.third_saturday_off', 'M&M', 'false'::jsonb),
  ('wo.third_saturday_off', 'Maintenance-FTC', 'false'::jsonb),
  ('co.start_date', NULL, '"2026-09-01"'::jsonb),
  ('co.expiry_months', NULL, '2'::jsonb),
  ('co.sunday_pod_only', NULL, 'false'::jsonb),
  ('co.sunday_pod_only', 'Production', 'true'::jsonb),
  ('co.sunday_pod_only', 'Production-FTC', 'true'::jsonb),
  ('co.sunday_pod_only', 'Production - Neotech', 'true'::jsonb),
  ('co.sunday_pod_only', 'R&M', 'true'::jsonb),
  ('co.third_saturday_earns', NULL, 'true'::jsonb),
  ('co.third_saturday_earns', 'Production', 'false'::jsonb),
  ('co.third_saturday_earns', 'Production-FTC', 'false'::jsonb),
  ('co.third_saturday_earns', 'Production - Neotech', 'false'::jsonb),
  ('co.third_saturday_earns', 'R&M', 'false'::jsonb)
) AS v(rule_key, department, value)
WHERE NOT EXISTS (SELECT 1 FROM public.admin_attendance_rule_values);

-- -----------------------------------------------------------------------------
-- Resolver: department value in force on p_on, else company default, else seed.
-- Plain SQL (not SECURITY DEFINER) so it can be inlined in C/O queries.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rule_value(
  p_rule_key text,
  p_department text DEFAULT NULL,
  p_on date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (
      SELECT v.value
      FROM public.admin_attendance_rule_values v
      WHERE v.rule_key = p_rule_key
        AND v.department_key = public.admin_rule_norm_department(p_department)
        AND v.effective_from <= coalesce(p_on, current_date)
      ORDER BY v.effective_from DESC, v.id DESC
      LIMIT 1
    ),
    (
      SELECT v.value
      FROM public.admin_attendance_rule_values v
      WHERE v.rule_key = p_rule_key
        AND v.department_key IS NULL
        AND v.effective_from <= coalesce(p_on, current_date)
      ORDER BY v.effective_from DESC, v.id DESC
      LIMIT 1
    ),
    (SELECT r.default_value FROM public.admin_attendance_rules r WHERE r.rule_key = p_rule_key)
  );
$$;

GRANT EXECUTE ON FUNCTION public.admin_rule_norm_department(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_value(text, text, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Edit access: Admin / Super Admin / Super Admin Pro (same as the console guard).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rules_can_edit()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce((to_jsonb(p) ->> 'is_active')::boolean, true)
        AND public.normalize_erp_role(p.role) IN ('admin', 'super_admin', 'super_admin_pro')
    );
$$;

GRANT EXECUTE ON FUNCTION public.admin_rules_can_edit() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_rules_save(
  p_rule_key text,
  p_department text,
  p_value jsonb,
  p_effective_from date,
  p_reason text
)
RETURNS public.admin_attendance_rule_values
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.admin_attendance_rules;
  v_dept text := nullif(btrim(coalesce(p_department, '')), '');
  v_dept_key text := public.admin_rule_norm_department(p_department);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_value jsonb := CASE WHEN p_value = 'null'::jsonb THEN NULL ELSE p_value END;
  v_prev jsonb;
  v_prev_own jsonb;
  v_has_own boolean;
  v_name text;
  v_row public.admin_attendance_rule_values;
BEGIN
  IF NOT public.admin_rules_can_edit() THEN
    RAISE EXCEPTION 'Only admins can change rules.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rule FROM public.admin_attendance_rules WHERE rule_key = p_rule_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown rule.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_rule.editable THEN
    RAISE EXCEPTION 'This rule cannot be changed here.' USING ERRCODE = '22023';
  END IF;
  IF v_dept IS NOT NULL AND NOT v_rule.allows_department THEN
    RAISE EXCEPTION 'This rule applies to the whole company only.' USING ERRCODE = '22023';
  END IF;
  IF v_dept IS NULL AND v_value IS NULL THEN
    RAISE EXCEPTION 'Company default needs a value.' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for the change.' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL OR p_effective_from < current_date THEN
    RAISE EXCEPTION 'Changes can start today or later.' USING ERRCODE = '22023';
  END IF;

  IF v_value IS NOT NULL THEN
    IF v_rule.value_type = 'boolean' AND jsonb_typeof(v_value) <> 'boolean' THEN
      RAISE EXCEPTION 'Choose Yes or No.' USING ERRCODE = '22023';
    END IF;
    IF v_rule.value_type = 'number' THEN
      IF jsonb_typeof(v_value) <> 'number'
         OR (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric) THEN
        RAISE EXCEPTION 'Enter a whole number.' USING ERRCODE = '22023';
      END IF;
      IF (v_rule.min_value IS NOT NULL AND (v_value #>> '{}')::numeric < v_rule.min_value)
         OR (v_rule.max_value IS NOT NULL AND (v_value #>> '{}')::numeric > v_rule.max_value) THEN
        RAISE EXCEPTION 'Enter a value between % and %.', v_rule.min_value, v_rule.max_value
          USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_rule.value_type = 'date' THEN
      IF jsonb_typeof(v_value) <> 'string' OR (v_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Enter a valid date.' USING ERRCODE = '22023';
      END IF;
      PERFORM (v_value #>> '{}')::date;
    END IF;
  END IF;

  v_prev := public.admin_rule_value(p_rule_key, v_dept, p_effective_from);

  IF v_dept IS NOT NULL THEN
    SELECT true, v.value INTO v_has_own, v_prev_own
    FROM public.admin_attendance_rule_values v
    WHERE v.rule_key = p_rule_key
      AND v.department_key = v_dept_key
      AND v.effective_from <= p_effective_from
    ORDER BY v.effective_from DESC, v.id DESC
    LIMIT 1;
    IF v_value IS NULL AND (v_has_own IS NULL OR v_prev_own IS NULL) THEN
      RAISE EXCEPTION 'This department already follows the company default.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_value IS NOT NULL AND v_value = v_prev
     AND (v_dept IS NULL OR v_prev_own IS NOT DISTINCT FROM v_value) THEN
    RAISE EXCEPTION 'No change — the value is already in force.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(
           nullif(btrim(to_jsonb(p) ->> 'full_name'), ''),
           nullif(btrim(to_jsonb(p) ->> 'name'), ''),
           nullif(btrim(to_jsonb(p) ->> 'email'), '')
         )
    INTO v_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  INSERT INTO public.admin_attendance_rule_values
    (rule_key, department, department_key, value, previous_value, effective_from, reason,
     created_by, created_by_name)
  VALUES
    (p_rule_key, v_dept, v_dept_key, v_value, v_prev, p_effective_from, v_reason,
     auth.uid(), coalesce(v_name, 'Admin'))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rules_save(text, text, jsonb, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rules_save(text, text, jsonb, date, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- C/O engine reads the rules (seeded values = previous hard-coded behaviour).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indus_one.comp_off_cutoff_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (public.admin_rule_value('co.start_date') #>> '{}')::date,
    DATE '2026-09-01'
  );
$$;

COMMENT ON FUNCTION indus_one.comp_off_cutoff_date() IS
  'C/O ledger start (Rules Console: co.start_date). Only work dates on or after it earn or count.';

CREATE OR REPLACE FUNCTION indus_one.comp_off_expiry_for_earned(p_earned date)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (
    p_earned + make_interval(months => coalesce(
      (public.admin_rule_value('co.expiry_months', NULL, p_earned) #>> '{}')::int,
      2
    ))
  )::date;
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_sunday_pod_only_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (public.admin_rule_value(
      'co.sunday_pod_only',
      indus_one.comp_off_employee_department(p_employee_code),
      NULL
    ) #>> '{}')::boolean,
    false
  );
$$;

CREATE OR REPLACE FUNCTION indus_one.comp_off_third_saturday_excluded_employee(p_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT coalesce(
    (public.admin_rule_value(
      'co.third_saturday_earns',
      indus_one.comp_off_employee_department(p_employee_code),
      NULL
    ) #>> '{}')::boolean,
    true
  );
$$;

COMMENT ON FUNCTION indus_one.comp_off_sunday_pod_only_employee(text) IS
  'Sunday C/O only for P(OD) — departments set in Rules Console (co.sunday_pod_only).';
COMMENT ON FUNCTION indus_one.comp_off_third_saturday_excluded_employee(text) IS
  '3rd Saturday does not earn C/O — departments set in Rules Console (co.third_saturday_earns = No).';

NOTIFY pgrst, 'reload schema';

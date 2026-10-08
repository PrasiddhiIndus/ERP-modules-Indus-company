-- =============================================================================
-- Rollback for 20261008120000_admin_rules_console_scopes.sql
-- Returns the Rules Console to the state of 20261008100000.
--
-- Run manually in the SQL editor (this folder is not applied by `supabase db push`).
-- Afterwards remove the migration row so it can be re-applied later:
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008120000';
--
-- Lost on rollback: group / employee overrides, pending or draft requests,
-- reviews, groups and the event log. Company and department values are kept.
-- The C/O engine is unaffected either way (it only reads company/department).
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS admin_attendance_rule_values_append_only ON public.admin_attendance_rule_values;
DROP TRIGGER IF EXISTS admin_attendance_rule_reviews_append_only ON public.admin_attendance_rule_reviews;
DROP TRIGGER IF EXISTS admin_rules_events_append_only ON public.admin_rules_events;

DROP FUNCTION IF EXISTS public.admin_rule_group_archive(uuid, text);
DROP FUNCTION IF EXISTS public.admin_rule_group_set_members(uuid, text[], text[], text);
DROP FUNCTION IF EXISTS public.admin_rule_group_save(uuid, text, text, text, text[], text);
DROP FUNCTION IF EXISTS public.admin_rules_set_approval(boolean, text);
DROP FUNCTION IF EXISTS public.admin_rules_review(bigint, boolean, text);
DROP FUNCTION IF EXISTS public.admin_rules_save_scoped(text, text, text, jsonb, date, text);
DROP FUNCTION IF EXISTS public.admin_rules_own_value(text, text, text, date);
DROP FUNCTION IF EXISTS public.admin_rules_check_value(public.admin_attendance_rules, jsonb);
DROP FUNCTION IF EXISTS public.admin_rules_can_configure();
DROP FUNCTION IF EXISTS public.admin_rules_actor_name();
DROP FUNCTION IF EXISTS public.get_rules_bulk(text[], text[], date, date);
DROP FUNCTION IF EXISTS public.get_rule(text, text, date);
DROP FUNCTION IF EXISTS public.get_rule_detail(text, text, date);
DROP FUNCTION IF EXISTS public.admin_rule_norm_employee(text);
DROP FUNCTION IF EXISTS public.admin_rules_block_mutation();

DROP TABLE IF EXISTS public.admin_attendance_rule_reviews;
DROP TABLE IF EXISTS public.admin_rules_events;
DROP TABLE IF EXISTS public.admin_rules_settings;
DROP TABLE IF EXISTS public.admin_rule_group_members;
DROP TABLE IF EXISTS public.admin_rule_groups;

-- Values: keep company + department active rows only.
DELETE FROM public.admin_attendance_rule_values
WHERE scope_type IN ('group', 'employee') OR status <> 'active';

ALTER TABLE public.admin_attendance_rule_values
  DROP CONSTRAINT IF EXISTS admin_attendance_rule_values_scope_type_check,
  DROP CONSTRAINT IF EXISTS admin_attendance_rule_values_scope_id_check,
  DROP CONSTRAINT IF EXISTS admin_attendance_rule_values_company_value_check,
  DROP CONSTRAINT IF EXISTS admin_attendance_rule_values_status_check,
  ADD COLUMN department text,
  ADD COLUMN department_key text;
DROP INDEX IF EXISTS public.admin_attendance_rule_values_scope_idx;

UPDATE public.admin_attendance_rule_values
SET department = CASE WHEN scope_type = 'department' THEN coalesce(scope_label, scope_id) END,
    department_key = CASE WHEN scope_type = 'department' THEN scope_id END;

ALTER TABLE public.admin_attendance_rule_values
  DROP COLUMN request_id,
  DROP COLUMN status,
  DROP COLUMN scope_label,
  DROP COLUMN scope_id,
  DROP COLUMN scope_type;
ALTER TABLE public.admin_attendance_rule_values RENAME COLUMN old_value TO previous_value;
ALTER TABLE public.admin_attendance_rule_values
  ADD CONSTRAINT admin_attendance_rule_values_dept_key_chk CHECK ((department IS NULL) = (department_key IS NULL)),
  ADD CONSTRAINT admin_attendance_rule_values_global_not_null_chk CHECK (department IS NOT NULL OR value IS NOT NULL);
CREATE INDEX IF NOT EXISTS admin_attendance_rule_values_lookup_idx
  ON public.admin_attendance_rule_values (rule_key, department_key, effective_from DESC, id DESC);

-- Catalogue: drop rules added by Phase 1 (only the original wired five keep values).
DELETE FROM public.admin_attendance_rule_values v
USING public.admin_attendance_rules r
WHERE v.rule_key = r.rule_key AND NOT r.is_wired;
DELETE FROM public.admin_attendance_rules WHERE NOT is_wired;

ALTER TABLE public.admin_attendance_rules
  DROP CONSTRAINT IF EXISTS admin_attendance_rules_value_type_check,
  DROP CONSTRAINT IF EXISTS admin_attendance_rules_scopes_check,
  ADD COLUMN allows_department boolean NOT NULL DEFAULT false;
UPDATE public.admin_attendance_rules SET allows_department = 'department' = ANY (allowed_scopes);
ALTER TABLE public.admin_attendance_rules
  DROP COLUMN engine_ref,
  DROP COLUMN replaces,
  DROP COLUMN retired,
  DROP COLUMN hidden_until_wired,
  DROP COLUMN allowed_scopes,
  DROP COLUMN step,
  DROP COLUMN options;
ALTER TABLE public.admin_attendance_rules RENAME COLUMN is_wired TO editable;

-- Restore the descriptive "Fixed" rows from 20261008100000.
INSERT INTO public.admin_attendance_rules
  (rule_key, module, label, description, value_type, default_value, allows_department, editable, applies_note, sort_order)
VALUES
  ('wo.sunday_off', 'weekly_off', 'Sunday is a weekly off', 'Every Sunday is marked WO automatically for all employees.', 'text', '"Yes, for everyone"', false, false, 'Attendance register', 10),
  ('wo.holidays_auto', 'weekly_off', 'National / public holidays', 'Dates in the holiday calendar are marked NH/PH automatically.', 'text', '"From the holiday calendar"', false, false, 'Holiday calendar', 30),
  ('att.half_day_cutoff', 'attendance', 'Half-day cut-off', 'Working only up to this time counts as a half day.', 'text', '"13:00"', false, false, 'Punch processing', 10),
  ('att.purple_present', 'attendance', 'Late / short-day present (purple P)', 'First punch between 12:00 and 15:00, or last punch before 12:00, is shown as a purple P.', 'text', '"First punch 12:00–15:00 or last punch before 12:00"', false, false, 'Punch processing', 20),
  ('att.shift_timing', 'attendance', 'Expected shift', 'Expected in and out time used on the punch screens. No grace period.', 'text', '"09:00 – 18:00, no grace"', false, false, 'Punch screens', 30),
  ('att.punch_beats_leave', 'attendance', 'Punch overrides leave', 'If an employee punches on a day with approved leave, the day shows as present.', 'text', '"Yes"', false, false, 'Attendance register', 40),
  ('leave.entitlements', 'leave', 'Yearly leave entitlement', 'Prorated by month of joining. Contract, consultant and notice-period staff get 0.', 'text', '"PL 18 · CL 8 · SL 8 · SBEL 2 · SPLA 0.5 · SPLB 0.5 · SPLM 3 · Paternity 3"', false, false, 'Leave balances', 10),
  ('leave.probation', 'leave', 'Probation leave', 'Employees on probation get leave credited monthly instead of yearly.', 'text', '"1 CL + 1 SL per month"', false, false, 'Leave balances', 20),
  ('leave.carry_forward', 'leave', 'Carry forward to next year', 'Maximum unused days carried into the new leave year.', 'text', '"PL 7 · SL 8 · CL 0"', false, false, 'Year-end leave rollover', 30),
  ('leave.half_day', 'leave', 'Half-day leave', 'A half-day leave deducts half a day from the balance.', 'text', '"0.5 day"', false, false, 'Leave balances', 40),
  ('leave.sandwich', 'leave', 'Sandwich rule', 'A weekly off between two leave days is counted as leave. Holidays are never counted.', 'text', '"Weekly off only"', false, false, 'Leave requests', 50),
  ('leave.mixed_types', 'leave', 'Mixing PL / CL / SL', 'Different leave types cannot be taken on back-to-back days, including across a weekly off or holiday (up to 14 days).', 'text', '"Not allowed"', false, false, 'Leave requests', 60),
  ('co.earning', 'comp_off', 'How C/O is earned', 'Working on a weekly off, NH or PH earns one C/O. P, P(OD) and HD count; tour counts as P(OD).', 'text', '"1 C/O per day worked"', false, false, 'C/O earning', 50),
  ('co.usage_order', 'comp_off', 'Which C/O is used first', 'Marking CO uses the credit that expires soonest.', 'text', '"Soonest expiry first"', false, false, 'C/O usage', 60)
ON CONFLICT (rule_key) DO NOTHING;

ALTER TABLE public.admin_attendance_rules
  ADD CONSTRAINT admin_attendance_rules_value_type_check CHECK (value_type IN ('boolean', 'number', 'date', 'text'));

-- Original resolver and save function.
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
        RAISE EXCEPTION 'Enter a value between % and %.', v_rule.min_value, v_rule.max_value USING ERRCODE = '22023';
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
    WHERE v.rule_key = p_rule_key AND v.department_key = v_dept_key AND v.effective_from <= p_effective_from
    ORDER BY v.effective_from DESC, v.id DESC
    LIMIT 1;
    IF v_value IS NULL AND (v_has_own IS NULL OR v_prev_own IS NULL) THEN
      RAISE EXCEPTION 'This department already follows the company default.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_value IS NOT NULL AND v_value = v_prev AND (v_dept IS NULL OR v_prev_own IS NOT DISTINCT FROM v_value) THEN
    RAISE EXCEPTION 'No change — the value is already in force.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(nullif(btrim(to_jsonb(p) ->> 'full_name'), ''), nullif(btrim(to_jsonb(p) ->> 'name'), ''),
                  nullif(btrim(to_jsonb(p) ->> 'email'), ''))
    INTO v_name
  FROM public.profiles p WHERE p.id = auth.uid();

  INSERT INTO public.admin_attendance_rule_values
    (rule_key, department, department_key, value, previous_value, effective_from, reason, created_by, created_by_name)
  VALUES
    (p_rule_key, v_dept, v_dept_key, v_value, v_prev, p_effective_from, v_reason, auth.uid(), coalesce(v_name, 'Admin'))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rules_save(text, text, jsonb, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rules_save(text, text, jsonb, date, text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

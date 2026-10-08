-- =============================================================================
-- Rules Console — Phase 1: scopes, groups, resolver, approvals plumbing.
--
-- Builds on 20261008100000_admin_attendance_rules_console.sql.
-- Rollback: supabase/rollbacks/20261008120000_admin_rules_console_scopes_down.sql
--
-- Resolution order (get_rule): Employee > Group > Department > Company > built-in.
--   * Each scope uses its latest ACTIVE row with effective_from <= the date.
--     A row whose value is NULL means "inherit" (the override was removed).
--   * Several groups with a value: the most recently created group wins
--     (created_at DESC, then id DESC).
--   * Group membership = hand-picked employees + whole departments listed on
--     the group. Membership is not dated: past dates use today's membership.
--
-- Behaviour: no existing result changes.
--   * The four C/O helpers from 20261008100000 are NOT touched; admin_rule_value()
--     keeps its signature and returns the same values (company/department only).
--   * New catalogue rules are is_wired = false: nothing reads them yet.
--   * Existing data: only the Rules Console's own tables are altered. No other
--     table is updated.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catalogue
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_attendance_rules DROP CONSTRAINT IF EXISTS admin_attendance_rules_value_type_check;

ALTER TABLE public.admin_attendance_rules
  ADD COLUMN IF NOT EXISTS options jsonb,
  ADD COLUMN IF NOT EXISTS step numeric,
  ADD COLUMN IF NOT EXISTS allowed_scopes text[] NOT NULL DEFAULT '{company}',
  ADD COLUMN IF NOT EXISTS hidden_until_wired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaces text,
  ADD COLUMN IF NOT EXISTS engine_ref text NOT NULL DEFAULT '';

ALTER TABLE public.admin_attendance_rules RENAME COLUMN editable TO is_wired;

UPDATE public.admin_attendance_rules
SET allowed_scopes = CASE WHEN allows_department THEN '{company,department}'::text[] ELSE '{company}'::text[] END;

ALTER TABLE public.admin_attendance_rules DROP COLUMN allows_department;

-- Descriptive "Fixed" rows are replaced by typed rules below. They never had values.
DELETE FROM public.admin_attendance_rules
WHERE rule_key IN (
  'wo.sunday_off', 'wo.holidays_auto', 'att.purple_present', 'att.shift_timing', 'att.punch_beats_leave',
  'leave.entitlements', 'leave.probation', 'leave.carry_forward', 'leave.half_day', 'leave.sandwich',
  'leave.mixed_types', 'co.earning', 'co.usage_order'
)
AND NOT is_wired;

INSERT INTO public.admin_attendance_rules AS r
  (rule_key, module, label, description, value_type, default_value, options, unit, min_value, max_value, step,
   allowed_scopes, is_wired, hidden_until_wired, replaces, engine_ref, applies_note, sort_order)
SELECT
  s.rule_key, s.module, s.label, s.description, s.value_type, s.default_value, s.options, s.unit,
  s.min_value, s.max_value, s.step, s.allowed_scopes, s.is_wired, s.hidden_until_wired, s.replaces,
  s.engine_ref, s.applies_note, s.sort_order
FROM (VALUES
  -- Weekly off --------------------------------------------------------------
  ('wo.pattern', 'weekly_off', 'Weekly off pattern',
   'Which days are marked WO automatically.', 'select', '"sun_3rd_sat"'::jsonb,
   '[{"value":"sun_3rd_sat","label":"Sunday + 3rd Saturday"},{"value":"sun_only","label":"Sunday only"},{"value":"none","label":"No weekly off (all days working)"},{"value":"custom","label":"Custom weekdays"}]'::jsonb,
   NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, '{company,department,group,employee}'::text[], false, true,
   'wo.third_saturday_off', 'Phase 2A', 'Attendance register and monthly totals', 10),
  ('wo.custom_days', 'weekly_off', 'Custom weekly off days',
   'Used when the pattern is "Custom weekdays".', 'multi_number', '[0]'::jsonb,
   '[{"value":0,"label":"Sun"},{"value":1,"label":"Mon"},{"value":2,"label":"Tue"},{"value":3,"label":"Wed"},{"value":4,"label":"Thu"},{"value":5,"label":"Fri"},{"value":6,"label":"Sat"}]'::jsonb,
   NULL, 0, 6, 1, '{company,department,group,employee}', false, true,
   NULL, 'Phase 2A', 'Attendance register', 15),
  ('wo.third_saturday_off', 'weekly_off', '3rd Saturday is a weekly off',
   'When off, the 3rd Saturday is marked WO and counted as a paid day. Departments set to "No" work that day (blank, or P if punched).',
   'boolean', 'true'::jsonb, NULL, NULL, NULL, NULL, NULL, '{company,department}', true, false,
   NULL, 'src/lib/attendanceRules.js isThirdSaturdayWorkingDepartment → isAutoWeekoffDate, isPaidThirdSaturdayWeekoffCell, buildMonthlyRegisterGrid',
   'Attendance register and monthly totals', 20),
  ('wo.auto', 'weekly_off', 'Mark weekly offs automatically',
   'When on, weekly off days are filled in the register automatically.', 'boolean', 'true'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2A', 'Attendance register', 40),
  ('wo.auto_holiday', 'weekly_off', 'Mark NH / PH automatically',
   'When on, dates in the holiday calendar are filled as NH/PH automatically.', 'boolean', 'true'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2A', 'Attendance register', 50),

  -- Attendance ----------------------------------------------------------------
  ('att.half_day_cutoff', 'attendance', 'Half-day cut-off',
   'Working only up to this time counts as a half day.', 'time', '"13:00"'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Punch processing', 10),
  ('att.purple_first_from', 'attendance', 'Late arrival (purple P) from',
   'A first punch from this time is shown as a purple P.', 'time', '"12:00"'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Punch processing', 20),
  ('att.purple_first_to', 'attendance', 'Late arrival (purple P) until',
   'A first punch up to this time is shown as a purple P.', 'time', '"15:00"'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Punch processing', 21),
  ('att.purple_last_before', 'attendance', 'Early leaving (purple P) before',
   'A last punch before this time is shown as a purple P.', 'time', '"12:00"'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Punch processing', 22),
  ('att.shift_start', 'attendance', 'Shift starts', 'Expected in time.', 'time', '"09:00"'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Punch screens', 30),
  ('att.shift_end', 'attendance', 'Shift ends', 'Expected out time.', 'time', '"18:00"'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Punch screens', 31),
  ('att.grace_minutes', 'attendance', 'Grace period', 'Minutes allowed after the shift start.', 'number', '0'::jsonb,
   NULL, 'minutes', 0, 120, 1, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Punch screens', 32),
  ('att.punch_overrides_leave', 'attendance', 'Punch overrides leave',
   'If an employee punches on a day with approved leave, the day shows as present.', 'boolean', 'true'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2E', 'Attendance register', 40),

  -- Leave -------------------------------------------------------------------
  ('leave.entitlement_pl', 'leave', 'PL per year', 'Yearly privilege leave.', 'number', '18'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 10),
  ('leave.entitlement_cl', 'leave', 'CL per year', 'Yearly casual leave.', 'number', '8'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 11),
  ('leave.entitlement_sl', 'leave', 'SL per year', 'Yearly sick leave.', 'number', '8'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 12),
  ('leave.entitlement_sbel', 'leave', 'SBEL per year', 'Yearly SBEL.', 'number', '2'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 13),
  ('leave.entitlement_spla', 'leave', 'SPLA per year', 'Yearly SPLA.', 'number', '0.5'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 14),
  ('leave.entitlement_splb', 'leave', 'SPLB per year', 'Yearly SPLB.', 'number', '0.5'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 15),
  ('leave.entitlement_splm', 'leave', 'SPLM per year', 'Yearly SPLM.', 'number', '3'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 16),
  ('leave.entitlement_paternity', 'leave', 'Paternity leave', 'Paternity leave days.', 'number', '3'::jsonb,
   NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false, NULL, 'Phase 2F', 'Leave balances', 17),
  ('leave.prorate_by_joining', 'leave', 'Prorate by month of joining',
   'New joiners get leave for the remaining months of the year. Contract, consultant and notice-period staff get 0.',
   'boolean', 'true'::jsonb, NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Leave balances', 20),
  ('leave.probation_cl_per_month', 'leave', 'Probation CL per month', 'CL credited each month during probation.',
   'number', '1'::jsonb, NULL, 'days', 0, 5, 0.5, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Leave balances', 30),
  ('leave.probation_sl_per_month', 'leave', 'Probation SL per month', 'SL credited each month during probation.',
   'number', '1'::jsonb, NULL, 'days', 0, 5, 0.5, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Leave balances', 31),
  ('leave.carry_cap_pl', 'leave', 'PL carried to next year (max)', 'Unused PL carried forward at year end.',
   'number', '7'::jsonb, NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Year-end leave rollover', 40),
  ('leave.carry_cap_sl', 'leave', 'SL carried to next year (max)', 'Unused SL carried forward at year end.',
   'number', '8'::jsonb, NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Year-end leave rollover', 41),
  ('leave.carry_cl', 'leave', 'Carry CL to next year', 'When on, unused CL is carried forward up to the cap below.',
   'boolean', 'false'::jsonb, NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Year-end leave rollover', 42),
  ('leave.carry_cap_cl', 'leave', 'CL carried to next year (max)', 'Used only when CL carry forward is on.',
   'number', '0'::jsonb, NULL, 'days', 0, 60, 0.5, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Year-end leave rollover', 43),
  ('leave.sandwich', 'leave', 'Sandwich rule',
   'A weekly off between two leave days is counted as leave. Holidays are never counted.',
   'boolean', 'true'::jsonb, NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Leave requests', 50),
  ('leave.no_mixing', 'leave', 'No mixing PL / CL / SL',
   'Different leave types cannot be taken on back-to-back days, including across a weekly off or holiday.',
   'boolean', 'true'::jsonb, NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Leave requests', 60),
  ('leave.no_mixing_window_days', 'leave', 'No-mixing look-around', 'How many days around the request are checked.',
   'number', '14'::jsonb, NULL, 'days', 1, 60, 1, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Leave requests', 61),
  ('leave.insufficient_balance', 'leave', 'When balance is not enough',
   'What happens when a leave request is larger than the available balance.', 'select', '"block"'::jsonb,
   '[{"value":"block","label":"Block the request"},{"value":"allow_lwp","label":"Allow, extra days as LWP"},{"value":"allow_negative","label":"Allow a negative balance"}]'::jsonb,
   NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2F', 'Leave requests', 70),

  -- Comp-off ------------------------------------------------------------------
  ('co.start_date', 'comp_off', 'C/O counted from',
   'Only work on or after this date earns or counts toward C/O balances.', 'date', '"2026-09-01"'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company}', true, false,
   NULL, 'indus_one.comp_off_cutoff_date(); src/lib/compOffBalance.js compOffCutoffMonthKey()',
   'C/O balances and earning', 10),
  ('co.expiry_mode', 'comp_off', 'C/O expiry', 'Whether C/O credits expire.', 'select', '"months"'::jsonb,
   '[{"value":"months","label":"After a number of months"},{"value":"never","label":"Never expires"}]'::jsonb,
   NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, true,
   NULL, 'Phase 2C', 'C/O earning', 15),
  ('co.expiry_months', 'comp_off', 'C/O expires after',
   'A C/O credit can be used for this many months after the day it was earned. Applies to newly earned credits.',
   'number', '2'::jsonb, NULL, 'months', 1, 24, 1, '{company}', true, false,
   NULL, 'indus_one.comp_off_expiry_for_earned()', 'C/O earning', 20),
  ('co.earn', 'comp_off', 'Earns C/O', 'When off, no C/O is earned on any day.', 'boolean', 'true'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2B', 'C/O earning', 25),
  ('co.earn_basis', 'comp_off', 'What earns C/O',
   'Which marks on a weekly off / holiday earn C/O.', 'select', '"any_present"'::jsonb,
   '[{"value":"any_present","label":"Any present (P, HD, P(OD), tour)"},{"value":"punch_only","label":"Machine punch only (P, HD)"},{"value":"pod_only","label":"P(OD) / tour only"}]'::jsonb,
   NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2B', 'C/O earning', 26),
  ('co.sunday_basis', 'comp_off', 'Sunday: what earns C/O', 'Overrides the general rule for Sundays.',
   'select', '"general"'::jsonb,
   '[{"value":"general","label":"Same as general rule"},{"value":"any_present","label":"Any present"},{"value":"punch_only","label":"Machine punch only"},{"value":"pod_only","label":"P(OD) / tour only"},{"value":"none","label":"Does not earn"}]'::jsonb,
   NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, true,
   'co.sunday_pod_only', 'Phase 2B', 'C/O earning', 30),
  ('co.sunday_pod_only', 'comp_off', 'Sunday C/O only for P(OD)',
   'When "Yes", a Sunday machine punch does not earn C/O; only P(OD) on Sunday earns it.',
   'boolean', 'false'::jsonb, NULL, NULL, NULL, NULL, NULL, '{company,department}', true, false,
   NULL, 'indus_one.comp_off_sunday_pod_only_employee() ← comp_off_try_earn_credit', 'C/O earning', 31),
  ('co.third_saturday_basis', 'comp_off', '3rd Saturday: what earns C/O', 'Overrides the general rule for the 3rd Saturday.',
   'select', '"general"'::jsonb,
   '[{"value":"general","label":"Same as general rule"},{"value":"any_present","label":"Any present"},{"value":"punch_only","label":"Machine punch only"},{"value":"pod_only","label":"P(OD) / tour only"},{"value":"none","label":"Does not earn"}]'::jsonb,
   NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, true,
   'co.third_saturday_earns', 'Phase 2B', 'C/O earning', 35),
  ('co.third_saturday_earns', 'comp_off', 'Working the 3rd Saturday earns C/O',
   'When "No", working the 3rd Saturday does not earn C/O for that department.',
   'boolean', 'true'::jsonb, NULL, NULL, NULL, NULL, NULL, '{company,department}', true, false,
   NULL, 'indus_one.comp_off_third_saturday_excluded_employee() ← comp_off_is_earning_day', 'C/O earning', 36),
  ('co.holiday_basis', 'comp_off', 'NH / PH: what earns C/O', 'Overrides the general rule for national / public holidays.',
   'select', '"general"'::jsonb,
   '[{"value":"general","label":"Same as general rule"},{"value":"any_present","label":"Any present"},{"value":"punch_only","label":"Machine punch only"},{"value":"pod_only","label":"P(OD) / tour only"},{"value":"none","label":"Does not earn"}]'::jsonb,
   NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2B', 'C/O earning', 40),
  ('co.max_per_day', 'comp_off', 'C/O per day worked', 'Credit earned for one qualifying day.', 'number', '1'::jsonb,
   NULL, 'C/O', 0.5, 2, 0.5, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2D', 'C/O earning', 50),
  ('co.allow_manual_adjust', 'comp_off', 'Allow manual C/O adjustment',
   'When on, admins can set an employee''s C/O balance by hand.', 'boolean', 'true'::jsonb,
   NULL, NULL, NULL, NULL, NULL, '{company,department,group,employee}', false, false,
   NULL, 'Phase 2D', 'C/O balances', 60)
) AS s(rule_key, module, label, description, value_type, default_value, options, unit, min_value, max_value, step,
       allowed_scopes, is_wired, hidden_until_wired, replaces, engine_ref, applies_note, sort_order)
ON CONFLICT (rule_key) DO UPDATE SET
  module = excluded.module,
  label = excluded.label,
  description = excluded.description,
  value_type = excluded.value_type,
  options = excluded.options,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  step = excluded.step,
  allowed_scopes = excluded.allowed_scopes,
  hidden_until_wired = excluded.hidden_until_wired,
  replaces = excluded.replaces,
  engine_ref = excluded.engine_ref,
  applies_note = excluded.applies_note,
  sort_order = excluded.sort_order;
-- default_value and is_wired of existing rules are left as they are.

ALTER TABLE public.admin_attendance_rules
  ADD CONSTRAINT admin_attendance_rules_value_type_check
    CHECK (value_type IN ('boolean', 'number', 'select', 'time', 'date', 'multi_number')),
  ADD CONSTRAINT admin_attendance_rules_scopes_check
    CHECK (allowed_scopes <@ '{company,department,group,employee}'::text[] AND 'company' = ANY (allowed_scopes));

-- -----------------------------------------------------------------------------
-- 2. Dated history: scopes + status
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_attendance_rule_values
  DROP CONSTRAINT IF EXISTS admin_attendance_rule_values_dept_key_chk,
  DROP CONSTRAINT IF EXISTS admin_attendance_rule_values_global_not_null_chk;
DROP INDEX IF EXISTS public.admin_attendance_rule_values_lookup_idx;

ALTER TABLE public.admin_attendance_rule_values RENAME COLUMN previous_value TO old_value;

ALTER TABLE public.admin_attendance_rule_values
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_id text,
  ADD COLUMN IF NOT EXISTS scope_label text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS request_id bigint REFERENCES public.admin_attendance_rule_values (id);

UPDATE public.admin_attendance_rule_values
SET scope_type = CASE WHEN department IS NULL THEN 'company' ELSE 'department' END,
    scope_id = department_key,
    scope_label = department;

ALTER TABLE public.admin_attendance_rule_values
  ALTER COLUMN scope_type SET NOT NULL,
  DROP COLUMN department,
  DROP COLUMN department_key,
  ADD CONSTRAINT admin_attendance_rule_values_scope_type_check
    CHECK (scope_type IN ('company', 'department', 'group', 'employee')),
  ADD CONSTRAINT admin_attendance_rule_values_scope_id_check
    CHECK ((scope_type = 'company') = (scope_id IS NULL)),
  ADD CONSTRAINT admin_attendance_rule_values_company_value_check
    CHECK (scope_type <> 'company' OR value IS NOT NULL),
  ADD CONSTRAINT admin_attendance_rule_values_status_check
    CHECK (status IN ('active', 'draft', 'pending'));

CREATE INDEX IF NOT EXISTS admin_attendance_rule_values_scope_idx
  ON public.admin_attendance_rule_values (rule_key, scope_type, scope_id, effective_from DESC, id DESC)
  WHERE status = 'active';

-- Company row for every rule (built-in default as the starting value).
INSERT INTO public.admin_attendance_rule_values
  (rule_key, scope_type, scope_id, scope_label, value, effective_from, reason, created_by, created_by_name)
SELECT r.rule_key, 'company', NULL, NULL, r.default_value, DATE '2000-01-01', 'Existing rule at setup', NULL, 'System'
FROM public.admin_attendance_rules r
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_attendance_rule_values v
  WHERE v.rule_key = r.rule_key AND v.scope_type = 'company'
);

-- -----------------------------------------------------------------------------
-- 3. Groups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_rule_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'custom' CHECK (kind IN ('grade', 'custom')),
  description text NOT NULL DEFAULT '',
  match_departments text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_rule_groups_name_active_idx
  ON public.admin_rule_groups (lower(btrim(name))) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.admin_rule_group_members (
  group_id uuid NOT NULL REFERENCES public.admin_rule_groups (id) ON DELETE CASCADE,
  employee_code text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (group_id, employee_code)
);

CREATE INDEX IF NOT EXISTS admin_rule_group_members_code_idx
  ON public.admin_rule_group_members (employee_code);

-- -----------------------------------------------------------------------------
-- 4. Approvals + audit events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_rules_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  require_approval boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_name text
);
INSERT INTO public.admin_rules_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_attendance_rule_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id bigint NOT NULL UNIQUE REFERENCES public.admin_attendance_rule_values (id),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note text NOT NULL DEFAULT '',
  applied_value_id bigint REFERENCES public.admin_attendance_rule_values (id),
  decided_by uuid DEFAULT auth.uid(),
  decided_by_name text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_rules_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  target_id text,
  target_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL DEFAULT '',
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- History tables are append-only.
CREATE OR REPLACE FUNCTION public.admin_rules_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Rules history is append-only (% on %).', TG_OP, TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS admin_attendance_rule_values_append_only ON public.admin_attendance_rule_values;
CREATE TRIGGER admin_attendance_rule_values_append_only
  BEFORE UPDATE OR DELETE ON public.admin_attendance_rule_values
  FOR EACH ROW EXECUTE FUNCTION public.admin_rules_block_mutation();

DROP TRIGGER IF EXISTS admin_attendance_rule_reviews_append_only ON public.admin_attendance_rule_reviews;
CREATE TRIGGER admin_attendance_rule_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.admin_attendance_rule_reviews
  FOR EACH ROW EXECUTE FUNCTION public.admin_rules_block_mutation();

DROP TRIGGER IF EXISTS admin_rules_events_append_only ON public.admin_rules_events;
CREATE TRIGGER admin_rules_events_append_only
  BEFORE UPDATE OR DELETE ON public.admin_rules_events
  FOR EACH ROW EXECUTE FUNCTION public.admin_rules_block_mutation();

-- RLS: every signed-in user reads (rules drive attendance screens); writes via RPC only.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_rule_groups', 'admin_rule_group_members', 'admin_rules_settings',
    'admin_attendance_rule_reviews', 'admin_rules_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Resolver
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rule_norm_employee(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(public.normalize_attendance_employee_code(p_code), '');
$$;

-- Department-level value (no employee context). Same signature and results as
-- before; used by the four C/O helpers.
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
        AND v.status = 'active'
        AND v.scope_type = 'department'
        AND v.scope_id = public.admin_rule_norm_department(p_department)
        AND v.effective_from <= coalesce(p_on, current_date)
      ORDER BY v.effective_from DESC, v.id DESC
      LIMIT 1
    ),
    (
      SELECT v.value
      FROM public.admin_attendance_rule_values v
      WHERE v.rule_key = p_rule_key
        AND v.status = 'active'
        AND v.scope_type = 'company'
        AND v.effective_from <= coalesce(p_on, current_date)
      ORDER BY v.effective_from DESC, v.id DESC
      LIMIT 1
    ),
    (SELECT r.default_value FROM public.admin_attendance_rules r WHERE r.rule_key = p_rule_key)
  );
$$;

-- Value for one employee on one date, and where it came from.
-- source_scope: employee | group | department | company | default
CREATE OR REPLACE FUNCTION public.get_rule_detail(
  p_employee_code text,
  p_rule_key text,
  p_on date DEFAULT NULL
)
RETURNS TABLE (value jsonb, source_scope text, source_id text, source_label text, value_id bigint)
LANGUAGE sql
STABLE
AS $$
  WITH ctx AS (
    SELECT public.admin_rule_norm_employee(p_employee_code) AS emp,
           coalesce(p_on, current_date) AS d
  ),
  emp AS (
    SELECT public.admin_rule_norm_department(m.department) AS dept_key
    FROM public.admin_ifsp_employee_master m, ctx
    WHERE ctx.emp IS NOT NULL
      AND public.normalize_attendance_employee_code(m.employee_code) = ctx.emp
    LIMIT 1
  ),
  latest AS (
    SELECT DISTINCT ON (v.scope_type, v.scope_id)
      v.id, v.scope_type, v.scope_id, v.scope_label, v.value
    FROM public.admin_attendance_rule_values v, ctx
    WHERE v.rule_key = p_rule_key
      AND v.status = 'active'
      AND v.effective_from <= ctx.d
    ORDER BY v.scope_type, v.scope_id, v.effective_from DESC, v.id DESC
  ),
  my_groups AS (
    SELECT g.id::text AS gid, g.name, g.created_at
    FROM public.admin_rule_groups g, ctx
    WHERE g.is_active
      AND ctx.emp IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.admin_rule_group_members gm
          WHERE gm.group_id = g.id AND gm.employee_code = ctx.emp
        )
        OR EXISTS (
          SELECT 1 FROM emp, unnest(g.match_departments) md
          WHERE emp.dept_key IS NOT NULL AND public.admin_rule_norm_department(md) = emp.dept_key
        )
      )
  ),
  candidates AS (
    SELECT l.value, 'employee'::text AS scope, l.scope_id, l.scope_label, l.id, 1 AS rank,
           NULL::timestamptz AS group_created
    FROM latest l, ctx
    WHERE l.scope_type = 'employee' AND l.scope_id = ctx.emp AND l.value IS NOT NULL
    UNION ALL
    SELECT l.value, 'group', l.scope_id, g.name, l.id, 2, g.created_at
    FROM latest l JOIN my_groups g ON g.gid = l.scope_id
    WHERE l.scope_type = 'group' AND l.value IS NOT NULL
    UNION ALL
    SELECT l.value, 'department', l.scope_id, l.scope_label, l.id, 3, NULL
    FROM latest l, emp
    WHERE l.scope_type = 'department' AND l.scope_id = emp.dept_key AND l.value IS NOT NULL
    UNION ALL
    SELECT l.value, 'company', NULL, NULL, l.id, 4, NULL
    FROM latest l
    WHERE l.scope_type = 'company'
    UNION ALL
    SELECT r.default_value, 'default', NULL, NULL, NULL, 5, NULL
    FROM public.admin_attendance_rules r
    WHERE r.rule_key = p_rule_key
  )
  SELECT c.value, c.scope, c.scope_id, c.scope_label, c.id
  FROM candidates c
  ORDER BY c.rank, c.group_created DESC NULLS LAST, c.scope_id DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_rule(
  p_employee_code text,
  p_rule_key text,
  p_on date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT d.value FROM public.get_rule_detail(p_employee_code, p_rule_key, p_on) d;
$$;

-- Many employees × rules × days at once (register and C/O screens).
CREATE OR REPLACE FUNCTION public.get_rules_bulk(
  p_employee_codes text[],
  p_rule_keys text[],
  p_from date,
  p_to date
)
RETURNS TABLE (employee_code text, rule_key text, on_date date, value jsonb, source_scope text, source_id text)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Choose a valid date range.' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > 62 THEN
    RAISE EXCEPTION 'Date range can be at most 63 days.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_employee_codes, 1), 0) > 3000 THEN
    RAISE EXCEPTION 'Too many employees in one request.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT e.code, k.key, d.day::date, r.value, r.source_scope, r.source_id
  FROM unnest(p_employee_codes) AS e(code)
  CROSS JOIN unnest(p_rule_keys) AS k(key)
  CROSS JOIN generate_series(p_from, p_to, interval '1 day') AS d(day)
  CROSS JOIN LATERAL public.get_rule_detail(e.code, k.key, d.day::date) AS r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rule_norm_employee(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rule_detail(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rule(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rules_bulk(text[], text[], date, date) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Save, approve, groups (server-checked admin only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_rules_actor_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT coalesce(
              nullif(btrim(to_jsonb(p) ->> 'full_name'), ''),
              nullif(btrim(to_jsonb(p) ->> 'name'), ''),
              nullif(btrim(to_jsonb(p) ->> 'email'), ''))
     FROM public.profiles p WHERE p.id = auth.uid()),
    CASE WHEN coalesce(auth.role(), '') = 'service_role' THEN 'System' ELSE 'Admin' END
  );
$$;

-- Approval switch: Super Admin / Super Admin Pro only.
CREATE OR REPLACE FUNCTION public.admin_rules_can_configure()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce((to_jsonb(p) ->> 'is_active')::boolean, true)
        AND public.normalize_erp_role(p.role) IN ('super_admin', 'super_admin_pro')
    );
$$;

-- Validates a value against the rule's type; returns it normalised.
CREATE OR REPLACE FUNCTION public.admin_rules_check_value(p_rule public.admin_attendance_rules, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_num numeric;
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_rule.value_type
    WHEN 'boolean' THEN
      IF jsonb_typeof(p_value) <> 'boolean' THEN
        RAISE EXCEPTION 'Choose Yes or No.' USING ERRCODE = '22023';
      END IF;
      RETURN p_value;

    WHEN 'number' THEN
      IF jsonb_typeof(p_value) <> 'number' THEN
        RAISE EXCEPTION 'Enter a number.' USING ERRCODE = '22023';
      END IF;
      v_num := (p_value #>> '{}')::numeric;
      IF (p_rule.min_value IS NOT NULL AND v_num < p_rule.min_value)
         OR (p_rule.max_value IS NOT NULL AND v_num > p_rule.max_value) THEN
        RAISE EXCEPTION 'Enter a value between % and %.', p_rule.min_value, p_rule.max_value USING ERRCODE = '22023';
      END IF;
      IF p_rule.step IS NOT NULL AND p_rule.step > 0 AND mod(v_num, p_rule.step) <> 0 THEN
        IF p_rule.step = 1 THEN
          RAISE EXCEPTION 'Enter a whole number.' USING ERRCODE = '22023';
        END IF;
        RAISE EXCEPTION 'Enter a multiple of %.', p_rule.step USING ERRCODE = '22023';
      END IF;
      RETURN to_jsonb(v_num);

    WHEN 'select' THEN
      IF jsonb_typeof(p_value) <> 'string'
         OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_rule.options, '[]')) o WHERE o ->> 'value' = p_value #>> '{}') THEN
        RAISE EXCEPTION 'Choose one of the listed options.' USING ERRCODE = '22023';
      END IF;
      RETURN p_value;

    WHEN 'time' THEN
      IF jsonb_typeof(p_value) <> 'string' OR (p_value #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RAISE EXCEPTION 'Enter a time as HH:MM.' USING ERRCODE = '22023';
      END IF;
      RETURN p_value;

    WHEN 'date' THEN
      IF jsonb_typeof(p_value) <> 'string' OR (p_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Enter a valid date.' USING ERRCODE = '22023';
      END IF;
      PERFORM (p_value #>> '{}')::date;
      RETURN p_value;

    WHEN 'multi_number' THEN
      IF jsonb_typeof(p_value) <> 'array' THEN
        RAISE EXCEPTION 'Choose one or more values.' USING ERRCODE = '22023';
      END IF;
      FOR v_item IN SELECT DISTINCT e FROM jsonb_array_elements(p_value) e LOOP
        IF jsonb_typeof(v_item) <> 'number' THEN
          RAISE EXCEPTION 'Choose from the listed values.' USING ERRCODE = '22023';
        END IF;
        v_num := (v_item #>> '{}')::numeric;
        IF v_num <> trunc(v_num)
           OR (p_rule.min_value IS NOT NULL AND v_num < p_rule.min_value)
           OR (p_rule.max_value IS NOT NULL AND v_num > p_rule.max_value) THEN
          RAISE EXCEPTION 'Choose from the listed values.' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_out
      FROM (SELECT DISTINCT (e #>> '{}')::int AS x FROM jsonb_array_elements(p_value) e) s;
      RETURN v_out;
  END CASE;
  RETURN p_value;
END;
$$;

-- Latest own value of one scope on a date (NULL when the scope inherits).
CREATE OR REPLACE FUNCTION public.admin_rules_own_value(
  p_rule_key text,
  p_scope_type text,
  p_scope_id text,
  p_on date
)
RETURNS TABLE (has_row boolean, value jsonb)
LANGUAGE sql
STABLE
AS $$
  SELECT true, v.value
  FROM public.admin_attendance_rule_values v
  WHERE v.rule_key = p_rule_key
    AND v.status = 'active'
    AND v.scope_type = p_scope_type
    AND v.scope_id IS NOT DISTINCT FROM p_scope_id
    AND v.effective_from <= p_on
  ORDER BY v.effective_from DESC, v.id DESC
  LIMIT 1;
$$;

-- Save one change. p_value NULL on a non-company scope = back to inherit.
-- Returns {"id": ..., "status": "active" | "pending"}.
CREATE OR REPLACE FUNCTION public.admin_rules_save_scoped(
  p_rule_key text,
  p_scope_type text,
  p_scope_id text,
  p_value jsonb,
  p_effective_from date,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.admin_attendance_rules;
  v_scope text := lower(btrim(coalesce(p_scope_type, '')));
  v_scope_id text;
  v_label text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_value jsonb := CASE WHEN p_value = 'null'::jsonb THEN NULL ELSE p_value END;
  v_own record;
  v_status text;
  v_id bigint;
BEGIN
  IF NOT public.admin_rules_can_edit() THEN
    RAISE EXCEPTION 'Only admins can change rules.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rule FROM public.admin_attendance_rules WHERE rule_key = p_rule_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown rule.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_rule.is_wired OR v_rule.retired THEN
    RAISE EXCEPTION 'This rule cannot be changed here yet.' USING ERRCODE = '22023';
  END IF;
  IF v_scope NOT IN ('company', 'department', 'group', 'employee') THEN
    RAISE EXCEPTION 'Choose who the change applies to.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_scope = ANY (v_rule.allowed_scopes) THEN
    RAISE EXCEPTION 'This rule cannot be set for a % yet.', v_scope USING ERRCODE = '22023';
  END IF;

  IF v_scope = 'company' THEN
    v_scope_id := NULL;
  ELSIF v_scope = 'department' THEN
    v_scope_id := public.admin_rule_norm_department(p_scope_id);
    v_label := btrim(p_scope_id);
    IF v_scope_id IS NULL THEN
      RAISE EXCEPTION 'Choose a department.' USING ERRCODE = '22023';
    END IF;
  ELSIF v_scope = 'group' THEN
    SELECT g.id::text, g.name INTO v_scope_id, v_label
    FROM public.admin_rule_groups g
    WHERE g.id::text = btrim(coalesce(p_scope_id, '')) AND g.is_active;
    IF v_scope_id IS NULL THEN
      RAISE EXCEPTION 'Choose an active group.' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_scope_id := public.admin_rule_norm_employee(p_scope_id);
    SELECT coalesce(nullif(btrim(m.full_name), ''), v_scope_id) || ' (' || v_scope_id || ')' INTO v_label
    FROM public.admin_ifsp_employee_master m
    WHERE public.normalize_attendance_employee_code(m.employee_code) = v_scope_id
    LIMIT 1;
    IF v_scope_id IS NULL OR v_label IS NULL THEN
      RAISE EXCEPTION 'Choose an employee from Employee Master.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_scope = 'company' AND v_value IS NULL THEN
    RAISE EXCEPTION 'Company default needs a value.' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for the change.' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL OR p_effective_from < current_date THEN
    RAISE EXCEPTION 'Changes can start today or later.' USING ERRCODE = '22023';
  END IF;

  v_value := public.admin_rules_check_value(v_rule, v_value);

  SELECT * INTO v_own FROM public.admin_rules_own_value(p_rule_key, v_scope, v_scope_id, p_effective_from);
  IF v_value IS NULL AND (v_own.has_row IS NULL OR v_own.value IS NULL) THEN
    RAISE EXCEPTION 'Nothing to reset — this already follows the level above.' USING ERRCODE = '22023';
  END IF;
  IF v_value IS NOT NULL AND v_own.value IS NOT NULL AND v_own.value = v_value THEN
    RAISE EXCEPTION 'No change — the value is already in force.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_attendance_rule_values v
    WHERE v.rule_key = p_rule_key AND v.status = 'pending'
      AND v.scope_type = v_scope AND v.scope_id IS NOT DISTINCT FROM v_scope_id
      AND NOT EXISTS (SELECT 1 FROM public.admin_attendance_rule_reviews rv WHERE rv.request_id = v.id)
  ) THEN
    RAISE EXCEPTION 'A change for this is already waiting for approval.' USING ERRCODE = '22023';
  END IF;

  v_status := CASE
    WHEN coalesce((SELECT s.require_approval FROM public.admin_rules_settings s LIMIT 1), false) THEN 'pending'
    ELSE 'active'
  END;

  INSERT INTO public.admin_attendance_rule_values
    (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
     created_by, created_by_name)
  VALUES
    (p_rule_key, v_scope, v_scope_id, v_label, v_value, v_own.value, p_effective_from, v_reason, v_status,
     auth.uid(), public.admin_rules_actor_name())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END;
$$;

-- Previous signature kept for the current page: department NULL = company.
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
  v_res jsonb;
  v_row public.admin_attendance_rule_values;
BEGIN
  v_res := public.admin_rules_save_scoped(
    p_rule_key,
    CASE WHEN nullif(btrim(coalesce(p_department, '')), '') IS NULL THEN 'company' ELSE 'department' END,
    p_department,
    p_value,
    p_effective_from,
    p_reason
  );
  SELECT * INTO v_row FROM public.admin_attendance_rule_values WHERE id = (v_res ->> 'id')::bigint;
  RETURN v_row;
END;
$$;

-- Approve or reject a pending change. The approver must be a different person.
CREATE OR REPLACE FUNCTION public.admin_rules_review(p_request_id bigint, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_attendance_rule_values;
  v_rule public.admin_attendance_rules;
  v_start date;
  v_own record;
  v_applied bigint;
BEGIN
  IF NOT public.admin_rules_can_edit() THEN
    RAISE EXCEPTION 'Only admins can review rule changes.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.admin_attendance_rule_values WHERE id = p_request_id FOR SHARE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was not found.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_attendance_rule_reviews WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'This request was already decided.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND v_req.created_by IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Someone else must approve your own change.' USING ERRCODE = '42501';
  END IF;

  IF p_approve THEN
    SELECT * INTO v_rule FROM public.admin_attendance_rules WHERE rule_key = v_req.rule_key;
    IF NOT v_rule.is_wired OR v_rule.retired OR NOT v_req.scope_type = ANY (v_rule.allowed_scopes) THEN
      RAISE EXCEPTION 'This rule can no longer be changed this way.' USING ERRCODE = '22023';
    END IF;
    v_start := greatest(v_req.effective_from, current_date);
    SELECT * INTO v_own FROM public.admin_rules_own_value(v_req.rule_key, v_req.scope_type, v_req.scope_id, v_start);

    INSERT INTO public.admin_attendance_rule_values
      (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status,
       request_id, created_by, created_by_name)
    VALUES
      (v_req.rule_key, v_req.scope_type, v_req.scope_id, v_req.scope_label, v_req.value, v_own.value, v_start,
       v_req.reason, 'active', v_req.id, v_req.created_by, v_req.created_by_name)
    RETURNING id INTO v_applied;
  END IF;

  INSERT INTO public.admin_attendance_rule_reviews (request_id, decision, note, applied_value_id, decided_by, decided_by_name)
  VALUES (p_request_id, CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, btrim(coalesce(p_note, '')),
          v_applied, auth.uid(), public.admin_rules_actor_name());

  RETURN jsonb_build_object('decision', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
                            'applied_value_id', v_applied, 'effective_from', v_start);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rules_set_approval(p_require boolean, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_rules_can_configure() THEN
    RAISE EXCEPTION 'Only Super Admins can turn approvals on or off.' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for the change.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.admin_rules_settings
  SET require_approval = coalesce(p_require, false), updated_at = now(), updated_by_name = public.admin_rules_actor_name()
  WHERE id;
  INSERT INTO public.admin_rules_events (event_type, details, reason, created_by_name)
  VALUES ('approval_setting', jsonb_build_object('require_approval', coalesce(p_require, false)),
          btrim(p_reason), public.admin_rules_actor_name());
  RETURN coalesce(p_require, false);
END;
$$;

-- Create (p_id NULL) or edit a group.
CREATE OR REPLACE FUNCTION public.admin_rule_group_save(
  p_id uuid,
  p_name text,
  p_kind text,
  p_description text,
  p_match_departments text[],
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_id;
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'custom');
  v_depts text[];
  v_before jsonb;
BEGIN
  IF NOT public.admin_rules_can_edit() THEN
    RAISE EXCEPTION 'Only admins can change groups.' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Enter a group name.' USING ERRCODE = '22023';
  END IF;
  IF v_kind NOT IN ('grade', 'custom') THEN
    RAISE EXCEPTION 'Choose a group type.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for the change.' USING ERRCODE = '22023';
  END IF;
  -- One entry per department (first spelling kept), in the order given.
  SELECT coalesce(array_agg(s.name ORDER BY s.pos), '{}') INTO v_depts
  FROM (
    SELECT DISTINCT ON (public.admin_rule_norm_department(d)) btrim(d) AS name, pos
    FROM unnest(coalesce(p_match_departments, '{}')) WITH ORDINALITY AS u(d, pos)
    WHERE public.admin_rule_norm_department(d) IS NOT NULL
    ORDER BY public.admin_rule_norm_department(d), pos
  ) s;

  IF EXISTS (
    SELECT 1 FROM public.admin_rule_groups g
    WHERE g.is_active AND lower(btrim(g.name)) = lower(v_name) AND g.id IS DISTINCT FROM v_id
  ) THEN
    RAISE EXCEPTION 'A group with this name already exists.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.admin_rule_groups (name, kind, description, match_departments, created_by_name)
    VALUES (v_name, v_kind, btrim(coalesce(p_description, '')), v_depts, public.admin_rules_actor_name())
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(g) INTO v_before FROM public.admin_rule_groups g WHERE g.id = v_id AND g.is_active;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'This group was not found.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.admin_rule_groups
    SET name = v_name, kind = v_kind, description = btrim(coalesce(p_description, '')),
        match_departments = v_depts, updated_at = now()
    WHERE id = v_id;
  END IF;

  INSERT INTO public.admin_rules_events (event_type, target_id, target_label, details, reason, created_by_name)
  VALUES (CASE WHEN p_id IS NULL THEN 'group_created' ELSE 'group_updated' END, v_id::text, v_name,
          jsonb_build_object('kind', v_kind, 'match_departments', to_jsonb(v_depts), 'before', v_before),
          btrim(p_reason), public.admin_rules_actor_name());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rule_group_set_members(
  p_group_id uuid,
  p_add text[],
  p_remove text[],
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_add text[];
  v_remove text[];
  v_unknown text[];
  v_count integer;
BEGIN
  IF NOT public.admin_rules_can_edit() THEN
    RAISE EXCEPTION 'Only admins can change groups.' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM public.admin_rule_groups WHERE id = p_group_id AND is_active;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'This group was not found.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for the change.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(DISTINCT c) FILTER (WHERE c IS NOT NULL), '{}') INTO v_add
  FROM (SELECT public.admin_rule_norm_employee(x) AS c FROM unnest(coalesce(p_add, '{}')) x) s;
  SELECT coalesce(array_agg(DISTINCT c) FILTER (WHERE c IS NOT NULL), '{}') INTO v_remove
  FROM (SELECT public.admin_rule_norm_employee(x) AS c FROM unnest(coalesce(p_remove, '{}')) x) s;

  SELECT coalesce(array_agg(c), '{}') INTO v_unknown
  FROM unnest(v_add) c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_ifsp_employee_master m
    WHERE public.normalize_attendance_employee_code(m.employee_code) = c
  );
  IF cardinality(v_unknown) > 0 THEN
    RAISE EXCEPTION 'Not in Employee Master: %', array_to_string(v_unknown, ', ') USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_rule_group_members (group_id, employee_code)
  SELECT p_group_id, c FROM unnest(v_add) c
  ON CONFLICT DO NOTHING;
  DELETE FROM public.admin_rule_group_members WHERE group_id = p_group_id AND employee_code = ANY (v_remove);

  INSERT INTO public.admin_rules_events (event_type, target_id, target_label, details, reason, created_by_name)
  VALUES ('group_members', p_group_id::text, v_name,
          jsonb_build_object('added', to_jsonb(v_add), 'removed', to_jsonb(v_remove)),
          btrim(p_reason), public.admin_rules_actor_name());

  SELECT count(*) INTO v_count FROM public.admin_rule_group_members WHERE group_id = p_group_id;
  RETURN v_count;
END;
$$;

-- Archive a group. Blocked while it still has its own value for any rule.
CREATE OR REPLACE FUNCTION public.admin_rule_group_archive(p_group_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.admin_rules_can_edit() THEN
    RAISE EXCEPTION 'Only admins can change groups.' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM public.admin_rule_groups WHERE id = p_group_id AND is_active;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'This group was not found.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for the change.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT ON (v.rule_key) v.value
      FROM public.admin_attendance_rule_values v
      WHERE v.scope_type = 'group' AND v.scope_id = p_group_id::text AND v.status = 'active'
      ORDER BY v.rule_key, v.effective_from DESC, v.id DESC
    ) latest
    WHERE latest.value IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Reset this group''s rule values to "Inherit" before archiving it.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.admin_rule_groups SET is_active = false, updated_at = now() WHERE id = p_group_id;
  INSERT INTO public.admin_rules_events (event_type, target_id, target_label, reason, created_by_name)
  VALUES ('group_archived', p_group_id::text, v_name, btrim(p_reason), public.admin_rules_actor_name());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rules_save_scoped(text, text, text, jsonb, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rules_save(text, text, jsonb, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rules_review(bigint, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rules_set_approval(boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rule_group_save(uuid, text, text, text, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rule_group_set_members(uuid, text[], text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rule_group_archive(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_rules_save_scoped(text, text, text, jsonb, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rules_save(text, text, jsonb, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rules_review(bigint, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rules_set_approval(boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_group_save(uuid, text, text, text, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_group_set_members(uuid, text[], text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rule_group_archive(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_rules_can_configure() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

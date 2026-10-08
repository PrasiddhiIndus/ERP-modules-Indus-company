# Rules Console

Admin → Rules Console (`/app/admin/rules-console`). Visible to Admin, Super Admin and Super Admin Pro, and to anyone
given the **Rules Console** page in User Management (`admin.rules-console`, opt-in: a full Admin module does not
imply it). Page holders can do everything admins can on the console (`admin_rules_can_edit`, migration
`20261008150000_admin_rules_console_page_access.sql`); the approval on/off switch stays Super Admin only.

One page that lists every attendance, leave and C/O rule grouped by module, with the value in force today and the
departments that differ. Rules marked **Changeable** open a side panel to change the company default or one
department's value, with a start date (today or later) and a reason. Every change is kept as history.

Work is in three phases. **Phase 1 (done): data model, resolver, approvals plumbing, group priority.**
**Phase 2A (done): weekly off reads from rules.** Phase 2B–2F wire the remaining rules one at a time. Phase 3 adds the
matrix view, groups, employee exceptions, audit log and approvals pages.

## How a value is chosen

`get_rule(employee_code, rule_key, on_date)` returns `value`, `source_scope` (employee, group, department, company,
default), `source_id` (employee code, group id or department key), `source_label` and `value_id`.
`get_rule_value(...)` returns the value alone. The browser mirror is `resolveRuleDetail()` in
`src/lib/attendanceRules.js` (`{ value, sourceScope, sourceId, sourceLabel, valueId }`). Both pick the first level that
has a value:

1. **Employee** override
2. **Group** override (groups the employee belongs to)
3. **Department** override (department from Employee Master)
4. **Company** default
5. Built-in default from the catalogue (only if the company row is missing)

- Each level uses its latest **active** row with `effective_from <= on_date`, so a future-dated change leaves earlier
  days unchanged.
- A row whose value is empty means "Inherit": the override was removed from that date.
- **Groups** = hand-picked employees plus whole departments listed on the group. Membership is not dated (past dates
  use today's membership). There is no grade column in Employee Master, so "grade" is only a label on a group.
- **Two groups with a value:** the group with the higher **priority** wins. Priority is a whole number 1–100000,
  unique among active groups, editable (`admin_rule_group_save(..., p_priority)`; a new group without one goes on
  top: highest + 10). Groups that existed before priorities were added got them in creation order (newest highest),
  so results did not change. Only groups that have a value for that rule on that date compete.
- Pending or draft changes never apply.

## Backend

Migrations:

- `supabase/migrations/20261008100000_admin_attendance_rules_console.sql` — catalogue, history, first five wired rules.
- `supabase/migrations/20261008120000_admin_rules_console_scopes.sql` — Phase 1 (scopes, groups, resolver, approvals).
- `supabase/migrations/20261008130000_admin_rules_console_group_priority.sql` — group priority; `get_rule` returns
  the source level.
- `supabase/migrations/20261008140000_admin_rules_weekly_off.sql` — Phase 2A engine and seeds (rules not editable yet).
- `supabase/migrations/20261008140050_admin_rules_weekly_off_speed.sql` — speed-up for the weekly-off check.
- `supabase/migrations/20261008140100_admin_rules_weekly_off_wire.sql` — makes the four weekly-off rules editable.
- Rollbacks (run by hand, newest first) in `supabase/rollbacks/`, one `_down.sql` per migration above.

### Deploy order (Phase 2A)

1. Deploy the frontend. Until 140000 is applied it keeps reading the old 3rd-Saturday rule.
2. Run `scripts/rulesConsole/regression.sql` and save the output.
3. Apply 120000, 130000, 140000 and 140050 (speed-up: index on the normalised employee code and a shortcut for
   days that cannot be a weekly off).
4. Run `regression.sql` again — every row must match — and `scripts/rulesConsole/regression-weekly-off.sql` — both
   rows must show 0 differences.
5. Only then apply 140100 (wiring). If anything differs, run the 140000 rollback instead.

| Object | Purpose |
| --- | --- |
| `admin_attendance_rules` | Catalogue: key, module, label, description, `value_type` (boolean, number, select, time, date, multi_number), `options`, `min_value` / `max_value` / `step`, `unit`, `allowed_scopes`, `is_wired`, `hidden_until_wired`, `retired`, `replaces`, `engine_ref`, `default_value`. |
| `admin_attendance_rule_values` | Append-only dated history: `scope_type` (company, department, group, employee), `scope_id`, `scope_label`, `value`, `old_value`, `effective_from`, `reason`, `status` (active, draft, pending), `request_id`, `created_by`, `created_by_name`, `created_at`. |
| `admin_rule_groups`, `admin_rule_group_members` | Groups (`kind` grade or custom, `match_departments`, `priority`) and hand-picked members. |
| `admin_rules_settings` | `require_approval` (off by default). |
| `admin_attendance_rule_reviews` | Approve / reject decisions for pending changes (append-only). |
| `admin_rules_events` | Log of group and approval-setting changes (append-only). |
| `get_rule`, `get_rule_value` | Value for one employee on one date, and which level supplied it / value only. |
| `get_rules_bulk(codes[], keys[], from, to)` | Same for many employees × rules × days (≤ 63 days, ≤ 3000 employees). |
| `admin_rule_is_weekly_off(code, date)`, `admin_rule_weekly_off_pattern`, `admin_rule_holidays_apply`, `admin_rule_is_third_saturday` | Weekly-off and holiday checks used by the C/O engine. |
| `admin_rule_value(rule, department, on_date)` | Company / department only. Used by the C/O engine; unchanged results. |
| `admin_rules_save_scoped(rule, scope_type, scope_id, value, effective_from, reason)` | Only write path for values. |
| `admin_rules_save(rule, department, value, effective_from, reason)` | Previous signature, kept for the current page. |
| `admin_rules_review(request_id, approve, note)` | Approve (applies from the later of its start date and today) or reject. |
| `admin_rules_set_approval(on, reason)` | Super Admin / Super Admin Pro only. |
| `admin_rule_group_save`, `admin_rule_group_set_members`, `admin_rule_group_archive` | Group management. |

Save checks (server side): admin role; rule wired and not retired; level allowed for the rule; department / active
group / employee in Employee Master; reason given; start date today or later; value type, range, step and options;
"No change" when the level already has that value; "Inherit" only where an override exists; one pending request per
rule and level. When approvals are on, saves are stored as pending and a **different** admin must approve.

Signed-in users can read every table (attendance screens need the rules); nobody can write them directly, and the
history tables reject UPDATE and DELETE.

## Rule catalogue

Scopes: C = company, D = department, G = group, E = employee. "Phase 2x" = not wired yet; the rule is not editable
until it is. "Hidden" rules replace an older key and stay hidden until wired.

### Weekly off

| Key | Type | Default | Scopes | Read by |
| --- | --- | --- | --- | --- |
| `wo.pattern` (replaces `wo.third_saturday_off`) | select: Sunday + 3rd Saturday / Sunday only / No weekly off / Custom weekdays | Sunday + 3rd Saturday ("Sunday only" for Production, Production-FTC, Production - Neotech, R&M, M&M, Maintenance-FTC — carried over with its history) | C D G E | SQL `admin_rule_is_weekly_off` ← `indus_one.comp_off_is_earning_day`. Browser `isWeeklyOffDay` → `isWeeklyOffDate` / `isAutoWeekoffDate` → register sync (`syncRegisterAutoWeekoffMarks`, incl. clearing stale WO), `buildMonthlyRegisterGrid`, totals (`totalPresentCreditMark`, PL/CL/SL on a weekly off, `isPaidThirdSaturdayWeekoffCell`) |
| `wo.custom_days` | multi_number (0 = Sun … 6 = Sat) | Sun | C D G E | Same readers, when the pattern is "Custom weekdays" |
| `wo.auto` | boolean | Yes | C D G E | `isAutoWeeklyOffDay` → register sync and grid (the day stays a weekly off for totals and C/O; it is just not filled in) |
| `wo.auto_holiday` | boolean | Yes | C D G E | SQL `admin_rule_holidays_apply` ← `comp_off_is_earning_day`. Browser `isAutoHolidayFor` → `syncRegisterAutoHolidayMarks` (incl. clearing stale NH/PH), totals |
| `wo.third_saturday_off` (retired) | boolean | — | — | Not read since Phase 2A. Kept for history; still visible to `admin_rule_value` and `regression.sql`. |

**Weekly-off behaviour (Phase 2A)**

- A day that is not a weekly off for the employee earns no C/O — except a calendar NH/PH where holidays apply, a
  day already marked WO or NH/PH in the register (e.g. entered by Admin), and the exception below.
- "No weekly off": no WO is filled in (Sundays included), Sunday punch / tour / P(OD) counts as an ordinary present
  day in totals and earns no C/O, and leave on a Sunday counts as leave.
- Exception kept from before (replaced in Phase 2B by `co.third_saturday_basis`): a worked 3rd Saturday earns C/O
  when the pattern is "Sunday only" and `co.third_saturday_earns` is Yes — today M&M and Maintenance-FTC.
- `wo.auto_holiday` off: holidays do not apply to that employee at all — no NH/PH mark (an automatic one is cleared),
  no C/O for working it, and a punch that day counts as present.

### Attendance

| Key | Type | Default | Scopes | Read by |
| --- | --- | --- | --- | --- |
| `att.half_day_cutoff` | time | 13:00 | C D G E | Phase 2E |
| `att.purple_first_from` | time | 12:00 | C D G E | Phase 2E |
| `att.purple_first_to` | time | 15:00 | C D G E | Phase 2E |
| `att.purple_last_before` | time | 12:00 | C D G E | Phase 2E |
| `att.shift_start` | time | 09:00 | C D G E | Phase 2E |
| `att.shift_end` | time | 18:00 | C D G E | Phase 2E |
| `att.grace_minutes` | number 0–120 | 0 | C D G E | Phase 2E |
| `att.punch_overrides_leave` | boolean | Yes | C D G E | Phase 2E |

### Leave

| Key | Type | Default | Scopes | Read by |
| --- | --- | --- | --- | --- |
| `leave.entitlement_pl` / `_cl` / `_sl` / `_sbel` / `_spla` / `_splb` / `_splm` / `_paternity` | number 0–60, step 0.5 | 18 / 8 / 8 / 2 / 0.5 / 0.5 / 3 / 3 | C D G E | Phase 2F |
| `leave.prorate_by_joining` | boolean | Yes | C D G E | Phase 2F |
| `leave.probation_cl_per_month` / `leave.probation_sl_per_month` | number 0–5 | 1 / 1 | C D G E | Phase 2F |
| `leave.carry_cap_pl` / `leave.carry_cap_sl` | number 0–60 | 7 / 8 | C D G E | Phase 2F |
| `leave.carry_cl` | boolean | No | C D G E | Phase 2F |
| `leave.carry_cap_cl` | number 0–60 | 0 | C D G E | Phase 2F |
| `leave.sandwich` | boolean | Yes | C D G E | Phase 2F |
| `leave.no_mixing` | boolean | Yes | C D G E | Phase 2F |
| `leave.no_mixing_window_days` | number 1–60 | 14 | C D G E | Phase 2F |
| `leave.insufficient_balance` | select: block / allow as LWP / allow negative | Block | C D G E | Phase 2F |

### Comp-off (C/O)

| Key | Type | Default | Scopes | Read by |
| --- | --- | --- | --- | --- |
| `co.start_date` | date | 2026-09-01 | C | `indus_one.comp_off_cutoff_date()`, `compOffBalance.compOffCutoffMonthKey()`. Also serves as "C/O counted from". |
| `co.expiry_months` | number 1–24 | 2 | C | `indus_one.comp_off_expiry_for_earned()` (as of the earned date; new credits only) |
| `co.expiry_mode` (hidden) | select: months / never | months | C D G E | Phase 2C |
| `co.sunday_pod_only` | boolean | No (Yes for Production, Production-FTC, Production-Neotech, R&M) | C D | `indus_one.comp_off_sunday_pod_only_employee()` ← `comp_off_try_earn_credit` |
| `co.third_saturday_earns` | boolean | Yes (No for the same four departments) | C D | `indus_one.comp_off_third_saturday_excluded_employee()` ← `comp_off_is_earning_day` |
| `co.earn` | boolean | Yes | C D G E | Phase 2B |
| `co.earn_basis` | select: any present / punch only / P(OD) only | any present | C D G E | Phase 2B |
| `co.sunday_basis` (hidden, replaces `co.sunday_pod_only`) | select: general / any / punch / P(OD) / none | general | C D G E | Phase 2B |
| `co.third_saturday_basis` (hidden, replaces `co.third_saturday_earns`) | select, as above | general | C D G E | Phase 2B |
| `co.holiday_basis` | select, as above | general | C D G E | Phase 2B |
| `co.max_per_day` | number 0.5–2, step 0.5 | 1 | C D G E | Phase 2D |
| `co.allow_manual_adjust` | boolean | Yes | C D G E | Phase 2D |

## Browser cache

`ensureAttendanceRulesLoaded()` loads values, groups and members at most once a minute (and right after a save). If
the tables are missing or unreadable, the built-in defaults above apply — they match the behaviour before the console
existed. It accepts either schema version, so the page keeps working whether or not Phase 1 is applied.

## Checks

- `npm test` — `tests/rulesConsoleRules.test.js` (register helpers, C/O start month, page model) and
  `tests/rulesResolver.test.js` (precedence, groups, future dates, inherit, normalisation).
- `npm run rules:check` — builds an in-memory Postgres from the latest production function definitions in
  `supabase/migrations`, applies the console migrations and checks: identical C/O and rule results before and after,
  history carried over, resolver scenarios, SQL ↔ browser parity, every save / approval / group validation,
  append-only history, and that the rollback restores identical results.
- `npm run rules:check:2a` — Phase 2A: identical C/O engine, `regression.sql`, and register results (weekly off per
  employee × day, grid, totals, sync writes) before and after 140000; SQL ↔ browser parity; wiring; a Dahej HR month
  with no weekly off (punch, leave, tour and a holiday on Sundays); everyone else unchanged; rollback.
- `scripts/rulesConsole/regression.sql` — read-only snapshot for production. Run before and after applying a
  migration; every row must match.
- `scripts/rulesConsole/regression-weekly-off.sql` — read-only; after 140000, compares the new weekly-off rule with the
  old one for every employee × day (previous, current and next month). Must show 0 differences before wiring.

## Not wired (and why)

- Contract, consultant and notice-period staff getting 0 leave stays built in; it is a property of the employment
  type, not a rule an admin should switch per scope.
- `leave.half_day` was dropped from the catalogue: a half-day leave is always half a day.
- `co.counted_from` is the same thing as `co.start_date`, so no separate key.
- Leave sandwich and leave-day counting (`enumerateLeaveDatesWithSandwich`, `attendanceLeaveLimits.js`, SQL
  `admin_leave_working_dates`) still treat Sunday + 3rd Saturday as the weekly off for everyone. They belong to
  leave approval, which is out of scope until Phase 2F.
- Groups have no screen yet (Phase 3); priority is set through `admin_rule_group_save`.

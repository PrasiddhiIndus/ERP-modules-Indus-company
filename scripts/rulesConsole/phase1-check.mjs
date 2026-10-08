/**
 * Rules Console — Phase 1 checks (scopes, groups, resolver, approvals).
 *
 *   node scripts/rulesConsole/phase1-check.mjs
 *
 * 1. Equivalence: the C/O engine and admin_rule_value() give identical results
 *    before and after 20261008120000 (with realistic dated history present).
 * 2. Existing rule history is carried over unchanged.
 * 3. get_rule(): Employee > Group > Department > Company, future dates, two
 *    groups, no group, inherit rows, pending rows ignored, bulk variant.
 * 4. Save / review / group RPCs: every validation, approval flow, append-only.
 * 5. SQL ↔ JS parity: get_rule() vs resolveRuleDetail() on the same data.
 * 6. Rollback restores identical engine results and the old table shape.
 */
import {
  buildEngineDb, readMigration, readRollback, asUser, createReporter, isoDays,
  CONSOLE_MIGRATION, SCOPES_MIGRATION, SCOPES_ROLLBACK, PRIORITY_MIGRATION, PRIORITY_ROLLBACK, EMPLOYEES, ROOT,
} from "./harness.mjs";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const rules = await import(pathToFileURL(`${ROOT}/src/lib/attendanceRules.js`).href);
const { check, expectError, section, done } = createReporter();
const REGRESSION_SQL = readFileSync(`${ROOT}/scripts/rulesConsole/regression.sql`, "utf8");

const WIRED = ["wo.third_saturday_off", "co.start_date", "co.expiry_months", "co.sunday_pod_only", "co.third_saturday_earns"];
const CODES = EMPLOYEES.map((e) => e[0]).concat(["9999", "", "00101", "111"]);
const DEPTS = [...new Set(EMPLOYEES.map((e) => e[2]))].concat(["Dahej HR", "r&m", "R & M", "Other", "Maintenance - FTC"]);

/** Dated history written through the old (Phase 0) schema — what production may already hold. */
const HISTORY_SQL = `
INSERT INTO public.admin_attendance_rule_values
  (rule_key, department, department_key, value, previous_value, effective_from, reason, created_by_name) VALUES
  ('co.expiry_months', NULL, NULL, '3', '2', '2026-11-01', 'Longer expiry', 'Asha Admin'),
  ('co.third_saturday_earns', 'HR', 'hr', 'false', 'true', '2026-10-01', 'HR works 3rd Sat', 'Asha Admin'),
  ('co.third_saturday_earns', 'hr', 'hr', NULL, 'false', '2026-12-01', 'Back to default', 'Asha Admin'),
  ('co.sunday_pod_only', 'Production - Neotech', 'production-neotech', 'false', 'true', '2027-01-01', 'Neotech', 'Asha Admin'),
  ('wo.third_saturday_off', 'Maintenance-FTC', 'maintenance-ftc', 'true', 'false', '2026-11-15', 'Maint off', 'Asha Admin'),
  ('co.start_date', NULL, NULL, '"2026-08-15"', '"2026-09-01"', '2026-12-01', 'Earlier start', 'Asha Admin');
`;

async function engineSnapshot(db, { withCredits = true } = {}) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const codesSql = `ARRAY[${CODES.map((c) => `'${c}'`).join(",")}]::text[]`;
  const out = {};
  out.cutoff = await q(`SELECT indus_one.comp_off_cutoff_date()::text AS v`);
  out.expiry = await q(`SELECT d::date::text AS d, indus_one.comp_off_expiry_for_earned(d::date)::text AS v
                        FROM generate_series('2026-01-01'::date, '2027-12-31'::date, '1 day') d`);
  out.flags = await q(`SELECT c, indus_one.comp_off_sunday_pod_only_employee(c) AS sun,
                              indus_one.comp_off_third_saturday_excluded_employee(c) AS sat
                       FROM unnest(${codesSql}) c ORDER BY c`);
  out.earningDay = await q(`SELECT d::date::text AS d, c, p, indus_one.comp_off_is_earning_day(d::date, p, c) AS v
                            FROM generate_series('2026-08-01'::date, '2027-02-28'::date, '1 day') d,
                                 unnest(${codesSql}) c, unnest(ARRAY[NULL,'WO','NH/PH','P']::text[]) p
                            ORDER BY 1, 2, 3`);
  out.ruleValue = await q(
    `SELECT k, dept, d::date::text AS d, public.admin_rule_value(k, dept, d::date) AS v
     FROM unnest($1::text[]) k, unnest($2::text[]) dept, generate_series('2026-08-01'::date, '2027-03-01'::date, '7 days') d
     ORDER BY 1, 2 NULLS FIRST, 3`,
    [WIRED, [null, ...DEPTS]]
  );
  if (withCredits) {
    await db.exec("BEGIN");
    for (const d of isoDays("2026-08-01", "2026-12-31")) {
      for (const c of CODES) {
        for (const m of ["P", "P(OD)", "HD", "A", "WO"]) {
          for (const p of [null, "WO"]) {
            await db.query(`SELECT indus_one.comp_off_try_earn_credit($1, $2::date, NULL, $3, $4)`, [c, d, m, p]);
          }
        }
      }
    }
    out.credits = await q(`SELECT employee_code, earned_date::text, source_type, source_key, credit_amount::text,
                                  expiry_date::text, status FROM indus_one.comp_off_credits ORDER BY 1, 2`);
    await db.exec("ROLLBACK");
  }
  return out;
}

function compareSnapshots(label, a, b) {
  for (const key of Object.keys(a)) {
    const same = JSON.stringify(a[key]) === JSON.stringify(b[key]);
    if (!same) {
      const i = a[key].findIndex((r, n) => JSON.stringify(r) !== JSON.stringify(b[key][n]));
      console.log(`   first difference in ${key}:`, a[key][i], "vs", b[key][i]);
    }
    check(`${label}: ${key} identical (${a[key].length} results)`, same, true);
  }
}

// ---------------------------------------------------------------------------
section("1. Equivalence before / after the Phase 1 migration");
const db = await buildEngineDb();
await db.exec(readMigration(CONSOLE_MIGRATION));
await db.exec(HISTORY_SQL);
const historyBefore = (await db.query(
  `SELECT id, rule_key, department_key AS scope_id, value, previous_value AS old_value, effective_from::text, reason
   FROM public.admin_attendance_rule_values ORDER BY id`
)).rows;
const before = await engineSnapshot(db);
await db.exec(readMigration(SCOPES_MIGRATION));
// Groups that exist before the priority migration keep creation order (newest highest).
await db.exec(`
  INSERT INTO public.admin_rule_groups (id, name, created_at) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', 'Backfill old', '2026-01-01 10:00+00'),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'Backfill new', '2026-02-01 10:00+00');
`);
await db.exec(readMigration(PRIORITY_MIGRATION));
check("existing groups get priorities in creation order",
  (await db.query(`SELECT name, priority FROM public.admin_rule_groups WHERE name LIKE 'Backfill%' ORDER BY priority DESC`)).rows,
  [{ name: "Backfill new", priority: 20 }, { name: "Backfill old", priority: 10 }]);
await db.exec(`UPDATE public.admin_rule_groups SET is_active = false WHERE name LIKE 'Backfill%'`);
const after = await engineSnapshot(db);
compareSnapshots("engine", before, after);

// ---------------------------------------------------------------------------
section("2. Existing history carried over");
const historyAfter = (await db.query(
  `SELECT id, rule_key, scope_id, value, old_value, effective_from::text, reason
   FROM public.admin_attendance_rule_values WHERE id <= $1 ORDER BY id`,
  [historyBefore.at(-1).id]
)).rows;
check("every existing row kept with the same values", historyAfter, historyBefore);
check("scope types backfilled",
  (await db.query(`SELECT count(*)::int AS n FROM public.admin_attendance_rule_values
                   WHERE (scope_type = 'department') <> (scope_id IS NOT NULL) OR status <> 'active'`)).rows[0].n, 0);
const ruleCount = (await db.query(`SELECT count(*)::int AS n FROM public.admin_attendance_rules`)).rows[0].n;
const companyCount = (await db.query(
  `SELECT count(DISTINCT rule_key)::int AS n FROM public.admin_attendance_rule_values WHERE scope_type = 'company'`
)).rows[0].n;
check("every rule has a company value", companyCount, ruleCount);
check("seed company values equal the built-in default",
  (await db.query(`SELECT count(*)::int AS n FROM public.admin_attendance_rule_values v JOIN public.admin_attendance_rules r USING (rule_key)
                   WHERE v.reason = 'Existing rule at setup' AND v.scope_type = 'company' AND v.value <> r.default_value`)).rows[0].n, 0);
check("only the five original rules are wired",
  (await db.query(`SELECT array_agg(rule_key ORDER BY rule_key) AS k FROM public.admin_attendance_rules WHERE is_wired`)).rows[0].k,
  [...WIRED].sort());

// ---------------------------------------------------------------------------
section("3. Resolver: Employee > Group > Department > Company");
const one = async (sql, params) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
const detail = async (code, key, on) => {
  const r = (await db.query(`SELECT value, source_scope, source_label FROM public.get_rule($1, $2, $3::date)`, [code, key, on])).rows[0];
  return [r.value, r.source_scope, r.source_label];
};

await db.exec(`
  INSERT INTO public.admin_rule_groups (id, name, kind, match_departments, created_at, priority) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Managers', 'grade', '{}', '2026-01-01 10:00+00', 100),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'Night shift', 'custom', '{}', '2026-03-01 10:00+00', 50),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'Dahej site', 'custom', '{Dahej-HR}', '2026-02-01 10:00+00', 60),
    ('aaaaaaaa-0000-0000-0000-000000000004', 'Old group', 'custom', '{Finance}', '2026-04-01 10:00+00', 70);
  UPDATE public.admin_rule_groups SET is_active = false WHERE name = 'Old group';
  INSERT INTO public.admin_rule_group_members (group_id, employee_code) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', '101'), ('aaaaaaaa-0000-0000-0000-000000000001', '102'),
    ('aaaaaaaa-0000-0000-0000-000000000001', '111'),
    ('aaaaaaaa-0000-0000-0000-000000000002', '101');
  INSERT INTO public.admin_attendance_rule_values (rule_key, scope_type, scope_id, scope_label, value, effective_from, reason, status) VALUES
    ('co.earn', 'group', 'aaaaaaaa-0000-0000-0000-000000000001', 'Managers', 'false', '2026-01-01', 't', 'active'),
    ('co.earn', 'group', 'aaaaaaaa-0000-0000-0000-000000000002', 'Night shift', 'true', '2026-06-01', 't', 'active'),
    ('co.earn', 'group', 'aaaaaaaa-0000-0000-0000-000000000004', 'Old group', 'false', '2026-01-01', 't', 'active'),
    ('co.earn', 'department', 'dahej-hr', 'Dahej-HR', 'false', '2026-01-01', 't', 'active'),
    ('co.earn', 'employee', '102', 'Hema Rao (102)', 'true', '2026-01-01', 't', 'active'),
    ('co.earn', 'employee', '103', 'Mohan Shah (103)', 'false', '2026-01-01', 't', 'active'),
    ('co.earn', 'employee', '103', 'Mohan Shah (103)', NULL, '2026-09-01', 't', 'active'),
    ('co.earn', 'employee', '109', 'Gita Nair (109)', 'false', '2026-01-01', 't', 'pending'),
    ('co.earn', 'company', NULL, NULL, 'false', '2027-01-01', 'future', 'active'),
    ('co.expiry_mode', 'department', 'finance', 'Finance', '"never"', '2026-01-01', 't', 'active'),
    ('co.expiry_mode', 'employee', '110', 'Manoj Verma (110)', '"never"', '2026-01-01', 't', 'active'),
    ('wo.pattern', 'department', 'dahej-hr', 'Dahej-HR', '"none"', '2026-01-01', 't', 'active');
`);

check("employee beats group and department", await detail("102", "co.earn", "2026-12-01"), [true, "employee", "Hema Rao (102)"]);
check("group beats company", await detail("111", "co.earn", "2026-05-01"), [false, "group", "Managers"]);
check("leading-zero code finds the same employee", await detail("00111", "co.earn", "2026-05-01"), [false, "group", "Managers"]);
check("two groups: higher priority wins (older group, priority 100 > 50)", await detail("101", "co.earn", "2026-06-01"), [false, "group", "Managers"]);
await db.exec(`UPDATE public.admin_rule_groups SET priority = 150 WHERE name = 'Night shift'`);
check("two groups: raising priority changes the winner", await detail("101", "co.earn", "2026-06-01"), [true, "group", "Night shift"]);
check("two groups: only groups with a value on that date compete", await detail("101", "co.earn", "2026-05-31"), [false, "group", "Managers"]);
await db.exec(`UPDATE public.admin_rule_groups SET priority = 50 WHERE name = 'Night shift'`);
const src = (await db.query(`SELECT value, source_scope, source_id FROM public.get_rule('0111', 'co.earn', '2026-05-01')`)).rows[0];
check("get_rule returns value + source level + source id", src, { value: false, source_scope: "group", source_id: "aaaaaaaa-0000-0000-0000-000000000001" });
check("Dahej HR via department-matched group or department: no C/O", await detail("108", "co.earn", "2026-10-01"), [false, "department", "Dahej-HR"]);
check("Dahej HR: no weekly off", await detail("116", "wo.pattern", "2026-10-01"), ["none", "department", "Dahej-HR"]);
check("employee in no group → company", await detail("118", "co.earn", "2026-10-01"), [true, "company", null]);
check("pending change ignored", await detail("109", "co.earn", "2026-10-01"), [true, "company", null]);
check("archived group ignored", await detail("109", "co.earn", "2026-05-01"), [true, "company", null]);
check("inherit row: override in force before", await detail("103", "co.earn", "2026-08-31"), [false, "employee", "Mohan Shah (103)"]);
check("inherit row: back to company after", await detail("103", "co.earn", "2026-09-01"), [true, "company", null]);
check("future company change: day before unchanged", await detail("118", "co.earn", "2026-12-31"), [true, "company", null]);
check("future company change: applies from its date", await detail("118", "co.earn", "2027-01-01"), [false, "company", null]);
check("future company change: employee override still wins", await detail("102", "co.earn", "2027-01-01"), [true, "employee", "Hema Rao (102)"]);
check("expiry never for Finance department", await detail("109", "co.expiry_mode", "2026-10-01"), ["never", "department", "Finance"]);
check("expiry never for one employee", await detail("110", "co.expiry_mode", "2026-10-01"), ["never", "employee", "Manoj Verma (110)"]);
check("expiry months for everyone else", await detail("101", "co.expiry_mode", "2026-10-01"), ["months", "company", null]);
check("unknown employee → company", await detail("9999", "co.earn", "2026-10-01"), [true, "company", null]);
check("unknown rule → no row", await one(`SELECT count(*)::int FROM public.get_rule('101', 'no.such_rule', '2026-10-01')`), 0);
check("get_rule returns the value", await one(`SELECT public.get_rule_value('111', 'co.earn', '2026-05-01')`), false);
check("existing department rule still resolves", await detail("102", "co.third_saturday_earns", "2026-10-17"), [false, "department", "HR"]);

const bulk = (await db.query(
  `SELECT employee_code, on_date::text AS d, value, source_scope FROM public.get_rules_bulk($1, $2, '2026-05-31', '2026-06-01')
   ORDER BY 1, 2`, [["101", "102"], ["co.earn"]]
)).rows;
check("bulk variant matches single lookups", bulk, [
  { employee_code: "101", d: "2026-05-31", value: false, source_scope: "group" },
  { employee_code: "101", d: "2026-06-01", value: false, source_scope: "group" },
  { employee_code: "102", d: "2026-05-31", value: true, source_scope: "employee" },
  { employee_code: "102", d: "2026-06-01", value: true, source_scope: "employee" },
]);
await expectError("bulk range limited", () => db.query(`SELECT * FROM public.get_rules_bulk('{101}', '{co.earn}', '2026-01-01', '2026-06-01')`), /at most 63 days/);

// ---------------------------------------------------------------------------
section("4. SQL ↔ JS parity (get_rule vs resolveRuleDetail)");
{
  const values = (await db.query(`SELECT * FROM public.admin_attendance_rule_values`)).rows.map((r) => ({
    ...r, effective_from: r.effective_from.toISOString().slice(0, 10),
  }));
  await db.exec(`UPDATE public.admin_rule_groups SET priority = 150 WHERE name = 'Night shift'`);
  const groups = (await db.query(`SELECT id, name, created_at, priority, match_departments, is_active FROM public.admin_rule_groups`)).rows
    .map((g) => ({ ...g, created_at: g.created_at.toISOString() }));
  const members = (await db.query(`SELECT group_id, employee_code FROM public.admin_rule_group_members`)).rows;
  const catalogue = Object.fromEntries((await db.query(`SELECT rule_key, default_value FROM public.admin_attendance_rules`)).rows
    .map((r) => [r.rule_key, r.default_value]));
  const snapshot = { values: values.map(rules.normalizeRuleValueRow).filter((r) => r.status === "active"), groups, members };
  const deptOf = new Map(EMPLOYEES.map(([c, , d]) => [rules.ruleEmployeeKey(c), d]));
  const keys = ["co.earn", "co.expiry_mode", "wo.pattern", ...WIRED];
  const dates = ["2025-12-31", "2026-01-01", "2026-05-31", "2026-06-01", "2026-08-31", "2026-09-01", "2026-10-01",
    "2026-10-17", "2026-11-15", "2026-12-01", "2026-12-31", "2027-01-01"];
  const sql = (await db.query(
    `SELECT c, k, d::text AS d, r.value, r.source_scope, r.source_id
     FROM unnest($1::text[]) c, unnest($2::text[]) k, unnest($3::date[]) d,
          LATERAL public.get_rule(c, k, d) r ORDER BY 1, 2, 3`,
    [CODES, keys, dates]
  )).rows;
  let mismatches = 0;
  for (const row of sql) {
    const js = rules.resolveRuleDetail(snapshot, row.k, {
      employeeCode: row.c, department: deptOf.get(rules.ruleEmployeeKey(row.c)) ?? null, onDate: row.d, fallback: catalogue[row.k],
    });
    const a = JSON.stringify([row.value, row.source_scope, row.source_id ?? null]);
    const b = JSON.stringify([js.value, js.sourceScope, js.sourceId ?? null]);
    if (a !== b) {
      mismatches += 1;
      if (mismatches <= 5) console.log("   mismatch", row.c, row.k, row.d, a, b);
    }
  }
  check(`identical for ${sql.length} employee × rule × date lookups`, mismatches, 0);

  let deptMismatch = 0;
  // Before Phase 2A the register reads the 3rd-Saturday rule; fixture wo.pattern rows would switch it to the new reader.
  rules.setRulesSnapshot({ values: values.filter((v) => v.rule_key !== "wo.pattern"), groups, members });
  const satRows = (await db.query(
    `SELECT dept, d::date::text AS d, public.admin_rule_value('wo.third_saturday_off', dept, d::date) AS v
     FROM unnest($1::text[]) dept, generate_series('2026-08-01'::date, '2027-03-01'::date, '1 day') d`, [DEPTS]
  )).rows;
  for (const r of satRows) {
    if (rules.isThirdSaturdayWorkingDepartment(r.dept, r.d) !== (r.v === false)) deptMismatch += 1;
  }
  check(`3rd Saturday weekly off: register helper = database for ${satRows.length} department × day`, deptMismatch, 0);
  rules.resetAttendanceRulesCache();
}

// ---------------------------------------------------------------------------
section("5. Save RPC validations");
const save = (key, scope, id, value, from, reason) =>
  db.query(`SELECT public.admin_rules_save_scoped($1, $2, $3, $4::jsonb, ${from}, $5) AS r`, [key, scope, id, value, reason])
    .then((res) => res.rows[0].r);

await asUser(db, "hr");
await expectError("non-admin blocked", () => save("co.expiry_months", "company", null, "3", "current_date", "policy"), /Only admins/);
await asUser(db, "admin");
await expectError("unwired rule blocked", () => save("co.max_per_day", "company", null, "2", "current_date", "policy"), /cannot be changed here yet/);
await expectError("scope not allowed", () => save("co.expiry_months", "department", "HR", "3", "current_date", "policy"), /cannot be set for a department/);
await expectError("start date in the past", () => save("co.expiry_months", "company", null, "3", "current_date - 1", "policy"), /today or later/);
await expectError("reason required", () => save("co.expiry_months", "company", null, "3", "current_date", "  "), /reason/);
await expectError("above maximum", () => save("co.expiry_months", "company", null, "40", "current_date", "policy"), /between 1 and 24/);
await expectError("whole number", () => save("co.expiry_months", "company", null, "2.5", "current_date", "policy"), /whole number/);
await expectError("wrong type", () => save("co.sunday_pod_only", "company", null, "1", "current_date", "policy"), /Yes or No/);
await expectError("bad date", () => save("co.start_date", "company", null, '"01-10-2026"', "current_date", "policy"), /valid date/);
await expectError("no change", () => save("co.expiry_months", "company", null, "2", "current_date", "policy"), /No change/);
await expectError("company needs a value", () => save("co.expiry_months", "company", null, null, "current_date", "policy"), /needs a value/);
await expectError("reset without override", () => save("co.third_saturday_earns", "department", "Finance", null, "current_date", "policy"), /Nothing to reset/);
await expectError("unknown scope", () => save("co.third_saturday_earns", "site", "x", "true", "current_date", "policy"), /Choose who/);
check("reset with an override works", (await save("co.third_saturday_earns", "department", "HR", null, "current_date", "Back to default")).status, "active");
check("department save stores normalised id and label",
  (await db.query(`SELECT scope_id, scope_label, old_value FROM public.admin_attendance_rule_values ORDER BY id DESC LIMIT 1`)).rows[0],
  { scope_id: "hr", scope_label: "HR", old_value: false });
const legacy = (await db.query(`SELECT * FROM public.admin_rules_save('co.sunday_pod_only', 'Finance', 'true', current_date + 3, 'legacy path')`)).rows[0];
check("legacy save signature still works", [legacy.scope_type, legacy.scope_id, legacy.value, legacy.status], ["department", "finance", true, "active"]);

// Test-only: open co.earn to every scope to exercise group / employee saves.
await db.exec(`UPDATE public.admin_attendance_rules SET is_wired = true WHERE rule_key = 'co.earn'`);
await expectError("employee must exist", () => save("co.earn", "employee", "9999", "false", "current_date", "policy"), /Employee Master/);
const emp = await save("co.earn", "employee", "00118", "false", "current_date", "Arjun opted out");
check("employee save: id normalised, label from master",
  (await db.query(`SELECT scope_id, scope_label FROM public.admin_attendance_rule_values WHERE id = $1`, [emp.id])).rows[0],
  { scope_id: "118", scope_label: "Arjun Rana (118)" });
await expectError("archived group blocked", () => save("co.earn", "group", "aaaaaaaa-0000-0000-0000-000000000004", "true", "current_date", "x y z"), /active group/);
await expectError("no change vs own group value", () => save("co.earn", "group", "aaaaaaaa-0000-0000-0000-000000000001", "false", "current_date", "same"), /No change/);

// ---------------------------------------------------------------------------
section("6. Approvals (off by default)");
check("approval off by default", await one(`SELECT require_approval FROM public.admin_rules_settings`), false);
await expectError("admin cannot switch approvals", () => db.query(`SELECT public.admin_rules_set_approval(true, 'turn on')`), /Super Admins/);
await asUser(db, "superAdmin");
check("super admin switches approvals on", await one(`SELECT public.admin_rules_set_approval(true, 'Two-person rule')`), true);
await asUser(db, "admin");
const pending = await save("co.earn", "employee", "105", "false", "current_date", "Farhan opts out");
check("save is pending when approvals are on", pending.status, "pending");
check("pending change does not apply", await one(`SELECT public.get_rule_value('105', 'co.earn', current_date)`), true);
await expectError("one pending change per scope", () => save("co.earn", "employee", "105", "false", "current_date + 1", "again"), /already waiting/);
await expectError("cannot approve own change", () => db.query(`SELECT public.admin_rules_review($1, true, 'ok')`, [pending.id]), /Someone else/);
await asUser(db, "admin2");
const review = await one(`SELECT public.admin_rules_review($1, true, 'Approved')`, [pending.id]);
check("approver applies the change", review.decision, "approved");
check("approved value in force", await one(`SELECT public.get_rule_value('105', 'co.earn', current_date)`), false);
check("applied row links the request",
  (await db.query(`SELECT status, request_id, created_by_name FROM public.admin_attendance_rule_values WHERE id = $1`, [review.applied_value_id])).rows[0],
  { status: "active", request_id: pending.id, created_by_name: "Asha Admin" });
await expectError("cannot decide twice", () => db.query(`SELECT public.admin_rules_review($1, false, 'no')`, [pending.id]), /not found|already decided/);
await asUser(db, "admin");
const rejected = await save("co.earn", "employee", "105", null, "current_date", "Undo");
await asUser(db, "admin2");
check("reject", (await one(`SELECT public.admin_rules_review($1, false, 'Keep it')`, [rejected.id])).decision, "rejected");
check("rejected change not applied", await one(`SELECT public.get_rule_value('105', 'co.earn', current_date)`), false);
await asUser(db, "superAdmin");
await db.query(`SELECT public.admin_rules_set_approval(false, 'Back to direct saves')`);
check("approval switches logged", await one(`SELECT count(*)::int FROM public.admin_rules_events WHERE event_type = 'approval_setting'`), 2);

// ---------------------------------------------------------------------------
section("7. Groups");
await asUser(db, "admin");
const gid = await one(`SELECT public.admin_rule_group_save(NULL, 'Supervisors', 'grade', 'Shift supervisors', '{Production, production }', 'new grade')`);
check("group created with de-duplicated departments", await one(`SELECT match_departments FROM public.admin_rule_groups WHERE id = $1`, [gid]), ["Production"]);
await expectError("duplicate active name", () => db.query(`SELECT public.admin_rule_group_save(NULL, ' supervisors ', 'custom', '', '{}', 'dup')`), /already exists/);
check("new group goes on top (highest priority + 10)", await one(`SELECT priority FROM public.admin_rule_groups WHERE id = $1`, [gid]), 160);
await expectError("priority must be unique", () => db.query(`SELECT public.admin_rule_group_save($1, 'Supervisors', 'grade', '', '{Production}', 'reorder', 100)`, [gid]), /Priority 100 is already used by "Managers"/);
await expectError("priority range", () => db.query(`SELECT public.admin_rule_group_save($1, 'Supervisors', 'grade', '', '{Production}', 'reorder', 0)`, [gid]), /between 1 and 100000/);
await db.query(`SELECT public.admin_rule_group_save($1, 'Supervisors', 'grade', 'Shift supervisors', '{Production}', 'reorder', 300)`, [gid]);
check("priority edited and logged",
  [await one(`SELECT priority FROM public.admin_rule_groups WHERE id = $1`, [gid]),
   await one(`SELECT (details ->> 'priority')::int FROM public.admin_rules_events WHERE target_id = $1 ORDER BY id DESC LIMIT 1`, [String(gid)])],
  [300, 300]);
check("editing without a priority keeps it",
  await db.query(`SELECT public.admin_rule_group_save($1, 'Supervisors', 'grade', 'Shift supervisors', '{Production, production }', 'rename')`, [gid])
    .then(() => one(`SELECT priority FROM public.admin_rule_groups WHERE id = $1`, [gid])), 300);
await expectError("unknown member", () => db.query(`SELECT public.admin_rule_group_set_members($1, '{105,8888}', '{}', 'add')`, [gid]), /Not in Employee Master: 8888/);
check("members added", await one(`SELECT public.admin_rule_group_set_members($1, '{105,00106}', '{}', 'add two')`, [gid]), 2);
check("members removed", await one(`SELECT public.admin_rule_group_set_members($1, '{}', '{106}', 'remove one')`, [gid]), 1);
await save("co.earn", "group", gid, "false", "current_date", "Supervisors do not earn");
check("department-matched member gets the group value", await one(`SELECT public.get_rule_value('112', 'co.earn', current_date)`), false);
await expectError("archive blocked while the group has a value", () => db.query(`SELECT public.admin_rule_group_archive($1, 'close')`, [gid]), /Inherit/);
await save("co.earn", "group", gid, null, "current_date", "Remove before archive");
await db.query(`SELECT public.admin_rule_group_archive($1, 'close')`, [gid]);
check("archived group no longer applies", await one(`SELECT public.get_rule_value('112', 'co.earn', current_date)`), true);
check("group changes logged", await one(`SELECT count(*)::int FROM public.admin_rules_events WHERE target_id = $1`, [gid]), 6);

// ---------------------------------------------------------------------------
section("8. Append-only history and access");
for (const [table, column] of [
  ["admin_attendance_rule_values", "reason"], ["admin_attendance_rule_reviews", "note"], ["admin_rules_events", "reason"],
]) {
  await expectError(`${table}: update blocked`, () => db.exec(`UPDATE public.${table} SET ${column} = ${column}`), /append-only/);
  await expectError(`${table}: delete blocked`, () => db.exec(`DELETE FROM public.${table}`), /append-only/);
}
await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT ON public.admin_ifsp_employee_master TO authenticated; SET ROLE authenticated;`);
check("signed-in users read groups", (await one(`SELECT count(*)::int FROM public.admin_rule_groups`)) > 0, true);
check("signed-in users call get_rule", await one(`SELECT public.get_rule_value('111', 'co.earn', '2026-05-01')`), false);
await expectError("direct insert blocked", () => db.exec(`INSERT INTO public.admin_rule_groups (name) VALUES ('x')`), /permission denied/);
await db.exec(`RESET ROLE`);
await expectError("anon cannot save", () => db.exec(`GRANT USAGE ON SCHEMA public TO anon; SET ROLE anon; SELECT public.admin_rules_save_scoped('co.expiry_months','company',NULL,'3',current_date,'x y z')`), /permission denied/);
await db.exec(`RESET ROLE`);
await db.close();

// ---------------------------------------------------------------------------
section("9. Rollback");
{
  const rb = await buildEngineDb();
  await rb.exec(readMigration(CONSOLE_MIGRATION));
  await rb.exec(HISTORY_SQL);
  const shape = async () => (await rb.query(
    `SELECT table_name, string_agg(column_name, ',' ORDER BY column_name) AS cols FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name IN ('admin_attendance_rules', 'admin_attendance_rule_values') GROUP BY 1 ORDER BY 1`
  )).rows;
  const rowsOf = async () => (await rb.query(
    `SELECT id, rule_key, department, department_key, value, previous_value, effective_from::text FROM public.admin_attendance_rule_values ORDER BY id`
  )).rows;
  const shapeA = await shape();
  const rowsA = await rowsOf();
  const a = await engineSnapshot(rb, { withCredits: false });
  const regression = async () => (await rb.exec(REGRESSION_SQL)).find((r) => r.rows.length).rows;
  const regA = await regression();

  await rb.exec(readMigration(SCOPES_MIGRATION));
  await rb.exec(readMigration(PRIORITY_MIGRATION));
  check(`regression.sql identical after migration (${regA.length} sections)`, await regression(), regA);
  await asUser(rb, "admin");
  await rb.exec(`UPDATE public.admin_attendance_rules SET is_wired = true WHERE rule_key = 'co.earn'`);
  await rb.query(`SELECT public.admin_rule_group_save(NULL, 'Temp', 'custom', '', '{}', 'temp')`);
  await rb.query(`SELECT public.admin_rules_save_scoped('co.earn', 'employee', '101', 'false', current_date, 'temp')`);
  await rb.exec(`UPDATE public.admin_attendance_rules SET is_wired = false WHERE rule_key = 'co.earn'`);
  await asUser(rb, null);

  await rb.exec(readRollback(PRIORITY_ROLLBACK));
  check("priority rollback restores the Phase 1 resolver",
    (await rb.query(`SELECT to_regprocedure('public.get_rule_detail(text,text,date)') IS NOT NULL AS ok`)).rows[0].ok, true);
  await rb.exec(readRollback(SCOPES_ROLLBACK));
  check("table columns restored", await shape(), shapeA);
  const rowsC = (await rowsOf()).filter((r) => !(r.department == null && r.effective_from === "2000-01-01" && !rowsA.some((x) => x.id === r.id)));
  check("original history rows restored", rowsC, rowsA);
  compareSnapshots("after rollback", a, await engineSnapshot(rb, { withCredits: false }));
  check("regression.sql identical after rollback", await regression(), regA);
  check("new tables removed", (await rb.query(`SELECT to_regclass('public.admin_rule_groups') IS NULL AS gone`)).rows[0].gone, true);
  await asUser(rb, "admin");
  const r = (await rb.query(`SELECT department_key FROM public.admin_rules_save('co.expiry_months', NULL, '4', current_date, 'after rollback')`)).rows[0];
  check("old save works after rollback", r.department_key, null);
  await asUser(rb, null);
  await rb.exec(readMigration(SCOPES_MIGRATION));
  await rb.exec(readMigration(PRIORITY_MIGRATION));
  check("migrations re-apply after rollback", await rb.query(`SELECT 1`).then(() => true), true);
  await rb.close();
}

process.exit(done() ? 1 : 0);

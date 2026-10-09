/**
 * Rules Console — Phase 2A checks (weekly off reads from rules).
 *
 *   npm run rules:check:2a      (vite-node: the register code uses Vite-style imports)
 *
 * 1. Equivalence before / after 20261008140000 with realistic dated history:
 *    C/O engine (earning day, flags, expiry, credit simulation), regression.sql
 *    (previous + current month), and the register code — weekly off per
 *    employee × day, grid, monthly totals, paid 3rd Saturday, WO / NH-PH sync.
 * 2. SQL ↔ JS parity: admin_rule_is_weekly_off() vs isWeeklyOffDay().
 * 3. Wiring (20261008140100) only after every diff above is empty.
 * 4. Dahej HR synthetic month (30 days working): punch, leave and tour on Sundays,
 *    holiday on a Sunday, holidays switched off for one employee.
 * 5. Other employees unchanged by the Dahej rules; mixed patterns parity.
 * 6. Rollback restores identical results.
 */
import {
  buildEngineDb, readMigration, readRollback, asUser, createReporter, isoDays, EMPLOYEES, ROOT,
  CONSOLE_MIGRATION, SCOPES_MIGRATION, PRIORITY_MIGRATION,
  WEEKLY_OFF_MIGRATION, WEEKLY_OFF_WIRE_MIGRATION, WEEKLY_OFF_ROLLBACK, WEEKLY_OFF_WIRE_ROLLBACK,
  WEEKLY_OFF_SPEED_MIGRATION, WEEKLY_OFF_SPEED_ROLLBACK,
} from "./harness.mjs";
import { readFileSync } from "node:fs";
import * as rules from "../../src/lib/attendanceRules.js";
import * as reg from "../../src/lib/attendanceDaily.js";
import { normalizeRule, isRuleVisible } from "../../src/pages/adminOperations/rulesConsole/rulesApi.js";

const { check, expectError, section, done } = createReporter();
const REGRESSION_SQL = readFileSync(`${ROOT}/scripts/rulesConsole/regression.sql`, "utf8");
const CODES = EMPLOYEES.map((e) => e[0]).concat(["9999", "", "00101"]);
const DEPTS = [...new Set(EMPLOYEES.map((e) => e[2]))].concat(["Dahej HR", "r&m", "R & M", "Other", "Maintenance - FTC"]);
const DAHEJ = new Set(["108", "116"]);
const MONTHS = [[2026, 9], [2026, 10], [2026, 11], [2026, 12]];
const WO_KEYS = ["wo.pattern", "wo.custom_days", "wo.auto", "wo.auto_holiday"];

/** 3rd-Saturday history as production may hold it: dated changes on both schemas. */
const LEGACY_HISTORY = `
INSERT INTO public.admin_attendance_rule_values
  (rule_key, department, department_key, value, previous_value, effective_from, reason, created_by_name) VALUES
  ('wo.third_saturday_off', 'Maintenance-FTC', 'maintenance-ftc', 'true', 'false', '2026-11-15', 'Maint off', 'Asha Admin'),
  ('wo.third_saturday_off', 'Finance', 'finance', 'false', 'true', '2026-09-10', 'Finance works', 'Asha Admin'),
  ('co.third_saturday_earns', 'M&M', 'm&m', 'false', 'true', '2026-12-01', 'M&M stops', 'Asha Admin');
`;
const SCOPED_HISTORY = `
INSERT INTO public.admin_attendance_rule_values
  (rule_key, scope_type, scope_id, scope_label, value, old_value, effective_from, reason, status) VALUES
  ('wo.third_saturday_off', 'department', 'finance', 'Finance', NULL, 'false', '2026-12-01', 'Back to default', 'active'),
  ('wo.third_saturday_off', 'department', 'administration', 'Administration', 'false', 'true', '2026-10-15', 'Admin works', 'active'),
  ('wo.third_saturday_off', 'department', 'hr', 'HR', 'false', 'true', '2027-01-01', 'Pending HR', 'pending');
`;

// ---------------------------------------------------------------------------
// Fake Supabase client: rule tables come from the in-memory database, the
// attendance register lives in memory and every write is logged.
// ---------------------------------------------------------------------------
function fakeSupabase(db, register) {
  const fix = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [
    k, v instanceof Date ? (k === "effective_from" ? v.toISOString().slice(0, 10) : v.toISOString()) : v,
  ]));
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.op = "select"; }
    select() { return this; }
    in(col, values) { const set = new Set(values.map(String)); this.filters.push((r) => set.has(String(r[col]))); return this; }
    eq(col, value) { this.filters.push((r) => String(r[col]) === String(value)); return this; }
    upsert(rows) { this.op = "upsert"; this.rows = rows; return this; }
    delete() { this.op = "delete"; return this; }
    async run() {
      if (this.table.startsWith("admin_attendance_rule") || this.table.startsWith("admin_rule_")) {
        return { data: (await db.query(`SELECT * FROM public.${this.table}`)).rows.map(fix), error: null };
      }
      if (this.table !== reg.ATTENDANCE_REGISTER_TABLE) throw new Error(`unexpected table ${this.table}`);
      const match = (r) => this.filters.every((f) => f(r));
      if (this.op === "select") return { data: register.rows.filter(match), error: null };
      if (this.op === "delete") {
        for (const r of register.rows.filter(match)) register.log.push(`del ${r.employee_code} ${r.register_date} ${r.mark}`);
        register.rows = register.rows.filter((r) => !match(r));
        return { data: null, error: null };
      }
      for (const row of this.rows) {
        register.rows = register.rows.filter((r) => !(r.employee_code === row.employee_code && r.register_date === row.register_date));
        register.rows.push({ ...row });
        register.log.push(`set ${row.employee_code} ${row.register_date} ${row.mark}`);
      }
      return { data: null, error: null };
    }
    then(ok, fail) { return this.run().then(ok, fail); }
  }
  return { from: (table) => new Query(table) };
}

const loadRules = (db) => rules.ensureAttendanceRulesLoaded(fakeSupabase(db, { rows: [], log: [] }), { force: true });

// Deterministic register content per employee × day.
function cellFor(code, iso) {
  let h = 0;
  for (const ch of `${code}|${iso}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [
    null, null, { punch: true }, { punch: true }, { punch: true },
    { mark: "WO", source: "auto_wo" }, { mark: "WO", source: "" }, { mark: "WO", source: "manual" },
    { mark: "PL", source: "leave" }, { mark: "CL", source: "leave" }, { mark: "T", source: "tour" },
    { mark: "P(OD)", source: "tour" }, { mark: "NH/PH", source: "auto_holiday" }, { mark: "HD", source: "manual" },
    { mark: "WO", source: "auto_wo", punch: true }, { mark: "A", source: "manual" },
  ][h % 16];
}

function monthData(year, month, cell = cellFor) {
  const monthKey = reg.monthKeyFromParts(year, month);
  const dim = reg.daysInCalendarMonth(year, month);
  const punches = [];
  const manualMarks = {};
  const markSources = {};
  const registerRows = [];
  for (const [rawCode, , dept] of EMPLOYEES) {
    const code = reg.normalizeAttendanceEmpCode(rawCode);
    for (let day = 1; day <= dim; day += 1) {
      const iso = reg.registerDateFromDay(monthKey, day);
      const c = cell(code, iso, dept);
      if (!c) continue;
      if (c.punch) punches.push({ empCode: code, punchDate: iso });
      if (c.mark) {
        (manualMarks[code] ||= {})[day] = c.mark;
        (markSources[code] ||= {})[day] = c.source;
        registerRows.push({ employee_code: code, register_date: iso, mark: c.mark, mark_source: c.source || null, mark_remark: null });
      } else if (c.punch) {
        registerRows.push({ employee_code: code, register_date: iso, mark: "P", mark_source: "punch", mark_remark: null });
      }
    }
  }
  return { monthKey, dim, punches, manualMarks, markSources, registerRows };
}

const employees = EMPLOYEES.map(([empCode, employeeName, department]) => ({ empCode, employeeName, department, employeeId: empCode }));
const departmentByCode = Object.fromEntries(EMPLOYEES.map(([c, , d]) => [reg.normalizeAttendanceEmpCode(c), d ?? ""]));

async function runSync(db, year, month, registerRows, holidayDates) {
  const register = { rows: registerRows.map((r) => ({ ...r })), log: [] };
  const sb = fakeSupabase(db, register);
  // Rows for an employee outside the sync so the cached rows cover the whole span.
  const span = reg.listAutoWeekoffDatesForMonthAndNext({ year, month });
  const sentinel = [span[0], span.at(-1), ...holidayDates].map((d) => ({ employee_code: "999999", register_date: d, mark: "A", mark_source: "manual" }));
  const codes = Object.keys(departmentByCode);
  const wo = await reg.syncRegisterAutoWeekoffMarks(sb, codes, span, null, {
    departmentByCode, existingRegisterRows: [...register.rows, ...sentinel],
  });
  const hol = await reg.syncRegisterAutoHolidayMarks(sb, codes, holidayDates, null, {
    departmentByCode, existingRegisterRows: [...register.rows, ...sentinel],
  });
  return { wo, hol, log: register.log.sort(), rows: register.rows };
}

/** Everything the register code decides, keyed so one employee can be filtered out. */
async function jsSnapshot(db, holidayDates) {
  await loadRules(db);
  const out = { day: [], dept: [], candidates: [], grid: [], sync: [] };
  for (const [rawCode, , dept] of EMPLOYEES) {
    const code = reg.normalizeAttendanceEmpCode(rawCode);
    let s = "";
    for (const iso of isoDays("2026-08-01", "2027-02-28")) {
      const [y, m, d] = iso.split("-").map(Number);
      const ctx = { year: y, month: m, day: d, department: dept, employeeCode: code };
      s += [
        reg.isWeeklyOffDate(iso, dept, code), reg.isAutoWeekoffDate(iso, dept, code),
        rules.isAutoHolidayFor(iso, { employeeCode: code, department: dept }),
        reg.isPaidThirdSaturdayWeekoffCell("WO", ctx), reg.registerPresentDayCreditForCell("PL", ctx),
      ].map(Number).join("");
    }
    out.day.push({ code, s });
  }
  for (const dept of DEPTS) {
    out.dept.push({ dept, s: isoDays("2026-08-01", "2027-02-28").filter(rules.isThirdSaturdayIso)
      .map((iso) => Number(reg.isThirdSaturdayWeekoffExcludedDepartment(dept, iso))).join("") });
  }
  for (const [y, m] of MONTHS) {
    out.candidates.push({ m: `${y}-${m}`, s: reg.listAutoWeekoffDatesForMonthAndNext({ year: y, month: m }).join(",") });
    const md = monthData(y, m);
    const grid = reg.buildMonthlyRegisterGrid(md.punches, employees, { year: y, month: m, manualMarks: md.manualMarks, markSources: md.markSources });
    const withSummary = reg.attachRegisterRowSummaries(grid.rows, md.manualMarks, grid.daysInMonth, { year: y, month: m, holidayDates: new Set(holidayDates) });
    for (const row of withSummary) {
      out.grid.push({ code: row.empCode, m: `${y}-${m}`, marks: Object.values(row.dayMarks).join(","), summary: row.summary });
    }
    const monthHolidays = holidayDates.filter((d) => d.startsWith(md.monthKey));
    const sync = await runSync(db, y, m, md.registerRows, monthHolidays);
    for (const line of sync.log) out.sync.push({ code: line.split(" ")[1], m: `${y}-${m}`, line });
  }
  return out;
}

async function engineSnapshot(db, { withCredits = true } = {}) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const out = {};
  out.cutoff = await q(`SELECT indus_one.comp_off_cutoff_date()::text AS v`);
  out.expiry = await q(`SELECT d::date::text AS d, indus_one.comp_off_expiry_for_earned(d::date)::text AS v
                        FROM generate_series('2026-08-01'::date, '2027-02-28'::date, '1 day') d`);
  out.flags = await q(`SELECT c AS code, indus_one.comp_off_sunday_pod_only_employee(c) AS sun,
                              indus_one.comp_off_third_saturday_excluded_employee(c) AS sat
                       FROM unnest($1::text[]) c ORDER BY c`, [CODES]);
  out.earningDay = await q(`SELECT c AS code, string_agg(coalesce(indus_one.comp_off_is_earning_day(d::date, p, c)::int::text, '-'), '' ORDER BY d, p NULLS FIRST) AS s
                            FROM generate_series('2026-08-01'::date, '2027-02-28'::date, '1 day') d,
                                 unnest($1::text[]) c, unnest(ARRAY[NULL,'WO','NH/PH','P']::text[]) p
                            GROUP BY c ORDER BY c`, [CODES]);
  if (withCredits) {
    await db.exec("BEGIN");
    for (const d of isoDays("2026-09-01", "2026-12-31")) {
      for (const c of CODES) {
        for (const m of ["P", "P(OD)", "HD", "A"]) {
          await db.query(`SELECT indus_one.comp_off_try_earn_credit($1, $2::date, NULL, $3, NULL)`, [c, d, m]);
        }
      }
    }
    out.credits = await q(`SELECT employee_code AS code, string_agg(earned_date::text || ':' || source_type || ':' || expiry_date::text || ':' || status, ',' ORDER BY earned_date) AS s
                           FROM indus_one.comp_off_credits GROUP BY 1 ORDER BY 1`);
    await db.exec("ROLLBACK");
  }
  return out;
}

const regression = async (db) => (await db.exec(REGRESSION_SQL)).find((r) => r.rows.length).rows;

function compare(label, a, b, { skip = () => false } = {}) {
  let allSame = true;
  for (const key of Object.keys(a)) {
    const left = a[key].filter((r) => !skip(r));
    const right = (b[key] || []).filter((r) => !skip(r));
    const same = JSON.stringify(left) === JSON.stringify(right);
    if (!same) {
      allSame = false;
      const i = left.findIndex((r, n) => JSON.stringify(r) !== JSON.stringify(right[n]));
      console.log(`   first difference in ${key}:`, JSON.stringify(left[i])?.slice(0, 300), "vs", JSON.stringify(right[i])?.slice(0, 300));
    }
    check(`${label}: ${key} identical (${left.length} results)`, same, true);
  }
  return allSame;
}

// ---------------------------------------------------------------------------
section("1. Equivalence before / after the Phase 2A migration");
const db = await buildEngineDb();
await db.exec(readMigration(CONSOLE_MIGRATION));
await db.exec(LEGACY_HISTORY);
await db.exec(readMigration(SCOPES_MIGRATION));
await db.exec(readMigration(PRIORITY_MIGRATION));
await db.exec(SCOPED_HISTORY);
const holidayDates = (await db.query(`SELECT holiday_date::text AS d FROM public.admin_national_public_holidays ORDER BY 1`)).rows.map((r) => r.d);

// The register as it behaved before Phase 2A (old rule: Sunday, or 3rd Saturday unless the department works it).
const oracle = (await db.query(
  `SELECT c AS code, string_agg(((extract(dow FROM d) = 0) OR (public.admin_rule_value('wo.third_saturday_off', dept, d::date) IS DISTINCT FROM 'false'::jsonb
            AND dept IS NOT NULL AND extract(dow FROM d) = 6 AND extract(day FROM d) BETWEEN 15 AND 21)
            OR (dept IS NULL AND extract(dow FROM d) = 6 AND extract(day FROM d) BETWEEN 15 AND 21))::int::text, '' ORDER BY d) AS s
   FROM (SELECT public.normalize_attendance_employee_code(employee_code) AS c, department AS dept FROM public.admin_ifsp_employee_master) e,
        generate_series('2026-08-01'::date, '2027-02-28'::date, '1 day') d
   GROUP BY c ORDER BY c`
)).rows;

const engineBefore = await engineSnapshot(db);
const regBefore = await regression(db);
const jsBefore = await jsSnapshot(db, holidayDates);
check("register before Phase 2A = old weekly-off rule (every employee × day)",
  jsBefore.day.map((r) => ({ code: r.code, s: r.s.replace(/(.)..../g, "$1") })).sort((a, b) => a.code.localeCompare(b.code)),
  oracle.sort((a, b) => a.code.localeCompare(b.code)));

await db.exec(readMigration(WEEKLY_OFF_MIGRATION));
await db.exec(readMigration(WEEKLY_OFF_SPEED_MIGRATION));
const engineAfter = await engineSnapshot(db);
const regAfter = await regression(db);
const jsAfter = await jsSnapshot(db, holidayDates);
let clean = compare("C/O engine", engineBefore, engineAfter);
check(`regression.sql identical — previous + current month (${regBefore.length} sections)`, regAfter, regBefore);
clean = JSON.stringify(regAfter) === JSON.stringify(regBefore) && clean;
clean = compare("register", jsBefore, jsAfter) && clean;
const woCheck = (await db.exec(readFileSync(`${ROOT}/scripts/rulesConsole/regression-weekly-off.sql`, "utf8"))).find((r) => r.rows.length).rows;
check("regression-weekly-off.sql: no differences (old rule vs new rule, holidays apply to all)",
  woCheck.map((r) => [r.check_name, Number(r.differences)]),
  [["Weekly off: old rule vs new rule", 0], ["Holidays apply to everyone", 0]]);
clean = woCheck.every((r) => Number(r.differences) === 0) && clean;
check("the register now reads the weekly-off pattern", rules.weeklyOffPattern({ department: "Production", onDate: "2026-10-17" }), "sun_only");

const patternRows = (await db.query(
  `SELECT scope_type, scope_id, value, effective_from::text AS f FROM public.admin_attendance_rule_values
   WHERE rule_key = 'wo.pattern' AND reason LIKE 'Carried over%' ORDER BY id`)).rows;
const legacyRows = (await db.query(
  `SELECT scope_type, scope_id, CASE WHEN value IS NULL THEN NULL WHEN value = 'false' THEN '"sun_only"'::jsonb ELSE '"sun_3rd_sat"'::jsonb END AS value,
          effective_from::text AS f FROM public.admin_attendance_rule_values
   WHERE rule_key = 'wo.third_saturday_off' AND status = 'active' ORDER BY id`)).rows;
check(`weekly-off pattern carried over row by row (${legacyRows.length} rows, same levels and dates)`, patternRows, legacyRows);
check("the six departments that work the 3rd Saturday get \"Sunday only\"",
  (await db.query(`SELECT string_agg(scope_label, ', ' ORDER BY scope_label) AS d FROM public.admin_attendance_rule_values
                   WHERE rule_key = 'wo.pattern' AND value = '"sun_only"' AND effective_from = '2000-01-01'`)).rows[0].d,
  "M&M, Maintenance-FTC, Production, Production - Neotech, Production-FTC, R&M");
await db.exec(readMigration(WEEKLY_OFF_MIGRATION));
await db.exec(readMigration(WEEKLY_OFF_SPEED_MIGRATION));
check("migration can run twice (no duplicate rows)",
  (await db.query(`SELECT count(*)::int AS n FROM public.admin_attendance_rule_values WHERE rule_key = 'wo.pattern' AND reason LIKE 'Carried over%'`)).rows[0].n,
  legacyRows.length);
check("rules stay hidden / not editable until wired",
  (await db.query(`SELECT rule_key, is_wired FROM public.admin_attendance_rules WHERE rule_key = ANY($1) ORDER BY 1`, [WO_KEYS])).rows.every((r) => !r.is_wired), true);

// ---------------------------------------------------------------------------
section("2. SQL ↔ JS parity");
async function parity(label) {
  await loadRules(db);
  const sql = (await db.query(
    `SELECT c, d::date::text AS d, public.admin_rule_is_weekly_off(c, d::date) AS wo, public.admin_rule_holidays_apply(c, d::date) AS hol
     FROM unnest($1::text[]) c, generate_series('2026-08-01'::date, '2027-02-28'::date, '1 day') d`, [CODES]
  )).rows;
  const deptOf = new Map(EMPLOYEES.map(([c, , d]) => [rules.ruleEmployeeKey(c), d]));
  let bad = 0;
  for (const r of sql) {
    const ctx = { employeeCode: r.c, department: deptOf.get(rules.ruleEmployeeKey(r.c)) ?? null };
    if (rules.isWeeklyOffDay(r.d, ctx) !== r.wo || rules.isAutoHolidayFor(r.d, ctx) !== r.hol) {
      bad += 1;
      if (bad <= 3) console.log("   mismatch", r, rules.isWeeklyOffDay(r.d, ctx), rules.isAutoHolidayFor(r.d, ctx));
    }
  }
  check(`${label}: database = register for ${sql.length} employee × day`, bad, 0);
  return bad === 0;
}
clean = (await parity("weekly off and holidays")) && clean;

// ---------------------------------------------------------------------------
section("3. Wiring");
if (!clean) {
  console.log("Diff not empty — rules NOT wired. Stopping.");
  process.exit(done() ? 1 : 0);
}
await db.exec(readMigration(WEEKLY_OFF_WIRE_MIGRATION));
const catalogue = (await db.query(`SELECT * FROM public.admin_attendance_rules WHERE rule_key LIKE 'wo.%' ORDER BY rule_key`)).rows.map(normalizeRule);
check("wired: the four weekly-off rules",
  catalogue.filter((r) => r.is_wired).map((r) => r.rule_key), ["wo.auto", "wo.auto_holiday", "wo.custom_days", "wo.pattern"]);
check("on the console page: only the auto-WO switch (the rest is in Employee Master)",
  catalogue.filter((r) => r.is_wired && isRuleVisible(r)).map((r) => r.rule_key), ["wo.auto"]);
check("old 3rd-Saturday rule retired and hidden",
  catalogue.filter((r) => r.rule_key === "wo.third_saturday_off").map((r) => [r.is_wired, r.retired, isRuleVisible(r)]), [[false, true, false]]);

await asUser(db, "admin");
const save = (key, scope, id, value, from, reason) =>
  db.query(`SELECT public.admin_rules_save_scoped($1, $2, $3, $4::jsonb, $5::date, $6) AS r`, [key, scope, id, value, from, reason]).then((x) => x.rows[0].r);
await expectError("old rule can no longer be changed", () => save("wo.third_saturday_off", "department", "HR", "false", "2026-11-01", "test"), /cannot be changed here yet/);
await expectError("pattern must be one of the options", () => save("wo.pattern", "company", null, '"weekends"', "2026-11-01", "test"), /./);
await expectError("custom days must be weekdays 0–6", () => save("wo.custom_days", "company", null, "[7]", "2026-11-01", "test"), /./);
await db.exec("BEGIN");
check("the console's save path accepts a pattern for a department",
  (await db.query(`SELECT value FROM public.admin_rules_save('wo.pattern', 'Stores', '"none"', '2026-11-01', 'console save')`)).rows[0].value, "none");
check("the console's save path accepts custom days",
  (await db.query(`SELECT value FROM public.admin_rules_save('wo.custom_days', NULL, '[0,6]', '2026-11-01', 'console save')`)).rows[0].value, [0, 6]);
await db.exec("ROLLBACK");

// ---------------------------------------------------------------------------
section("4. Dahej HR — 30 working days, no weekly off");
const jsBeforeDahej = await jsSnapshot(db, holidayDates);
const engineBeforeDahej = await engineSnapshot(db, { withCredits: false });
check("Dahej-HR set to \"No weekly off\" from 1 Nov",
  (await save("wo.pattern", "department", "Dahej-HR", '"none"', "2026-11-01", "Dahej site works all days")).status, "active");
check("Lata Kapoor (116): holidays do not apply from 1 Nov",
  (await save("wo.auto_holiday", "employee", "116", "false", "2026-11-01", "Site contract")).status, "active");
await loadRules(db);
const woCheckAfterSave = (await db.exec(readFileSync(`${ROOT}/scripts/rulesConsole/regression-weekly-off.sql`, "utf8"))).find((r) => r.rows.length).rows;
check("regression-weekly-off.sql detects a real change (Dahej HR Sundays)",
  woCheckAfterSave.map((r) => Number(r.differences) > 0), [true, true]);

// November 2026: Sundays 1, 8 (PH), 15, 22, 29; 3rd Saturday 21.
const NOV = { 1: "punch", 8: "punch", 15: "tour", 21: "punch", 22: "leave", 29: "staleWo" };
const dahejCell = (code, iso, dept) => {
  if (!iso.startsWith("2026-11")) return cellFor(code, iso, dept);
  const kind = NOV[Number(iso.slice(8))] ?? "punch";
  if (!DAHEJ.has(code) && code !== "102") return cellFor(code, iso, dept);
  if (kind === "punch") return { punch: true };
  if (kind === "tour") return { mark: "T", source: "tour" };
  if (kind === "leave") return { mark: "PL", source: "leave" };
  return { mark: "WO", source: "auto_wo" };
};
const nov = monthData(2026, 11, dahejCell);
const novRows = nov.registerRows.concat([{ employee_code: "116", register_date: "2026-11-08", mark: "NH/PH", mark_source: "auto_holiday", mark_remark: null }])
  .filter((r, i, all) => !(r.employee_code === "116" && r.register_date === "2026-11-08" && r.mark === "P" && all.some((x) => x.employee_code === "116" && x.register_date === "2026-11-08" && x.mark === "NH/PH")));
const sync = await runSync(db, 2026, 11, novRows, ["2026-11-08"]);
const logFor = (code) => sync.log.filter((l) => l.split(" ")[1] === code && l.includes("2026-11"));
check("sync: no WO written for Dahej HR in November", sync.log.filter((l) => DAHEJ.has(l.split(" ")[1]) && l.startsWith("set") && l.endsWith(" WO") && l.includes("2026-11")), []);
check("sync: stale auto WO on Sunday 29 Nov cleared for both", ["108", "116"].map((c) => logFor(c).filter((l) => l.startsWith("del") && l.includes("-29 "))), [["del 108 2026-11-29 WO"], ["del 116 2026-11-29 WO"]]);
check("sync: PH on Sunday 8 Nov marked for 108, cleared for 116 (holidays off)",
  [logFor("108").filter((l) => l.includes("-08 ")), logFor("116").filter((l) => l.includes("-08 "))],
  [["set 108 2026-11-08 NH/PH"], ["del 116 2026-11-08 NH/PH"]]);
const autoWoDays = (code, dept) => isoDays("2026-11-01", "2026-11-30").filter((d) => reg.isAutoWeekoffDate(d, dept, code)).map((d) => Number(d.slice(8)));
check("auto WO days in November: Dahej HR none", [autoWoDays("108", "Dahej-HR"), autoWoDays("116", "Dahej-HR")], [[], []]);
check("auto WO days in November: HR Sundays + 3rd Saturday", autoWoDays("102", "HR"), [1, 8, 15, 21, 22, 29]);
check("auto WO days in November: Production Sundays only", autoWoDays("101", "Production"), [1, 8, 15, 22, 29]);

const after = Object.fromEntries(sync.rows.filter((r) => r.register_date.startsWith("2026-11")).map((r) => [`${r.employee_code}|${r.register_date}`, r]));
const marksFor = (code) => {
  const manual = {}; const sources = {};
  for (const r of Object.values(after)) {
    if (r.employee_code !== code || r.mark_source === "punch") continue;
    const day = Number(r.register_date.slice(8));
    manual[day] = r.mark; sources[day] = r.mark_source;
  }
  return { manual, sources };
};
const gridFor = (code, dept, { withStale = false } = {}) => {
  const { manual, sources } = marksFor(code);
  if (withStale) { manual[29] = "WO"; sources[29] = "auto_wo"; }
  const punches = nov.punches.filter((p) => p.empCode === code);
  const g = reg.buildMonthlyRegisterGrid(punches, [{ empCode: code, employeeName: code, department: dept, employeeId: code }],
    { year: 2026, month: 11, manualMarks: { [code]: manual }, markSources: { [code]: sources } });
  const [row] = reg.attachRegisterRowSummaries(g.rows, { [code]: manual }, g.daysInMonth, { year: 2026, month: 11, holidayDates: new Set(["2026-11-08"]) });
  return row;
};
const g108 = gridFor("108", "Dahej-HR");
const g116 = gridFor("116", "Dahej-HR");
const g102 = gridFor("102", "HR");
const sundays = (row) => [1, 8, 15, 22, 29].map((d) => row.dayMarks[d]);
check("grid 108: Sundays show punch / PH / tour / leave / blank — no WO", sundays(g108), ["P", "NH/PH", "T", "PL", ""]);
check("grid 116: Sunday 8 Nov (PH) shows the punch, holidays off", sundays(g116), ["P", "P", "T", "PL", ""]);
check("grid 108: a stale auto WO is shown blank", gridFor("108", "Dahej-HR", { withStale: true }).dayMarks[29], "");
check("grid 108: 3rd Saturday is a normal working day", g108.dayMarks[21], "P");
check("totals 108: 29 present (Sunday punch + tour + PL + PH count), no weekly off",
  [g108.summary.totalPresent, g108.summary.weekoff, g108.summary.leave, g108.summary.nhph], [29, 0, 1, 1]);
check("totals 116: 29 present (PH day worked counts as present), no NH/PH",
  [g116.summary.totalPresent, g116.summary.weekoff, g116.summary.leave, g116.summary.nhph], [29, 0, 1, 0]);
check("totals HR 102 (Sunday + 3rd Saturday): Sunday work credited as WO, PL on Sunday not counted",
  [g102.summary.totalPresent < g108.summary.totalPresent, g102.summary.leave], [true, 0]);

// C/O for the same month.
await db.exec("BEGIN");
const earn = async (code, day, mark, prior = null) => {
  await db.query(`SELECT indus_one.comp_off_try_earn_credit($1, $2::date, NULL, $3, $4)`, [code, `2026-11-${String(day).padStart(2, "0")}`, mark, prior]);
};
for (const code of ["108", "116", "102", "101", "103", "107"]) {
  for (const day of isoDays("2026-11-01", "2026-11-30").map((d) => Number(d.slice(8)))) {
    const kind = NOV[day] ?? "punch";
    const mark = kind === "tour" ? "P(OD)" : kind === "leave" ? "PL" : "P";
    await earn(code, day, mark);
  }
}
await earn("116", 8, "T");
const credits = async (code) => (await db.query(
  `SELECT string_agg(extract(day FROM earned_date)::int::text, ',' ORDER BY earned_date) AS d FROM indus_one.comp_off_credits WHERE employee_code = $1`, [code]
)).rows[0].d;
check("C/O 108: only the worked PH (8 Nov) earns — Sunday punch, tour, 3rd Saturday do not", await credits("108"), "8");
check("C/O 116: nothing earns (no weekly off, holidays off)", await credits("116"), null);
check("C/O HR 102: Sundays, PH and 3rd Saturday earn as before", await credits("102"), "1,8,15,21,29");
check("C/O Production 101: Sunday punch does not earn, tour (P(OD)) does, 3rd Saturday does not", await credits("101"), "15");
check("C/O M&M 103: worked 3rd Saturday still earns (Sunday only + 3rd Saturday earns)", (await credits("103")).split(",").includes("21"), true);
check("C/O Maintenance-FTC 107: 3rd Saturday is a weekly off from 15 Nov and earns", (await credits("107")).split(",").includes("21"), true);
await earn("108", 29, "P", "WO");
check("C/O 108: a WO entered by Admin before the punch still earns", (await credits("108")), "8,29");
await db.exec("ROLLBACK");

// ---------------------------------------------------------------------------
section("5. Everyone else unchanged; mixed patterns");
const jsAfterDahej = await jsSnapshot(db, holidayDates);
const engineAfterDahej = await engineSnapshot(db, { withCredits: false });
const isDahej = (r) => DAHEJ.has(r.code) || r.dept === "Dahej-HR" || r.dept === "Dahej HR";
compare("other employees — register", jsBeforeDahej, jsAfterDahej, { skip: isDahej });
compare("other employees — C/O engine", engineBeforeDahej, engineAfterDahej, { skip: isDahej });
check("Dahej HR before 1 Nov unchanged (October register)",
  jsAfterDahej.grid.filter((r) => DAHEJ.has(r.code) && r.m !== "2026-11" && r.m !== "2026-12"),
  jsBeforeDahej.grid.filter((r) => DAHEJ.has(r.code) && r.m !== "2026-11" && r.m !== "2026-12"));

const gid = (await db.query(`SELECT public.admin_rule_group_save(NULL, 'Friday off', 'custom', '', '{}', 'test', 500) AS id`)).rows[0].id;
await db.query(`INSERT INTO public.admin_rule_group_members (group_id, employee_code) VALUES ($1, '109')`, [gid]);
await save("wo.pattern", "group", gid, '"custom"', "2026-12-01", "Friday off");
await save("wo.custom_days", "group", gid, "[5]", "2026-12-01", "Friday off");
await save("wo.pattern", "employee", "110", '"sun_only"', "2026-11-15", "Works 3rd Sat");
await save("wo.auto", "department", "Finance", "false", "2026-11-01", "Finance marks WO by hand");
await parity("mixed patterns (group custom days, employee, department, auto off)");
await loadRules(db);
check("custom Friday: weekly off on Fridays from December, register sync visits Fridays",
  [rules.isWeeklyOffDay("2026-12-04", { employeeCode: "109", department: "Finance" }), rules.isWeeklyOffDay("2026-12-06", { employeeCode: "109", department: "Finance" }),
   reg.listAutoWeekoffDatesForMonthAndNext({ year: 2026, month: 12 }).includes("2026-12-04")], [true, false, true]);
check("custom Friday: Friday earns C/O, Sunday does not",
  (await db.query(`SELECT indus_one.comp_off_is_earning_day('2026-12-04', NULL, '109') AS fri, indus_one.comp_off_is_earning_day('2026-12-06', NULL, '109') AS sun`)).rows[0],
  { fri: true, sun: false });
check("Finance with automatic WO off: still a weekly off, but not filled in",
  [reg.isWeeklyOffDate("2026-11-22", "Finance", "118"), reg.isAutoWeekoffDate("2026-11-22", "Finance", "118")], [true, false]);
await asUser(db, null);

// ---------------------------------------------------------------------------
section("6. Rollback");
await db.exec(readRollback(WEEKLY_OFF_WIRE_ROLLBACK));
check("unwired again", (await db.query(`SELECT bool_or(is_wired) AS any FROM public.admin_attendance_rules WHERE rule_key = ANY($1)`, [WO_KEYS])).rows[0].any, false);
const parityBeforeSpeedRollback = await parity("before removing the speed-up");
await db.exec(readRollback(WEEKLY_OFF_SPEED_ROLLBACK));
check("speed-up rollback: same results", (await parity("after removing the speed-up")) && parityBeforeSpeedRollback, true);
await db.exec(readRollback(WEEKLY_OFF_ROLLBACK));
compare("after rollback — C/O engine", engineBefore, await engineSnapshot(db));
check("after rollback — regression.sql identical", await regression(db), regBefore);
compare("after rollback — register", jsBefore, await jsSnapshot(db, holidayDates));
check("old 3rd-Saturday rule editable again",
  (await db.query(`SELECT is_wired, retired FROM public.admin_attendance_rules WHERE rule_key = 'wo.third_saturday_off'`)).rows[0], { is_wired: true, retired: false });
await db.exec(readMigration(WEEKLY_OFF_MIGRATION));
check("migration re-applies after rollback", (await db.query(`SELECT count(*)::int AS n FROM public.admin_attendance_rule_values WHERE rule_key = 'wo.pattern' AND reason LIKE 'Carried over%'`)).rows[0].n, legacyRows.length);
await db.close();

process.exit(done() ? 1 : 0);

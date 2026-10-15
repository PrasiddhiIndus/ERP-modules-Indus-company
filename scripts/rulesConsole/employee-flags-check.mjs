/**
 * Employee Master attendance flags — checks for 20261008160000_employee_attendance_flags.sql.
 *
 *   npm run rules:check:flags
 *
 * 1. No result changes until a flag is unticked (C/O credit simulation for every employee × day).
 * 2. Access: Employee Master editors only; the internal helper is not callable directly.
 * 3. Has weekly off / Has NH/PH / Earns C/O: SQL engine and browser resolver agree.
 * 4. Ticking again returns to the department value; no-op saves write nothing.
 * 5. Other employees unchanged; rollback restores identical C/O results.
 */
import {
  buildEngineDb, readMigration, readRollback, asUser, createReporter, isoDays, EMPLOYEES,
  CONSOLE_MIGRATION, SCOPES_MIGRATION, PRIORITY_MIGRATION,
  WEEKLY_OFF_MIGRATION, WEEKLY_OFF_SPEED_MIGRATION, WEEKLY_OFF_WIRE_MIGRATION,
} from "./harness.mjs";
import * as rules from "../../src/lib/attendanceRules.js";

const FLAGS_MIGRATION = "20261008160000_employee_attendance_flags.sql";
const FLAGS_ROLLBACK = "20261008160000_employee_attendance_flags_down.sql";
const CO_EXPIRY_MIGRATION = "20261008170000_employee_co_expiry_flag.sql";
const CO_EXPIRY_ROLLBACK = "20261008170000_employee_co_expiry_flag_down.sql";
const PAGE_ACCESS_MIGRATION = "20261008150000_admin_rules_console_page_access.sql";

const { check, expectError, section, done } = createReporter();
const CODES = EMPLOYEES.map((e) => e[0]);
const DEPT = Object.fromEntries(EMPLOYEES.map((e) => [e[0], e[2]]));

const db = await buildEngineDb();
await db.exec(`
  ALTER TABLE public.profiles ADD COLUMN team text, ADD COLUMN allowed_modules jsonb, ADD COLUMN allowed_sub_modules jsonb;
  CREATE FUNCTION public.jsonb_text_array(jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
    AS $$ SELECT CASE WHEN jsonb_typeof($1) = 'array' THEN $1 ELSE '[]'::jsonb END $$;
  CREATE FUNCTION public.normalize_erp_module_key(text) RETURNS text LANGUAGE sql IMMUTABLE
    AS $$ SELECT lower(btrim(coalesce($1, ''))) $$;
  INSERT INTO public.profiles (id, role, full_name, is_active, allowed_sub_modules) VALUES
    ('00000000-0000-0000-0000-000000000005', 'user', 'Esha Employee Admin', true, '["admin.employee"]'),
    ('00000000-0000-0000-0000-000000000006', 'user', 'Dev Dashboard', true, '["admin.dashboard"]');
`);
for (const m of [CONSOLE_MIGRATION, SCOPES_MIGRATION, PRIORITY_MIGRATION, WEEKLY_OFF_MIGRATION,
  WEEKLY_OFF_SPEED_MIGRATION, WEEKLY_OFF_WIRE_MIGRATION, PAGE_ACCESS_MIGRATION]) {
  await db.exec(readMigration(m));
}

const today = (await db.query(`SELECT greatest(current_date, DATE '2026-09-01')::text AS d`)).rows[0].d;
const nextDow = (dow, from = today) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const DAYS = isoDays(nextDow(1), (() => { const d = new Date(`${nextDow(1)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 34); return d.toISOString().slice(0, 10); })());
const HOLIDAY = nextDow(3); // a Wednesday: only a holiday, never a weekly off
await db.query(`INSERT INTO public.admin_national_public_holidays VALUES ($1, 'NH')`, [HOLIDAY]);
// Active rules must apply from today; the harness fixes the C/O start date in the past.
await db.exec(`SET test.role = 'service_role'`);

const credits = async (codes = CODES) => {
  await db.exec(`TRUNCATE indus_one.comp_off_credits`);
  await db.query(`
    SELECT indus_one.comp_off_try_earn_credit(c, d::date, NULL, m.mark, m.prior)
    FROM unnest($1::text[]) c, unnest($2::text[]) d,
      (VALUES ('P', NULL), ('P', 'WO'), ('P(OD)', NULL), ('P', 'NH/PH')) m(mark, prior)`, [codes, DAYS]);
  return (await db.query(`SELECT employee_code, earned_date::text AS d, source_type FROM indus_one.comp_off_credits ORDER BY 1, 2`)).rows;
};

const rowCount = async () => (await db.query(`SELECT count(*)::int AS n FROM public.admin_attendance_rule_values`)).rows[0].n;
const flags = async (code) => (await db.query(`SELECT public.admin_employee_attendance_flags($1) AS f`, [code])).rows[0].f;
const save = (code, wo, co, hol, exp) => (exp === undefined
  ? db.query(`SELECT public.admin_employee_attendance_flags_save($1, $2, $3, $4) AS f`, [code, wo, co, hol])
  : db.query(`SELECT public.admin_employee_attendance_flags_save($1, $2, $3, $4, $5) AS f`, [code, wo, co, hol, exp])
).then((r) => r.rows[0].f);
const one = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];

async function loadJsSnapshot() {
  const values = (await db.query(`SELECT * FROM public.admin_attendance_rule_values`)).rows.map((r) => ({
    ...r, effective_from: r.effective_from instanceof Date ? r.effective_from.toISOString().slice(0, 10) : r.effective_from,
  }));
  rules.setRulesSnapshot({ values, groups: [], members: [] });
}

// ---------------------------------------------------------------------------
section("1. Nothing changes until a flag is unticked");
const before = await credits();
await db.exec(readMigration(FLAGS_MIGRATION));
check("C/O credits identical for every employee × day × mark", await credits(), before);
check("co.earn is wired", await one(`SELECT is_wired FROM public.admin_attendance_rules WHERE rule_key = 'co.earn'`), true);
check("every employee starts with all three ticked",
  (await Promise.all(CODES.map(flags))).every((f) => f.has_weekly_off && f.earns_co && f.has_holidays), true);

// ---------------------------------------------------------------------------
section("2. Access");
await asUser(db, "hr");
await expectError("HR without Admin module cannot save", () => save("102", null, false, null), /cannot change attendance settings/);
await db.exec(`SELECT set_config('test.uid', '00000000-0000-0000-0000-000000000006', false)`);
await expectError("another Admin page (Dashboard) is not enough", () => save("102", null, false, null), /cannot change attendance settings/);
await db.exec(`SELECT set_config('test.uid', '00000000-0000-0000-0000-000000000005', false)`);
check("Employee Administration page holder can save (no-op)", (await save("102", true, true, true)).earns_co, true);
check("internal helper not executable by signed-in users",
  await one(`SELECT has_function_privilege('authenticated', 'public.admin_employee_flag_apply(text, text, text, boolean, jsonb, jsonb)', 'EXECUTE')`), false);
await asUser(db, "admin");
await expectError("unknown employee", () => save("9999", false, null, null), /Save the employee first/);

// ---------------------------------------------------------------------------
section("3. Flags drive the engine");
const sunday = nextDow(0, DAYS[0]);
const n0 = await rowCount();
check("no-op save writes nothing", (await save("102", true, true, true), await rowCount()), n0);

await save("102", false, null, null);
check("Has weekly off off → pattern none", await one(`SELECT public.admin_rule_weekly_off_pattern('102', $1)`, [sunday]), "none");
check("Has weekly off off → Sunday is not a weekly off", await one(`SELECT public.admin_rule_is_weekly_off('102', $1)`, [sunday]), false);
check("Has weekly off off → worked Sunday earns no C/O (unmarked day)",
  await one(`SELECT indus_one.comp_off_is_earning_day($1, NULL, '102')`, [sunday]), false);
check("Has weekly off off → holiday still earns", (await credits(["102"])).some((r) => r.d === HOLIDAY), true);

await save("116", null, null, false);
check("Has NH/PH off → holidays do not apply", await one(`SELECT public.admin_rule_holidays_apply('116', $1)`, [HOLIDAY]), false);
check("Has NH/PH off → worked holiday earns no C/O (calendar)",
  await one(`SELECT indus_one.comp_off_is_earning_day($1, NULL, '116')`, [HOLIDAY]), false);
check("Has NH/PH off → weekly offs still earn", (await credits(["116"])).some((r) => r.d === sunday), true);

await save("118", null, false, null);
check("Earns C/O off → no credit on any day (WO, NH/PH, marked WO, P(OD))", await credits(["118"]), []);
check("Earns C/O off → weekly off itself unchanged", await one(`SELECT public.admin_rule_is_weekly_off('118', $1)`, [sunday]), true);
check("flags read back", { ...(await flags("118")) }, { earns_co: false, has_holidays: true, has_weekly_off: true });

await loadJsSnapshot();
check("browser: 102 Sunday not a weekly off", rules.isWeeklyOffDay(sunday, { employeeCode: "102", department: DEPT["102"] }), false);
check("browser: 116 holidays off", rules.isAutoHolidayFor(HOLIDAY, { employeeCode: "116", department: DEPT["116"] }), false);
check("browser: 118 still has Sunday off", rules.isWeeklyOffDay(sunday, { employeeCode: "118", department: DEPT["118"] }), true);
const parity = [];
for (const code of CODES) {
  for (const d of DAYS) {
    const sql = await one(`SELECT public.admin_rule_is_weekly_off($1, $2)`, [code, d]);
    if (sql !== rules.isWeeklyOffDay(d, { employeeCode: code, department: DEPT[code] })) parity.push(`${code} ${d}`);
  }
}
check("SQL ↔ browser weekly off parity (every employee × day)", parity, []);

// ---------------------------------------------------------------------------
section("4. Ticking again");
await save("101", false, null, null);
await save("101", true, null, null);
check("Production employee returns to the department pattern (Sunday only)",
  await one(`SELECT public.admin_rule_weekly_off_pattern('101', $1)`, [sunday]), "sun_only");
check("employee value removed (inherit row)",
  await one(`SELECT value IS NULL FROM public.admin_attendance_rule_values WHERE rule_key = 'wo.pattern' AND scope_type = 'employee' AND scope_id = '101' ORDER BY id DESC LIMIT 1`), true);

await db.query(`INSERT INTO public.admin_attendance_rule_values (rule_key, scope_type, scope_id, scope_label, value, effective_from, reason, status)
  VALUES ('wo.pattern', 'department', 'dahej-hr', 'Dahej-HR', '"none"', $1, 'Dahej works all days', 'active')`, [today]);
check("department with no weekly off: employee shows unticked", (await flags("108")).has_weekly_off, false);
await save("108", true, null, null);
check("ticking stores the company default for that employee", await one(`SELECT public.admin_rule_weekly_off_pattern('108', $1)`, [sunday]), "sun_3rd_sat");
await save("108", false, null, null);
check("unticking again → none", await one(`SELECT public.admin_rule_weekly_off_pattern('108', $1)`, [sunday]), "none");

await save("118", null, true, null);
check("Earns C/O ticked again → earns as before", (await credits(["118"])).length, before.filter((r) => r.employee_code === "118").length);

// ---------------------------------------------------------------------------
section("5. Others unchanged; rollback");
const touched = new Set(["101", "102", "108", "116", "118"]);
const others = CODES.filter((c) => !touched.has(c) && DEPT[c] !== "Dahej-HR");
{
  const got = await credits(others);
  const otherKeys = new Set(others.map((c) => c.replace(/^0+/, "")));
  const want = before.filter((r) => otherKeys.has(r.employee_code.replace(/^0+/, "")));
  const key = (r) => `${r.employee_code} ${r.d} ${r.source_type}`;
  const gotSet = new Set(got.map(key));
  const wantSet = new Set(want.map(key));
  check("employees without flags: credits unchanged", {
    extra: got.map(key).filter((k) => !wantSet.has(k)).slice(0, 5),
    missing: want.map(key).filter((k) => !gotSet.has(k)).slice(0, 5),
  }, { extra: [], missing: [] });
}

await save("118", null, false, null);
await db.exec(readRollback(FLAGS_ROLLBACK));
check("after rollback co.earn is ignored (118 earns again)",
  (await credits(["118"])).length, before.filter((r) => r.employee_code === "118").length);
check("after rollback co.earn not wired", await one(`SELECT is_wired FROM public.admin_attendance_rules WHERE rule_key = 'co.earn'`), false);
await db.exec(readMigration(FLAGS_MIGRATION));
check("migration re-applies after rollback", (await flags("118")).earns_co, false);

// ---------------------------------------------------------------------------
section("6. C/O expires (170000)");
const NEVER = "9999-12-31";
const expiryRows = async (code) => (await db.query(
  `SELECT earned_date::text AS d, status, expiry_date::text AS x,
          (expiry_date = indus_one.comp_off_expiry_for_earned(earned_date)) AS normal
   FROM indus_one.comp_off_credits WHERE employee_code = $1 ORDER BY earned_date`, [code])).rows;
const seedLedger = async () => {
  await db.exec(`TRUNCATE indus_one.comp_off_credits`);
  await db.exec(`
    INSERT INTO indus_one.comp_off_credits (employee_code, earned_date, source_type, credit_amount, consumed_amount, expiry_date, status)
    SELECT c, d, 'register_p', 1, used, indus_one.comp_off_expiry_for_earned(d), st
    FROM (VALUES ('109'), ('110')) e(c),
      LATERAL (VALUES
        ((now() AT TIME ZONE 'Asia/Kolkata')::date - 20, 0, 'available'),
        ((now() AT TIME ZONE 'Asia/Kolkata')::date - 10, 0.5, 'partial'),
        ((now() AT TIME ZONE 'Asia/Kolkata')::date - 15, 1, 'consumed'),
        ((now() AT TIME ZONE 'Asia/Kolkata')::date - 70, 0, 'available')) r(d, used, st)`);
};

const before170 = await credits();
await db.exec(readMigration(CO_EXPIRY_MIGRATION));
const after170 = await credits();
check("nothing changes until unticked (same credits)", after170, before170);
check("new C/O still expires earned date + 2 months",
  await one(`SELECT count(*)::int FROM indus_one.comp_off_credits WHERE expiry_date <> indus_one.comp_off_expiry_for_earned(earned_date)`), 0);
check("co.expiry_mode is wired", await one(`SELECT is_wired FROM public.admin_attendance_rules WHERE rule_key = 'co.expiry_mode'`), true);
check("everyone starts with C/O expires ticked", (await Promise.all(CODES.map(flags))).every((f) => f.co_expires), true);

await seedLedger();
await save("109", null, null, null, false);
const rows109 = await expiryRows("109");
check("unticked: unused C/O stops expiring (available + partial)",
  rows109.filter((r) => r.status === "available" || r.status === "partial").map((r) => r.x === NEVER),
  [false, true, true]);
check("unticked: used C/O and C/O already past its date are untouched",
  rows109.filter((r) => r.x !== NEVER).every((r) => r.normal), true);
check("unticked: other employees' C/O unchanged", (await expiryRows("110")).every((r) => r.normal), true);
check("flags read back", (await flags("109")).co_expires, false);
await db.exec(`TRUNCATE indus_one.comp_off_credits`);
await db.query(`SELECT indus_one.comp_off_try_earn_credit(c, $1::date, NULL, 'P', NULL) FROM unnest(ARRAY['109','110']) c`, [sunday]);
check("unticked: newly earned C/O never expires", (await expiryRows("109")).map((r) => r.x), [NEVER]);
check("newly earned C/O of others still expires", (await expiryRows("110")).every((r) => r.normal), true);

await save("109", null, null, null, true);
await seedLedger();
await save("109", null, null, null, false);
await save("109", null, null, null, true);
check("ticked again: unused C/O gets earned date + 2 months back", (await expiryRows("109")).every((r) => r.normal), true);
check("ticked again: employee value removed (inherit row)",
  await one(`SELECT value IS NULL FROM public.admin_attendance_rule_values WHERE rule_key = 'co.expiry_mode' AND scope_type = 'employee' AND scope_id = '109' ORDER BY id DESC LIMIT 1`), true);
const n6 = await rowCount();
check("no-op save writes nothing", (await save("109", null, null, null, true), await rowCount()), n6);

await save("109", null, null, null, false);
await db.exec(readRollback(CO_EXPIRY_ROLLBACK));
check("after rollback never-expiring C/O expires normally again", (await expiryRows("109")).every((r) => r.normal), true);
check("after rollback the three-checkbox save still works", (await save("102", null, true, null)).earns_co, true);
await db.exec(readMigration(CO_EXPIRY_MIGRATION));
check("migration re-applies after rollback", (await flags("109")).co_expires, false);

// ---------------------------------------------------------------------------
section("7. Sunday off / 3rd Saturday off (20261015140000)");
const SPLIT_MIGRATION = "20261015140000_employee_weekly_off_sunday_third_saturday.sql";
const SPLIT_ROLLBACK = "20261015140000_employee_weekly_off_sunday_third_saturday_down.sql";
const THIRD_SAT = DAYS.find((d) => {
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.getUTCDay() === 6 && dt.getUTCDate() >= 15 && dt.getUTCDate() <= 21;
});
const HOLIDAYS = new Set((await db.query(`SELECT holiday_date::text AS d FROM public.admin_national_public_holidays`)).rows.map((r) => r.d));
const SUNDAYS = DAYS.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0 && !HOLIDAYS.has(d));
const weeklyOffGrid = async () => (await db.query(
  `SELECT c, string_agg(public.admin_rule_is_weekly_off(c, d::date)::text || public.admin_rule_weekly_off_pattern(c, d::date), ',' ORDER BY d) AS g
   FROM unnest($1::text[]) c, unnest($2::text[]) d GROUP BY c ORDER BY c`, [CODES, DAYS])).rows;
const oldFlagView = (f) => ({ has_weekly_off: f.has_weekly_off, earns_co: f.earns_co, co_expires: f.co_expires, has_holidays: f.has_holidays });
const savePattern = (code, pattern) => db.query(
  `SELECT public.admin_employee_attendance_flags_save($1, p_weekly_off_pattern => $2) AS f`, [code, pattern]).then((r) => r.rows[0].f);
const patternOn = (code) => one(`SELECT public.admin_rule_weekly_off_pattern($1, $2)`, [code, sunday]);

const creditsBefore = await credits();
const gridBefore = await weeklyOffGrid();
const flagsBefore = (await Promise.all(CODES.map(flags))).map(oldFlagView);
const ruleRowsBefore = await rowCount();
await db.exec(readMigration(SPLIT_MIGRATION));
check("C/O credits identical for every employee × day × mark", await credits(), creditsBefore);
check("weekly off + pattern identical for every employee × day", await weeklyOffGrid(), gridBefore);
check("existing four settings read back identical", (await Promise.all(CODES.map(flags))).map(oldFlagView), flagsBefore);
check("migration writes no rule values", await rowCount(), ruleRowsBefore);
check("Sunday / 3rd Saturday boxes match today's pattern",
  (await Promise.all(CODES.map(flags))).map((f) => [f.sunday_off, f.third_saturday_off]),
  await Promise.all(CODES.map(async (c) => {
    const p = await patternOn(c);
    return [p === "sun_3rd_sat" || p === "sun_only", p === "sun_3rd_sat" || p === "third_sat_only"];
  })));
check("old positional save (4 args) still works", (await save("102", null, true, null)).earns_co, true);
check("old positional save (5 args) still works", (await save("109", null, null, null, false)).co_expires, false);
check("internal helper not executable by signed-in users",
  await one(`SELECT has_function_privilege('authenticated', 'public.admin_employee_value_apply(text, text, text, jsonb)', 'EXECUTE')`), false);
await expectError("unknown pattern rejected", () => savePattern("110", "custom"), /Choose which days/);

const n7 = await rowCount();
check("same pattern as the department writes nothing", (await savePattern("113", "sun_only"), await rowCount()), n7);

await savePattern("110", "third_sat_only");
check("3rd Saturday only: pattern saved", await patternOn("110"), "third_sat_only");
check("3rd Saturday only: Sundays are working days",
  await Promise.all(SUNDAYS.map((d) => one(`SELECT public.admin_rule_is_weekly_off('110', $1)`, [d]))), SUNDAYS.map(() => false));
check("3rd Saturday only: 3rd Saturday is a weekly off", await one(`SELECT public.admin_rule_is_weekly_off('110', $1)`, [THIRD_SAT]), true);
check("3rd Saturday only: boxes read back", (({ sunday_off, third_saturday_off }) => ({ sunday_off, third_saturday_off }))(await flags("110")),
  { sunday_off: false, third_saturday_off: true });
{
  const got = await credits(["110"]);
  check("3rd Saturday only: worked Sunday (unmarked) earns no C/O",
    await Promise.all(SUNDAYS.map((d) => one(`SELECT indus_one.comp_off_is_earning_day($1, NULL, '110')`, [d]))), SUNDAYS.map(() => false));
  check("3rd Saturday only: worked 3rd Saturday earns C/O", got.some((r) => r.d === THIRD_SAT), true);
}

await savePattern("115", "sun_only");
check("Sunday only: 3rd Saturday is a working day", await one(`SELECT public.admin_rule_is_weekly_off('115', $1)`, [THIRD_SAT]), false);
check("Sunday only: Sunday still a weekly off", await one(`SELECT public.admin_rule_is_weekly_off('115', $1)`, [sunday]), true);

await savePattern("113", "third_sat_only");
await savePattern("113", "sun_only");
check("back to the department pattern removes the employee value",
  await one(`SELECT value IS NULL FROM public.admin_attendance_rule_values WHERE rule_key = 'wo.pattern' AND scope_type = 'employee' AND scope_id = '113' ORDER BY id DESC LIMIT 1`), true);
check("…and follows the department again", await patternOn("113"), "sun_only");

await loadJsSnapshot();
{
  const mismatch = [];
  for (const code of CODES) {
    for (const d of DAYS) {
      const sql = await one(`SELECT public.admin_rule_is_weekly_off($1, $2)`, [code, d]);
      if (sql !== rules.isWeeklyOffDay(d, { employeeCode: code, department: DEPT[code] })) mismatch.push(`${code} ${d}`);
    }
  }
  check("SQL ↔ browser weekly off parity incl. 3rd Saturday only", mismatch, []);
}

{
  const touched7 = new Set(["101", "102", "108", "109", "110", "113", "115", "116", "118"]);
  const others7 = CODES.filter((c) => !touched7.has(c) && DEPT[c] !== "Dahej-HR");
  const norm = (c) => c.replace(/^0+/, "");
  const otherKeys7 = new Set(others7.map(norm));
  const key = (r) => `${norm(r.employee_code)} ${r.d} ${r.source_type}`;
  const want = new Set(creditsBefore.filter((r) => otherKeys7.has(norm(r.employee_code))).map(key));
  const got = new Set((await credits(others7)).map(key));
  check("employees not edited: C/O credits unchanged", [...got].filter((k) => !want.has(k)).concat([...want].filter((k) => !got.has(k))), []);
}

await db.exec(readRollback(SPLIT_ROLLBACK));
check("after rollback 3rd Saturday only reads as Sunday + 3rd Saturday", await patternOn("110"), "sun_3rd_sat");
check("after rollback the old save still works", (await save("102", null, true, null)).earns_co, true);
check("after rollback flags have no Sunday / 3rd Saturday keys", "sunday_off" in (await flags("102")), false);
await db.exec(readMigration(SPLIT_MIGRATION));
check("migration re-applies after rollback", await patternOn("110"), "third_sat_only");

await db.close();
process.exit(done() ? 1 : 0);

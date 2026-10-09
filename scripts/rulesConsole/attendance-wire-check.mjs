/**
 * Rules Console attendance rules — checks for 20261008180000_admin_rules_attendance_wire.sql.
 *
 *   npm run rules:check:attendance
 */
import {
  buildEngineDb, readMigration, readRollback, asUser, createReporter,
  CONSOLE_MIGRATION, SCOPES_MIGRATION, PRIORITY_MIGRATION,
} from "./harness.mjs";

const MIGRATION = "20261008180000_admin_rules_attendance_wire.sql";
const ROLLBACK = "20261008180000_admin_rules_attendance_wire_down.sql";
const ATT_KEYS = [
  "att.half_day_cutoff", "att.purple_first_from", "att.purple_first_to", "att.purple_last_before",
  "att.shift_start", "att.shift_end", "att.grace_minutes", "att.punch_overrides_leave",
];

const { check, section, done } = createReporter();
const db = await buildEngineDb();
for (const m of [CONSOLE_MIGRATION, SCOPES_MIGRATION, PRIORITY_MIGRATION]) await db.exec(readMigration(m));
await db.exec(`SET test.role = 'service_role'`);

// Leave punch detection stubs: punches on 101 / 102 on 12 Oct.
await db.exec(`
  CREATE FUNCTION indus_one.admin_leave_date_has_punch(p_employee_code text, p_date date) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT p_employee_code IN ('101','102') AND p_date = DATE '2026-10-12' $$;
  CREATE FUNCTION indus_one.admin_leave_register_has_punch(p_employee_code text, p_date date) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION indus_one.admin_leave_date_punch_priority(p_employee_code text, p_date date) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT indus_one.admin_leave_date_has_punch(p_employee_code, p_date)
      OR indus_one.admin_leave_register_has_punch(p_employee_code, p_date) $$;
`);
const one = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const priority = async () => (await db.query(
  `SELECT c, indus_one.admin_leave_date_punch_priority(c, d::date) AS p
   FROM unnest(ARRAY['101','102','103']) c, unnest(ARRAY['2026-10-12','2026-10-13']) d ORDER BY c, d`)).rows;

section("1. Nothing changes until a rule is edited");
const before = await priority();
check("rules start read-only", await one(`SELECT bool_or(is_wired) FROM public.admin_attendance_rules WHERE rule_key = ANY($1)`, [ATT_KEYS]), false);
await db.exec(readMigration(MIGRATION));
check("punch beats leave exactly as before", await priority(), before);
check("all eight attendance rules editable", await one(`SELECT count(*)::int FROM public.admin_attendance_rules WHERE rule_key = ANY($1) AND is_wired`, [ATT_KEYS]), 8);
check("starting values are today's times",
  (await db.query(`SELECT rule_key, value FROM public.admin_attendance_rule_values WHERE rule_key = ANY($1) AND scope_type = 'company' ORDER BY rule_key`, [ATT_KEYS])).rows
    .map((r) => [r.rule_key, r.value]),
  [["att.grace_minutes", 0], ["att.half_day_cutoff", "13:00"], ["att.punch_overrides_leave", true], ["att.purple_first_from", "12:00"],
   ["att.purple_first_to", "15:00"], ["att.purple_last_before", "12:00"], ["att.shift_end", "18:00"], ["att.shift_start", "09:00"]]);

section("2. Saving from the console");
await asUser(db, "admin");
await db.query(`SELECT public.admin_rules_save_scoped('att.punch_overrides_leave', 'employee', '101', 'false', current_date, 'Leave wins for 101')`);
await db.query(`SELECT public.admin_rules_save_scoped('att.shift_start', 'department', 'Production', '"08:00"', current_date, 'Production starts at 8')`);
check("saved values resolve", [
  await one(`SELECT public.get_rule_value('101', 'att.punch_overrides_leave', current_date)`),
  await one(`SELECT public.get_rule_value('101', 'att.shift_start', current_date)`),
], [false, "08:00"]);
check("punch overrides leave off for 101: leave wins; 102 unchanged",
  (await priority()).filter((r) => r.p).map((r) => r.c), ["102"]);

section("3. Rollback");
await db.exec(readRollback(ROLLBACK));
check("after rollback a punch always wins again", await priority(), before);
check("rules read-only again", await one(`SELECT bool_or(is_wired) FROM public.admin_attendance_rules WHERE rule_key = ANY($1)`, [ATT_KEYS]), false);
await db.exec(readMigration(MIGRATION));
check("migration re-applies", (await priority()).filter((r) => r.p).map((r) => r.c), ["102"]);

await db.close();
process.exit(done() ? 1 : 0);

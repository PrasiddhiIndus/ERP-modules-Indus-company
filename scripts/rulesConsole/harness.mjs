/**
 * In-memory Postgres (PGlite) with the production C/O engine, rebuilt from the
 * latest definition of each function found in supabase/migrations.
 * Used by the Rules Console phase checks; never touches a real database.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.on("uncaughtException", (e) => {
  console.error(`\nScript stopped: ${e.message}${e.where ? `\n  at ${e.where}` : ""}`);
  process.exit(2);
});

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const MIGRATIONS = `${ROOT}/supabase/migrations`;
export const ROLLBACKS = `${ROOT}/supabase/rollbacks`;
export const CONSOLE_MIGRATION = "20261008100000_admin_attendance_rules_console.sql";
export const SCOPES_MIGRATION = "20261008120000_admin_rules_console_scopes.sql";
export const SCOPES_ROLLBACK = "20261008120000_admin_rules_console_scopes_down.sql";
export const PRIORITY_MIGRATION = "20261008130000_admin_rules_console_group_priority.sql";
export const PRIORITY_ROLLBACK = "20261008130000_admin_rules_console_group_priority_down.sql";
export const WEEKLY_OFF_MIGRATION = "20261008140000_admin_rules_weekly_off.sql";
export const WEEKLY_OFF_SPEED_MIGRATION = "20261008140050_admin_rules_weekly_off_speed.sql";
export const WEEKLY_OFF_SPEED_ROLLBACK = "20261008140050_admin_rules_weekly_off_speed_down.sql";
export const WEEKLY_OFF_WIRE_MIGRATION = "20261008140100_admin_rules_weekly_off_wire.sql";
export const WEEKLY_OFF_ROLLBACK = "20261008140000_admin_rules_weekly_off_down.sql";
export const WEEKLY_OFF_WIRE_ROLLBACK = "20261008140100_admin_rules_weekly_off_wire_down.sql";

export const readMigration = (name) => readFileSync(`${MIGRATIONS}/${name}`, "utf8");
export const readRollback = (name) => readFileSync(`${ROLLBACKS}/${name}`, "utf8");

/** Latest CREATE OR REPLACE FUNCTION <name>( … $$; in migrations sorted before `before`. */
export function latestDefinition(name, before = CONSOLE_MIGRATION) {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f < before).sort();
  const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${name.replace(/\./g, "\\.")}\\s*\\(`, "gi");
  let found = null;
  for (const f of files) {
    const s = readFileSync(`${MIGRATIONS}/${f}`, "utf8");
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const open = s.indexOf("$$", m.index);
      const close = s.indexOf("$$", open + 2);
      found = { file: f, sql: s.slice(m.index, s.indexOf(";", close) + 1) };
    }
  }
  if (!found) throw new Error(`No definition found for ${name}`);
  return found;
}

export const ENGINE_FUNCTIONS = [
  "public.normalize_attendance_employee_code",
  "indus_one.comp_off_norm_emp",
  "indus_one.comp_off_normalize_mark",
  "indus_one.comp_off_is_present_mark",
  "indus_one.comp_off_is_third_saturday",
  "indus_one.comp_off_norm_department",
  "indus_one.comp_off_employee_department",
  "indus_one.comp_off_cutoff_date",
  "indus_one.comp_off_expiry_for_earned",
  "indus_one.comp_off_sunday_pod_only_employee",
  "indus_one.comp_off_third_saturday_excluded_employee",
  "indus_one.comp_off_is_earning_day",
  "indus_one.comp_off_try_earn_credit",
];

export const USERS = {
  admin: "00000000-0000-0000-0000-000000000001",
  admin2: "00000000-0000-0000-0000-000000000002",
  superAdmin: "00000000-0000-0000-0000-000000000003",
  hr: "00000000-0000-0000-0000-000000000004",
};

/** Employees: [code, name, department]. Codes with leading zeros test normalisation. */
export const EMPLOYEES = [
  ["101", "Prakash Patel", "Production"],
  ["102", "Hema Rao", "HR"],
  ["103", "Mohan Shah", "M&M"],
  ["104", "Neha Joshi", "Production - Neotech"],
  ["105", "Farhan Ali", "Production-FTC"],
  ["106", "Ravi Mehta", "R&M"],
  ["107", "Mira Desai", "Maintenance-FTC"],
  ["108", "Dinesh Kumar", "Dahej-HR"],
  ["109", "Gita Nair", "Finance"],
  ["110", "Manoj Verma", "Projects-FTC"],
  ["0111", "Asha Iyer", "Administration"],
  ["112", "Kiran Bose", " production "],
  ["113", "Sunil Das", "PRODUCTION - FTC"],
  ["114", "Tara Sen", "Production  -  Neotech"],
  ["115", "Vijay Pillai", "Maintenance"],
  ["116", "Lata Kapoor", "Dahej-HR"],
  ["117", "No Dept", null],
  ["118", "Arjun Rana", "Finance"],
];

export async function buildEngineDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
      AS $$ SELECT coalesce(nullif(current_setting('test.role', true), ''), 'authenticated') $$;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, full_name text, is_active boolean DEFAULT true);
    CREATE FUNCTION public.normalize_erp_role(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim($1)) $$;
    CREATE TABLE public.admin_ifsp_employee_master (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, employee_code text, full_name text, department text, status text DEFAULT 'Active');
    CREATE TABLE public.admin_national_public_holidays (holiday_date date, holiday_type text);
    INSERT INTO public.admin_national_public_holidays VALUES
      ('2026-08-15','NH'),('2026-10-02','NH'),('2026-11-08','PH'),('2027-01-26','NH');
    INSERT INTO public.profiles VALUES
      ('${USERS.admin}','admin','Asha Admin',true),
      ('${USERS.admin2}','admin','Bina Admin',true),
      ('${USERS.superAdmin}','super_admin','Sam Super',true),
      ('${USERS.hr}','hr','Harish HR',true);
    CREATE SCHEMA indus_one;
    CREATE TABLE indus_one.comp_off_credits (
      employee_code text, earned_date date, source_type text, source_register_id uuid, source_key text,
      credit_amount numeric, consumed_amount numeric DEFAULT 0, expiry_date date, status text,
      updated_at timestamptz, UNIQUE (employee_code, earned_date));
    CREATE FUNCTION indus_one.comp_off_try_revoke_credit(p_code text, p_date date) RETURNS void LANGUAGE sql AS $$
      UPDATE indus_one.comp_off_credits SET status = 'revoked' WHERE employee_code = p_code AND earned_date = p_date $$;
  `);
  for (const name of ENGINE_FUNCTIONS) await db.exec(latestDefinition(name).sql);
  for (const [code, name, dept] of EMPLOYEES) {
    await db.query("INSERT INTO public.admin_ifsp_employee_master (employee_code, full_name, department) VALUES ($1,$2,$3)", [code, name, dept]);
  }
  return db;
}

export function asUser(db, key) {
  return db.exec(`SELECT set_config('test.uid', '${key ? USERS[key] : ""}', false), set_config('test.role', 'authenticated', false)`);
}

export function createReporter() {
  let failures = 0;
  let passes = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) passes += 1;
    else failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  };
  const expectError = async (label, run, pattern) => {
    try {
      await run();
      failures += 1;
      console.log(`FAIL ${label}: no error`);
    } catch (e) {
      const ok = pattern.test(e.message);
      if (ok) passes += 1;
      else failures += 1;
      console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? ` — "${e.message}"` : `: ${e.message}`}`);
    }
  };
  const section = (title) => console.log(`\n== ${title}`);
  const done = () => {
    console.log(`\n${passes} passed, ${failures} failed`);
    return failures;
  };
  return { check, expectError, section, done };
}

export const isoDays = (from, to) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

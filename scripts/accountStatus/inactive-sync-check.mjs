/**
 * Checks for 20261010100000_fix_employee_master_inactive_wrong_login.sql
 * (in-memory Postgres; never touches a real database).
 *
 *   node scripts/accountStatus/inactive-sync-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(
  `${ROOT}/supabase/migrations/20261010100000_fix_employee_master_inactive_wrong_login.sql`, "utf8");
const rollback = readFileSync(
  `${ROOT}/supabase/rollbacks/20261010100000_fix_employee_master_inactive_wrong_login_down.sql`, "utf8");
const previous = readFileSync(
  `${ROOT}/supabase/migrations/20260923120000_allow_employee_master_status_sync_past_self_guard.sql`, "utf8");

let passed = 0;
let failed = 0;
const check = (label, ok) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
};

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const HR = "00000000-0000-0000-0000-0000000000a2";
const LEFT = "00000000-0000-0000-0000-0000000000b1";
const STAY = "00000000-0000-0000-0000-0000000000b2";
const REUSE = "00000000-0000-0000-0000-0000000000b3";
const MANUAL = "00000000-0000-0000-0000-0000000000b4";

const db = new PGlite();
await db.exec(`
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, banned_until timestamptz);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.norm_emp_code(p text) RETURNS text LANGUAGE sql IMMUTABLE
    AS $$ SELECT coalesce(nullif(ltrim(upper(regexp_replace(coalesce(p, ''), '\\s', '', 'g')), '0'), ''), '') $$;
  CREATE FUNCTION public.is_current_user_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, email text, employee_code text, role text, team text,
    allowed_modules jsonb, allowed_sub_modules jsonb,
    is_active boolean NOT NULL DEFAULT true, updated_at timestamptz);
  CREATE TABLE public.admin_ifsp_employee_master (
    id bigserial PRIMARY KEY, employee_code text, employee_id text, full_name text,
    status text, user_id uuid, updated_at timestamptz);
  CREATE FUNCTION public.sync_auth_ban_from_profile_is_active() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    UPDATE auth.users SET banned_until = CASE WHEN NEW.is_active THEN NULL
      ELSE '9999-12-31 23:59:59+00'::timestamptz END WHERE id = NEW.id;
    RETURN NEW;
  END $$;
  CREATE TRIGGER trg_sync_auth_ban_from_profile_is_active AFTER INSERT OR UPDATE OF is_active
    ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_auth_ban_from_profile_is_active();
`);
await db.exec(previous.replace(/NOTIFY pgrst[^;]*;/g, ""));
await db.exec(`
  CREATE TRIGGER trg_sync_profile_is_active_from_employee_master
    AFTER INSERT OR UPDATE OF status, employee_code, user_id, employee_id
    ON public.admin_ifsp_employee_master
    FOR EACH ROW EXECUTE FUNCTION public.sync_profile_is_active_from_employee_master();
`);

await db.exec(`
  INSERT INTO auth.users (id) VALUES
    ('${ADMIN}'), ('${HR}'), ('${LEFT}'), ('${STAY}'), ('${REUSE}'), ('${MANUAL}');
  INSERT INTO public.profiles (id, email, employee_code, is_active) VALUES
    ('${ADMIN}', 'admin@x', NULL, true),
    ('${HR}', 'hr@x', 'H900', true),
    ('${LEFT}', 'left@x', '0101', true),
    ('${STAY}', 'stay@x', '102', true),
    ('${REUSE}', 'reuse@x', '103', true),
    ('${MANUAL}', 'manual@x', '104', false);
  -- Rows created by the admin / HR screens carried the creator's login.
  INSERT INTO public.admin_ifsp_employee_master (employee_code, full_name, status, user_id) VALUES
    ('101', 'Left Person', 'Active', '${ADMIN}'),
    ('102', 'Stay Person', 'Active', '${HR}'),
    ('103', 'Old holder of 103', 'Inactive', NULL),
    ('103', 'New holder of 103', 'Active', '${REUSE}'),
    ('104', 'Manual off', 'Active', NULL),
    ('H900', 'HR self', 'Active', '${HR}');
  UPDATE public.profiles SET is_active = false WHERE id = '${MANUAL}';
`);

const active = async (id) => (await db.query(`SELECT is_active FROM public.profiles WHERE id = $1`, [id])).rows[0].is_active;
const banned = async (id) => (await db.query(`SELECT banned_until IS NOT NULL AS b FROM auth.users WHERE id = $1`, [id])).rows[0].b;
const userIdOf = async (code, name) => (await db.query(
  `SELECT user_id FROM public.admin_ifsp_employee_master WHERE employee_code = $1 AND full_name = $2`, [code, name])).rows[0].user_id;

// Reproduce the bug with the old trigger.
await db.exec(`UPDATE public.admin_ifsp_employee_master SET status = 'Inactive' WHERE employee_code = '101'`);
check("before fix: admin who created the leaver is switched off (bug reproduced)", (await active(ADMIN)) === false);
check("before fix: the leaver keeps their login (bug reproduced)", (await active(LEFT)) === true);

await db.exec(migration.replace(/NOTIFY pgrst[^;]*;/g, ""));

console.log("\nData repair");
check("admin re-activated", (await active(ADMIN)) === true);
check("admin auth ban lifted", (await banned(ADMIN)) === false);
check("leaver now switched off", (await active(LEFT)) === false);
check("leaver auth ban set", (await banned(LEFT)) === true);
check("leaver row linked to the leaver's own login", (await userIdOf("101", "Left Person")) === LEFT);
check("row with HR's login relinked to the employee's own login", (await userIdOf("102", "Stay Person")) === STAY);
check("HR's own employee row keeps HR's login", (await userIdOf("H900", "HR self")) === HR);
check("code reused by an Active employee: login stays active", (await active(REUSE)) === true);
check("login switched off manually in User Management stays off", (await active(MANUAL)) === false);
check("other users untouched", (await active(HR)) === true && (await active(STAY)) === true);

console.log("\nNew behaviour");
const newRow = (await db.query(
  `INSERT INTO public.admin_ifsp_employee_master (employee_code, full_name, status, user_id)
   VALUES ('105', 'New Hire', 'Active', '${HR}') RETURNING id, user_id`)).rows[0];
check("new employee saved by HR is not linked to HR's login", newRow.user_id === null);
await db.exec(`UPDATE public.admin_ifsp_employee_master SET status = 'Inactive' WHERE id = ${newRow.id}`);
check("marking that employee Inactive leaves HR active", (await active(HR)) === true);

await db.exec(`UPDATE public.admin_ifsp_employee_master SET status = 'Inactive' WHERE employee_code = '102'`);
check("marking an employee Inactive switches off their own login", (await active(STAY)) === false);
await db.exec(`UPDATE public.profiles SET is_active = true WHERE id = '${STAY}'`);
await db.exec(`UPDATE public.admin_ifsp_employee_master SET full_name = 'Stay Person', status = 'Inactive' WHERE employee_code = '102'`);
check("re-saving an already Inactive employee does not switch the login off again", (await active(STAY)) === true);
await db.exec(`UPDATE public.admin_ifsp_employee_master SET status = 'Active' WHERE employee_code = '102'`);
check("marking the employee Active again keeps the login active", (await active(STAY)) === true);

await db.exec(`UPDATE public.admin_ifsp_employee_master SET status = 'Inactive' WHERE full_name = 'Old holder of 103'`);
await db.exec(`UPDATE public.admin_ifsp_employee_master SET status = 'Active' WHERE full_name = 'Old holder of 103'`);
await db.exec(`UPDATE public.admin_ifsp_employee_master SET status = 'Inactive' WHERE full_name = 'Old holder of 103'`);
check("old Inactive row for a reused code never switches off the current holder", (await active(REUSE)) === true);

await db.exec(`UPDATE public.admin_ifsp_employee_master SET user_id = '${ADMIN}' WHERE employee_code = '104'`);
check("user_id cannot be pointed at a login with a different code", (await userIdOf("104", "Manual off")) === MANUAL);

await db.exec(rollback.replace(/NOTIFY pgrst[^;]*;/g, ""));
const fn = (await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'employee_master_link_own_login'`)).rows[0].n;
check("rollback removes the own-login guard", fn === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

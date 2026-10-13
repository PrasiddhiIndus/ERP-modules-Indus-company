/**
 * PGlite check (in-memory, never touches the real database) for
 * 20261013170000_projects_enquiry_assignee_names.sql.
 * Run: node scripts/projectsEnquiry/enquiry-assignee-names-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const up = read("supabase/migrations/20261013170000_projects_enquiry_assignee_names.sql");
const down = read("supabase/rollbacks/20261013170000_projects_enquiry_assignee_names_down.sql");

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};

const db = new PGlite();
await db.exec(`
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA projects;
  CREATE TABLE public.access_flag (allowed boolean);
  INSERT INTO public.access_flag VALUES (true);
  CREATE FUNCTION public.current_user_can_access_module(module_key text) RETURNS boolean
    LANGUAGE sql STABLE AS $f$ SELECT module_key = 'projects' AND (SELECT allowed FROM public.access_flag) $f$;
  CREATE TABLE public.admin_ifsp_employee_master (
    id serial PRIMARY KEY, employee_code text, full_name text, department text, status text
  );
  INSERT INTO public.admin_ifsp_employee_master (employee_code, full_name, department, status) VALUES
    ('2859', 'Dhaval Shisode', 'Projects', 'Active'),
    ('9347', 'Sreenath K', ' projects ', 'Active'),
    ('100', 'Old Projects Person', 'Projects', 'Inactive'),
    ('101', 'Project Singular', 'Project', NULL),
    ('102', 'FTC Person', 'Projects-FTC', 'Active'),
    ('103', 'HR Person', 'HR', 'Active'),
    ('104', '  ', 'Projects', 'Active'),
    ('105', 'dhaval shisode', 'Projects', 'Active');
`);
const names = async () =>
  (await db.query("SELECT full_name, employee_code FROM projects.enquiry_assignee_names()")).rows;

check("migration applies", (await db.exec(up).then(() => null, (e) => e.message)) === null);
check("migration is re-runnable", (await db.exec(up).then(() => null, (e) => e.message)) === null);

let rows = await names();
const list = rows.map((r) => r.full_name);
check("only active Projects employees, sorted, one per name (any casing)",
  JSON.stringify(list.map((n) => n.toLowerCase())) ===
    JSON.stringify(["dhaval shisode", "project singular", "sreenath k"]), list);
check("employee code is returned", rows.find((r) => r.full_name === "Sreenath K")?.employee_code === "9347", rows);
check("Projects-FTC and other departments are left out", !list.includes("FTC Person") && !list.includes("HR Person"));
check("inactive employees are left out", !list.includes("Old Projects Person"));

await db.exec("UPDATE public.access_flag SET allowed = false");
rows = await names();
check("users without Projects access get no names", rows.length === 0, rows);

check("rollback applies", (await db.exec(down).then(() => null, (e) => e.message)) === null);
check("function is gone after rollback",
  (await db.query("SELECT to_regprocedure('projects.enquiry_assignee_names()') AS f")).rows[0].f === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

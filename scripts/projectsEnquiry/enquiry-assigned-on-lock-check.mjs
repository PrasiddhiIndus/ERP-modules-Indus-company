/**
 * PGlite check (in-memory, never touches the real database) for
 * 20261013150000_projects_enquiry_lock_assigned_on_date.sql.
 * Run: node scripts/projectsEnquiry/enquiry-assigned-on-lock-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const up = read("supabase/migrations/20261013150000_projects_enquiry_lock_assigned_on_date.sql");
const down = read("supabase/rollbacks/20261013150000_projects_enquiry_lock_assigned_on_date_down.sql");

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};

const db = new PGlite();
await db.exec(`
  CREATE SCHEMA projects;
  CREATE TABLE projects.enquiries (id int PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}'::jsonb);
  INSERT INTO projects.enquiries VALUES
    (1, '{"assigned_on_date":"2026-10-01","client_name":"A"}'),
    (2, '{"client_name":"B"}'),
    (3, '{"assigned_on_date":"","client_name":"C"}');
`);
const get = async (id) => (await db.query("SELECT data FROM projects.enquiries WHERE id = $1", [id])).rows[0].data;

check("migration applies", (await db.exec(up).then(() => null, (e) => e.message)) === null);
check("migration is re-runnable", (await db.exec(up).then(() => null, (e) => e.message)) === null);

await db.exec(`UPDATE projects.enquiries SET data = '{"assigned_on_date":"2026-12-31","client_name":"A2"}' WHERE id = 1`);
let d = await get(1);
check("saved assigned-on date is kept", d.assigned_on_date === "2026-10-01", d);
check("other fields still update", d.client_name === "A2", d);

await db.exec(`UPDATE projects.enquiries SET data = '{"client_name":"A3"}' WHERE id = 1`);
d = await get(1);
check("clearing the saved date is ignored", d.assigned_on_date === "2026-10-01" && d.client_name === "A3", d);

await db.exec(`UPDATE projects.enquiries SET data = '{"assigned_on_date":"2026-10-05","client_name":"B"}' WHERE id = 2`);
check("date can be set when it was never saved", (await get(2)).assigned_on_date === "2026-10-05");

await db.exec(`UPDATE projects.enquiries SET data = '{"assigned_on_date":"2026-10-06","client_name":"C"}' WHERE id = 3`);
check("empty saved date counts as not set", (await get(3)).assigned_on_date === "2026-10-06");

check("rollback applies", (await db.exec(down).then(() => null, (e) => e.message)) === null);
await db.exec(`UPDATE projects.enquiries SET data = '{"assigned_on_date":"2027-01-01"}' WHERE id = 1`);
check("after rollback the date can change", (await get(1)).assigned_on_date === "2027-01-01");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

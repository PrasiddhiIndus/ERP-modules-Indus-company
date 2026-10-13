/**
 * PGlite check (in-memory, never touches the real database) for
 * 20261013120000_projects_enquiry_serial_series.sql: serials become 1..N in existing order,
 * new enquiries continue the series, deletes close gaps, renumbering keeps updated_at.
 * Run: node scripts/projectsEnquiry/enquiry-serial-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const up = read("supabase/migrations/20261013120000_projects_enquiry_serial_series.sql");
const down = read("supabase/rollbacks/20261013120000_projects_enquiry_serial_series_down.sql");

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
  CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
  CREATE TABLE projects.enquiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number bigint GENERATED ALWAYS AS IDENTITY,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TRIGGER enquiries_updated_at BEFORE UPDATE ON projects.enquiries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
`);

// Simulate gaps: 6 inserts, delete #2 and #5, burn sequence values.
for (const name of ["A", "B", "C", "D", "E", "F"]) {
  await db.query("INSERT INTO projects.enquiries (data, updated_at) VALUES ($1, '2026-01-01T00:00:00Z')", [{ client_name: name }]);
}
await db.exec(`DELETE FROM projects.enquiries WHERE serial_number IN (2, 5); SELECT nextval(pg_get_serial_sequence('projects.enquiries','serial_number')) FROM generate_series(1, 40);`);

const list = async () =>
  (await db.query("SELECT serial_number::int AS s, data->>'client_name' AS c, updated_at FROM projects.enquiries ORDER BY serial_number")).rows;
const insert = async (name) =>
  (await db.query("INSERT INTO projects.enquiries (data) VALUES ($1) RETURNING serial_number::int AS s", [{ client_name: name }])).rows[0].s;

check("migration applies", (await db.exec(up).then(() => null, (e) => e.message)) === null);
check("migration is re-runnable", (await db.exec(up).then(() => null, (e) => e.message)) === null);

let rows = await list();
check("existing enquiries renumbered 1..N in original order",
  JSON.stringify(rows.map((r) => [r.s, r.c])) === JSON.stringify([[1, "A"], [2, "C"], [3, "D"], [4, "F"]]), rows);
check("renumbering keeps last edited time",
  rows.every((r) => new Date(r.updated_at).toISOString() === "2026-01-01T00:00:00.000Z"), rows.map((r) => r.updated_at));

check("new enquiry continues the series", (await insert("G")) === 5);

await db.exec("DELETE FROM projects.enquiries WHERE data->>'client_name' = 'C'");
rows = await list();
check("delete closes the gap",
  JSON.stringify(rows.map((r) => [r.s, r.c])) === JSON.stringify([[1, "A"], [2, "D"], [3, "F"], [4, "G"]]), rows);
check("next enquiry after delete continues from last", (await insert("H")) === 5);

await db.exec("UPDATE projects.enquiries SET data = data || '{\"x\":1}' WHERE data->>'client_name' = 'A'");
const a = (await db.query("SELECT updated_at FROM projects.enquiries WHERE data->>'client_name' = 'A'")).rows[0];
check("normal edits still update last edited time", new Date(a.updated_at).getUTCFullYear() !== 2026 || new Date(a.updated_at) > new Date("2026-01-02"));

await db.exec("DELETE FROM projects.enquiries");
check("first enquiry after emptying starts at 1", (await insert("Z")) === 1);

check("rollback applies", (await db.exec(down).then(() => null, (e) => e.message)) === null);
const manual = await db.query("UPDATE projects.enquiries SET serial_number = 99").then(() => "ok", () => "blocked");
check("after rollback serial numbers are system-generated again", manual === "blocked");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

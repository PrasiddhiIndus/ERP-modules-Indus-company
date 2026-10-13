/**
 * PGlite check (in-memory, never touches the real database) for
 * 20261013180000_projects_enquiry_deletion_approval.sql and the one-time
 * scripts/projectsEnquiry/assignee-name-update.sql.
 * Run: node scripts/projectsEnquiry/enquiry-deletion-approval-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const up = read("supabase/migrations/20261013180000_projects_enquiry_deletion_approval.sql");
const down = read("supabase/rollbacks/20261013180000_projects_enquiry_deletion_approval_down.sql");
const nameUpdate = read("scripts/projectsEnquiry/assignee-name-update.sql");

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};
const err = (p) => p.then(() => null, (e) => e.message);

const EXEC = "00000000-0000-0000-0000-000000000001";
const MGR = "00000000-0000-0000-0000-000000000002";
const OUTSIDER = "00000000-0000-0000-0000-000000000003";

const db = new PGlite();
await db.exec(`
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $f$ SELECT nullif(current_setting('test.uid', true), '')::uuid $f$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, username text, email text, role text, team text);
  INSERT INTO public.profiles VALUES
    ('${EXEC}', 'Exec One', 'e@x.com', 'executive', 'projects'),
    ('${MGR}', 'Manager One', 'm@x.com', 'Manager', 'projects'),
    ('${OUTSIDER}', 'Outsider', 'o@x.com', 'executive', 'hr');
  CREATE FUNCTION public.normalize_erp_role(raw text) RETURNS text LANGUAGE sql IMMUTABLE
    AS $f$ SELECT lower(btrim(coalesce(raw, ''))) $f$;
  CREATE FUNCTION public.current_user_can_access_module(module_key text) RETURNS boolean LANGUAGE sql STABLE
    AS $f$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND team = module_key) $f$;
  CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql
    AS $f$ BEGIN NEW.updated_at := now(); RETURN NEW; END $f$;
  CREATE SCHEMA projects;
  GRANT USAGE ON SCHEMA projects, auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  CREATE TABLE projects.enquiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number bigint,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TRIGGER enquiries_updated_at BEFORE UPDATE ON projects.enquiries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  ALTER TABLE projects.enquiries ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "enquiries_auth" ON projects.enquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  GRANT SELECT, INSERT, UPDATE, DELETE ON projects.enquiries TO authenticated;
  INSERT INTO projects.enquiries (id, serial_number, data) VALUES
    ('10000000-0000-0000-0000-000000000001', 1, '{"client_name":"Alpha"}'),
    ('10000000-0000-0000-0000-000000000002', 2, '{"client_name":"Beta"}'),
    ('10000000-0000-0000-0000-000000000003', 3, '{"client_name":"Gamma"}');
`);

const as = async (uid, sql, params) => {
  await db.exec(`SET test.uid = '${uid}'; SET ROLE authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("RESET ROLE;");
  }
};
const count = async () => Number((await db.query("SELECT count(*) AS n FROM projects.enquiries")).rows[0].n);
const E1 = "10000000-0000-0000-0000-000000000001";
const E2 = "10000000-0000-0000-0000-000000000002";
const E3 = "10000000-0000-0000-0000-000000000003";

check("migration applies", (await err(db.exec(up))) === null);
check("migration is re-runnable", (await err(db.exec(up))) === null);

await as(EXEC, `DELETE FROM projects.enquiries WHERE id = $1`, [E1]);
check("executive cannot delete an enquiry directly", (await count()) === 3);
check("executive can still edit enquiries",
  (await err(as(EXEC, `UPDATE projects.enquiries SET data = data || '{"x":1}' WHERE id = $1`, [E1]))) === null &&
  (await db.query("SELECT data->>'x' AS x FROM projects.enquiries WHERE id = $1", [E1])).rows[0].x === "1");

const r1 = (await as(EXEC, "SELECT projects.request_enquiry_deletion($1, 'duplicate') AS id", [E1])).rows[0].id;
check("executive can request deletion", Number(r1) > 0, r1);
const again = (await as(EXEC, "SELECT projects.request_enquiry_deletion($1, 'again') AS id", [E1])).rows[0].id;
check("a second request for the same enquiry reuses the pending one", String(again) === String(r1), { r1, again });

const req = (await db.query("SELECT * FROM projects.enquiry_deletion_requests WHERE id = $1", [r1])).rows[0];
check("request records enquiry, client, reason and requester",
  req.enquiry_serial == 1 && req.enquiry_client === "Alpha" && req.reason === "duplicate" &&
  req.requested_by === EXEC && req.requested_by_name === "Exec One" && req.status === "pending", req);

check("user without Projects access cannot request deletion",
  /access/i.test(await err(as(OUTSIDER, "SELECT projects.request_enquiry_deletion($1)", [E2])) || ""));

check("executive cannot approve their own request",
  /manager/i.test(await err(as(EXEC, "SELECT projects.decide_enquiry_deletion($1, true)", [r1])) || ""));

check("executive sees their own request",
  (await as(EXEC, "SELECT id FROM projects.enquiry_deletion_requests")).rows.length === 1);
check("outsider sees no requests",
  (await as(OUTSIDER, "SELECT id FROM projects.enquiry_deletion_requests")).rows.length === 0);
check("manager sees the request",
  (await as(MGR, "SELECT id FROM projects.enquiry_deletion_requests")).rows.length === 1);
check("requests cannot be edited directly",
  (await err(as(EXEC, "UPDATE projects.enquiry_deletion_requests SET status = 'approved'"))) !== null);

check("manager approves", (await as(MGR, "SELECT projects.decide_enquiry_deletion($1, true, 'ok') AS s", [r1])).rows[0].s === "approved");
check("approved enquiry is deleted", (await db.query("SELECT 1 FROM projects.enquiries WHERE id = $1", [E1])).rows.length === 0);
const done = (await db.query("SELECT * FROM projects.enquiry_deletion_requests WHERE id = $1", [r1])).rows[0];
check("request shows who approved it", done.status === "approved" && done.decided_by === MGR && done.decided_by_name === "Manager One", done);
check("deciding twice is refused",
  /already/i.test(await err(as(MGR, "SELECT projects.decide_enquiry_deletion($1, false)", [r1])) || ""));

const r2 = (await as(EXEC, "SELECT projects.request_enquiry_deletion($1) AS id", [E2])).rows[0].id;
await as(MGR, "SELECT projects.decide_enquiry_deletion($1, false, 'needed')", [r2]);
check("rejected request keeps the enquiry",
  (await db.query("SELECT 1 FROM projects.enquiries WHERE id = $1", [E2])).rows.length === 1 &&
  (await db.query("SELECT status FROM projects.enquiry_deletion_requests WHERE id = $1", [r2])).rows[0].status === "rejected");

const r3 = (await as(EXEC, "SELECT projects.request_enquiry_deletion($1) AS id", [E3])).rows[0].id;
await as(MGR, "DELETE FROM projects.enquiries WHERE id = $1", [E3]);
check("manager can delete directly", (await db.query("SELECT 1 FROM projects.enquiries WHERE id = $1", [E3])).rows.length === 0);
check("direct delete settles the pending request",
  (await db.query("SELECT status FROM projects.enquiry_deletion_requests WHERE id = $1", [r3])).rows[0].status === "approved");

check("rollback applies", (await err(db.exec(down))) === null);
await as(EXEC, "DELETE FROM projects.enquiries WHERE id = $1", [E2]);
check("after rollback anyone can delete again", (await count()) === 0);

// ---- one-time Assigned To Person name update
await db.exec(`
  CREATE TABLE public.admin_ifsp_employee_master (employee_code text, full_name text, department text, status text);
  INSERT INTO public.admin_ifsp_employee_master VALUES
    ('2859', 'Dhaval Shisode', 'Projects', 'Active'),
    ('1', 'Mehul Patel', 'Projects', 'Active'),
    ('2', 'Yash Shah', 'Projects', 'Active'),
    ('3', 'Yash Mehta', 'Projects', 'Active'),
    ('4', 'Alka Rao', 'HR', 'Active');
  INSERT INTO projects.enquiries (id, serial_number, data, updated_at) VALUES
    ('20000000-0000-0000-0000-000000000001', 1, '{"assigned_to_person":"Dhaval"}', '2026-01-01'),
    ('20000000-0000-0000-0000-000000000002', 2, '{"assigned_to_person":"Mehul sir"}', '2026-01-01'),
    ('20000000-0000-0000-0000-000000000003', 3, '{"assigned_to_person":"Yash"}', '2026-01-01'),
    ('20000000-0000-0000-0000-000000000004', 4, '{"assigned_to_person":"Alka"}', '2026-01-01'),
    ('20000000-0000-0000-0000-000000000005', 5, '{"assigned_to_person":"Dhaval Shisode"}', '2026-01-01'),
    ('20000000-0000-0000-0000-000000000006', 6, '{"client_name":"No assignee"}', '2026-01-01');
`);
check("name update script runs", (await err(db.exec(nameUpdate))) === null);
const names = Object.fromEntries(
  (await db.query("SELECT serial_number AS s, data->>'assigned_to_person' AS n, updated_at FROM projects.enquiries ORDER BY 1")).rows
    .map((r) => [r.s, r])
);
check("first name becomes full name", names[1].n === "Dhaval Shisode", names[1]);
check("'sir' is ignored when matching", names[2].n === "Mehul Patel", names[2]);
check("ambiguous first name is left unchanged", names[3].n === "Yash", names[3]);
check("name outside Projects is left unchanged", names[4].n === "Alka", names[4]);
check("full name and blank assignee are left unchanged", names[5].n === "Dhaval Shisode" && names[6].n === null);
check("last-updated dates are kept",
  Object.values(names).every((r) => new Date(r.updated_at).toISOString().startsWith("2026-01-01")), Object.values(names).map((r) => r.updated_at));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

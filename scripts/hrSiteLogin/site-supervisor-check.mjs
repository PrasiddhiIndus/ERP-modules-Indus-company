/**
 * PGlite check (in-memory, never touches the real database) for
 * 20261127150000_site_employee_email_and_supervisors.sql:
 *   - employee email: validation, duplicates, login-sync guard
 *   - Site Supervisor: precheck, exact access given, move, remove, audit
 *   - RLS: a supervisor sees / writes only their own site; HR is unaffected
 * Run: node scripts/hrSiteLogin/site-supervisor-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8").replace(/NOTIFY pgrst[^;]*;/g, "");

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};

const HR = "00000000-0000-0000-0000-0000000000a1";
const SUP = "00000000-0000-0000-0000-0000000000b1"; // login of site person S1
const OTHER_SITE_LOGIN = "00000000-0000-0000-0000-0000000000c1"; // login of S3, ordinary site login
const SALES = "00000000-0000-0000-0000-0000000000d1";

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, username text, role text, team text,
    employee_code text, allowed_modules jsonb DEFAULT '[]', allowed_sub_modules jsonb DEFAULT '[]',
    module_access_pending boolean DEFAULT false, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
    l1_manager_code text, l2_manager_code text);
  CREATE TABLE public.people (id bigserial PRIMARY KEY, unique_code text, full_name text, designation text,
    father_name text, phone_no text, pf_no text, esic_no text, category_name text, joining_date date,
    leaving_date date, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
  CREATE TABLE public.sites (id bigserial PRIMARY KEY, site_name text, location text, site_type text);
  CREATE TABLE public.site_assignments (id bigserial PRIMARY KEY, person_id bigint, site_id bigint, from_date date, to_date date);
  CREATE TABLE public.attendance (id bigserial PRIMARY KEY, person_id bigint, site_id bigint, att_date date, att_code text);
  CREATE TABLE public.site_designations (id bigserial PRIMARY KEY, site_id bigint, designation_name text);
  CREATE TABLE public.people_sensitive_details (person_id bigint PRIMARY KEY, pan_no text);
  CREATE TABLE public.hr_managers (id bigserial PRIMARY KEY, username text, password_hash text);
  CREATE TABLE public.people_hr_leads (person_id bigint PRIMARY KEY, l1_employee_code text, l1_employee_name text,
    l2_employee_code text, l2_employee_name text, updated_at timestamptz DEFAULT now());
  CREATE TABLE public.admin_ifsp_employee_master (employee_code text);

  -- Same open policies the standalone HR app uses.
  DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['profiles','people','sites','site_assignments','attendance','site_designations',
                             'people_sensitive_details','hr_managers','people_hr_leads'] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY open_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
    END LOOP;
  END $$;
`);
for (const t of ["people", "sites", "site_assignments", "attendance", "site_designations", "hr_managers"]) {
  await db.exec(`GRANT USAGE, SELECT ON SEQUENCE public.${t}_id_seq TO authenticated, service_role`);
}
for (const t of ["profiles", "people_sensitive_details", "people_hr_leads"]) {
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO authenticated, service_role`);
}

await db.exec(`
  CREATE FUNCTION public.norm_emp_code(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim(coalesce(t, ''))) $$;
  CREATE FUNCTION public.normalize_erp_role(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(lower(btrim(coalesce(t, ''))), '[\\s-]+', '_', 'g') $$;
  CREATE FUNCTION public.normalize_erp_module_key(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT lower(btrim(coalesce(raw, ''))) $$;
  CREATE FUNCTION public.jsonb_text_array(src jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN jsonb_typeof(src) = 'array' THEN src ELSE '[]'::jsonb END $$;
  CREATE FUNCTION public.current_user_has_admin_module_access() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') $$;
  CREATE FUNCTION public.current_user_can_access_module(module_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET row_security = off AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
      lower(p.team) = module_key OR p.allowed_sub_modules::text LIKE '%"' || module_key || '.%')) $$;
  CREATE FUNCTION public.current_user_can_access_calling_site_type(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.current_user_has_site_attendance_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET row_security = off AS $$
    SELECT public.current_user_can_access_module('hr') $$;
  CREATE FUNCTION public.current_user_can_access_site_attendance_site(p_site_id bigint) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;

  -- Original hr_people_directory (20260930140000).
  CREATE VIEW public.hr_people_directory WITH (security_invoker = on) AS
  SELECT p.id, p.unique_code, p.full_name, p.designation, p.father_name, p.phone_no, p.pf_no, p.esic_no,
    p.category_name, p.joining_date, p.leaving_date, p.is_active, p.created_at,
    l.l1_employee_code, l.l1_employee_name, l.l2_employee_code, l.l2_employee_name, l.updated_at AS leads_updated_at,
    cs.site_id AS current_site_id, cs.site_name AS current_site_name, cs.location AS current_site_location
  FROM public.people p
  LEFT JOIN public.people_hr_leads l ON l.person_id = p.id
  LEFT JOIN LATERAL (
    SELECT sa.site_id, s.site_name, s.location FROM public.site_assignments sa
    LEFT JOIN public.sites s ON s.id = sa.site_id
    WHERE sa.person_id = p.id AND (sa.to_date IS NULL OR sa.to_date >= current_date)
      AND (sa.from_date IS NULL OR sa.from_date <= current_date)
    ORDER BY sa.from_date DESC NULLS LAST LIMIT 1) cs ON true;
  GRANT SELECT ON public.hr_people_directory TO authenticated, service_role;
`);

for (const m of [
  "supabase/migrations/20260930180000_site_employee_logins.sql",
  "supabase/migrations/20260930190000_site_login_create.sql",
  "supabase/migrations/20261012210000_hr_site_login_page_access.sql",
]) {
  await db.exec(read(m));
}

await db.exec(`
  INSERT INTO public.sites (id, site_name, site_type) VALUES (1, 'Site A', 'Fire'), (2, 'Site B', 'Fire');
  INSERT INTO public.people (id, unique_code, full_name) VALUES
    (11, 'S1', 'Supervisor One'), (12, 'S2', 'Worker Two'), (13, 'S3', 'Worker Three'), (14, 'S4', 'No Login');
  INSERT INTO public.site_assignments (person_id, site_id, from_date) VALUES
    (11, 1, '2026-01-01'), (12, 1, '2026-01-01'), (13, 2, '2026-01-01'), (14, 1, '2026-01-01');
  INSERT INTO public.attendance (person_id, site_id, att_date, att_code) VALUES
    (11, 1, '2026-11-01', 'P'), (12, 1, '2026-11-01', 'P'), (13, 2, '2026-11-01', 'P');
  INSERT INTO public.site_designations (site_id, designation_name) VALUES (1, 'FIREMAN'), (2, 'FIREMAN');
  INSERT INTO public.people_sensitive_details VALUES (11, 'PAN1'), (13, 'PAN3');
  INSERT INTO public.hr_managers (username, password_hash) VALUES ('hrx', 'hash');
  INSERT INTO public.profiles (id, email, role, team, employee_code, allowed_modules, allowed_sub_modules, module_access_pending) VALUES
    ('${HR}', 'hr@x.test', 'executive', 'hr', 'IF1', '[]', '[]', false),
    ('${SUP}', 's1@x.test', 'executive', NULL, 'S1', '["sales"]', '["hr.dashboard","admin.dashboard"]', true),
    ('${OTHER_SITE_LOGIN}', 's3@x.test', 'executive', NULL, 'S3', '[]', '["hr.site-attendance"]', false),
    ('${SALES}', 'sales@x.test', 'executive', 'sales', 'X1', '[]', '[]', false);
  INSERT INTO public.admin_ifsp_employee_master VALUES ('IF1');
`);

const up = read("supabase/migrations/20261127150000_site_employee_email_and_supervisors.sql");
{ const m = await db.exec(up).then(() => null, (e) => e.message); check("migration applies", m === null, m); }
check("migration is re-runnable", (await db.exec(up).then(() => null, (e) => e.message)) === null);

/** Run as an authenticated user (RLS applies). Returns rows or { error }. */
const as = async (uid, sql, params = []) => {
  await db.exec(`SET test.uid = '${uid}'; SET ROLE authenticated;`);
  try {
    return (await db.query(sql, params)).rows;
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec("RESET ROLE; RESET test.uid;");
  }
};
const err = (r) => (r && r.error) || "";

// ---------------- Employee email ----------------
check("HR sets an employee email", !err(await as(HR, "SELECT public.set_person_login_email(14, ' NoLogin@X.test ')")));
const saved = await db.query("SELECT email FROM public.people_login_emails WHERE person_id = 14");
check("email stored normalized", saved.rows[0]?.email === "nologin@x.test", saved.rows);
check("invalid email rejected", /valid email/i.test(err(await as(HR, "SELECT public.set_person_login_email(12, 'not-an-email')"))));
check("duplicate employee email rejected", /already linked/i.test(err(await as(HR, "SELECT public.set_person_login_email(12, 'nologin@x.test')"))));
check(
  "email of another employee's login rejected",
  /already used by another login/i.test(err(await as(HR, "SELECT public.set_person_login_email(12, 's3@x.test')")))
);
check(
  "changing email of a person with a login requires the login service",
  /LOGIN_EMAIL_SYNC_REQUIRED/.test(err(await as(HR, "SELECT public.set_person_login_email(11, 'new@x.test')")))
);
check(
  "same email as the person's own login is accepted",
  !err(await as(HR, "SELECT public.set_person_login_email(11, 's1@x.test')"))
);
check(
  "removing the email of a person with a login is refused",
  /cannot be removed/i.test(err(await as(HR, "SELECT public.set_person_login_email(11, '')")))
);
check("sales user cannot set emails", /not allowed/i.test(err(await as(SALES, "SELECT public.set_person_login_email(12, 'w2@x.test')"))));
check(
  "email precheck (login service) rejects a taken email",
  /already/i.test(err(await as(HR, "SELECT public.site_login_email_precheck(12, 's3@x.test')")))
);
const pre = await as(HR, "SELECT public.site_login_email_precheck(11, 'new@x.test') AS r");
check("email precheck returns the linked login", pre[0]?.r?.profile_id === SUP, pre);
check(
  "site_login_apply_email is not callable by users",
  /permission denied/i.test(err(await as(HR, `SELECT public.site_login_apply_email(11, '${SUP}', 'new@x.test')`)))
);

// ---------------- Supervisor precheck / assign ----------------
check(
  "precheck: employee not assigned to the site is refused",
  /not currently assigned/i.test(err(await as(HR, "SELECT public.site_supervisor_precheck(11, 2)")))
);
check("precheck: assigned employee passes", !err(await as(HR, "SELECT public.site_supervisor_precheck(11, 1)")));
check(
  "assign without a login is refused",
  /no login linked/i.test(err(await as(HR, "SELECT public.assign_site_supervisor(14, 1)")))
);
check("sales user cannot assign", /only hr/i.test(err(await as(SALES, "SELECT public.assign_site_supervisor(11, 1)"))));
const cands = await as(HR, "SELECT * FROM public.list_site_supervisor_candidates(1)");
check(
  "candidates = active employees assigned to the site, with email + login state",
  Array.isArray(cands) && cands.length === 3 && cands.find((c) => c.person_id === 11)?.has_login === true &&
    cands.find((c) => c.person_id === 14)?.email === "nologin@x.test",
  cands
);

check("HR assigns S1 as supervisor of Site A", !err(await as(HR, "SELECT public.assign_site_supervisor(11, 1)")));
const prof = (await db.query(`SELECT * FROM public.profiles WHERE id = '${SUP}'`)).rows[0];
check(
  "supervisor gets exactly HR · Site Attendance · Attendance",
  JSON.stringify(prof.allowed_sub_modules) === JSON.stringify(["hr.site-attendance", "site-attendance-page.attendance"]),
  prof.allowed_sub_modules
);
check("no full modules, no team, not pending, role executive",
  JSON.stringify(prof.allowed_modules) === "[]" && prof.team === null && prof.module_access_pending === false && prof.role === "executive",
  prof);
const hist = (await db.query("SELECT * FROM public.site_supervisor_history WHERE person_id = 11")).rows;
check("history keeps the access the login had before", hist.length === 1 && hist[0].action === "assigned" &&
  JSON.stringify(hist[0].old_allowed_modules) === '["sales"]', hist);

const list = await as(HR, "SELECT * FROM public.list_site_employee_logins() WHERE person_id = 11");
check("User Management · Site Employees lists the supervisor and site",
  list[0]?.supervisor_site_id === 1 && list[0]?.supervisor_site_name === "Site A" && list[0]?.person_email === "s1@x.test", list);

// ---------------- Supervisor scope (RLS) ----------------
const sites = await as(SUP, "SELECT id FROM public.sites ORDER BY id");
check("supervisor sees only their site", JSON.stringify(sites) === '[{"id":1}]', sites);
const ppl = await as(SUP, "SELECT id FROM public.people ORDER BY id");
check("supervisor sees only people assigned to their site", JSON.stringify(ppl.map((r) => r.id)) === "[11,12,14]", ppl);
const att = await as(SUP, "SELECT site_id FROM public.attendance");
check("supervisor sees only their site's attendance", Array.isArray(att) && att.length === 2 && att.every((r) => r.site_id === 1), att);
check("supervisor can mark attendance on their site",
  !err(await as(SUP, "INSERT INTO public.attendance (person_id, site_id, att_date, att_code) VALUES (12, 1, '2026-11-02', 'P')")));
check("supervisor cannot mark attendance on another site",
  /row-level security/i.test(err(await as(SUP, "INSERT INTO public.attendance (person_id, site_id, att_date, att_code) VALUES (13, 2, '2026-11-02', 'P')"))));
check("supervisor cannot move attendance to another site",
  /row-level security/i.test(err(await as(SUP, "UPDATE public.attendance SET site_id = 2 WHERE site_id = 1"))));
const siteUpd = await as(SUP, "UPDATE public.sites SET site_name = 'x' WHERE id = 1 RETURNING id");
check("supervisor cannot edit sites", /row-level security/i.test(err(siteUpd)) || (Array.isArray(siteUpd) && !siteUpd.length), siteUpd);
check("supervisor cannot add people",
  /row-level security/i.test(err(await as(SUP, "INSERT INTO public.people (unique_code, full_name) VALUES ('Z', 'Z')"))));
check("supervisor cannot add site assignments",
  /row-level security/i.test(err(await as(SUP, "INSERT INTO public.site_assignments (person_id, site_id) VALUES (12, 1)"))));
const sens = await as(SUP, "SELECT * FROM public.people_sensitive_details");
check("supervisor cannot read sensitive HR data", Array.isArray(sens) && sens.length === 0, sens);
const mgrs = await as(SUP, "SELECT * FROM public.hr_managers");
check("supervisor cannot read HR manager credentials", Array.isArray(mgrs) && mgrs.length === 0, mgrs);
const ids = await as(SUP, "SELECT public.current_user_supervised_site_ids() AS ids");
check("supervisor scope helper returns their site", JSON.stringify(ids[0]?.ids) === "[1]", ids);
check("supervisor cannot manage site logins", (await as(SUP, "SELECT public.current_user_can_manage_site_logins() AS ok"))[0]?.ok === false);
check("supervisor cannot change employee emails", /not allowed/i.test(err(await as(SUP, "SELECT public.set_person_login_email(12, 'a@b.test')"))));
check("supervisor cannot make supervisors", /only hr/i.test(err(await as(SUP, "SELECT public.assign_site_supervisor(12, 1)"))));

// Everyone else unchanged
check("HR still sees every site", (await as(HR, "SELECT id FROM public.sites")).length === 2);
check("HR still sees all attendance", (await as(HR, "SELECT id FROM public.attendance")).length === 4);
check("ordinary site login still sees what it saw before", (await as(OTHER_SITE_LOGIN, "SELECT id FROM public.sites")).length === 2);
check("HR still reads sensitive data", (await as(HR, "SELECT * FROM public.people_sensitive_details")).length === 2);

// ---------------- Site change ----------------
await db.exec("UPDATE public.site_assignments SET to_date = current_date - 1 WHERE person_id = 11; INSERT INTO public.site_assignments (person_id, site_id, from_date) VALUES (11, 2, current_date);");
check("HR moves supervisor to the new site", !err(await as(HR, "SELECT public.assign_site_supervisor(11, 2)")));
const moved = await as(SUP, "SELECT id FROM public.sites");
check("after the move the supervisor sees only the new site", JSON.stringify(moved) === '[{"id":2}]', moved);
const hist2 = (await db.query("SELECT action FROM public.site_supervisor_history WHERE person_id = 11 ORDER BY id")).rows.map((r) => r.action);
check("move is audited", JSON.stringify(hist2) === '["assigned","site_changed"]', hist2);

// ---------------- Remove ----------------
check("HR removes the supervisor role", !err(await as(HR, "SELECT public.remove_site_supervisor(11)")));
const after = (await db.query(`SELECT allowed_sub_modules FROM public.profiles WHERE id = '${SUP}'`)).rows[0];
check("supervisor screens are taken away, login kept", JSON.stringify(after.allowed_sub_modules) === "[]", after);
check("supervisor row removed", (await db.query("SELECT 1 FROM public.site_supervisor_logins")).rows.length === 0);

// ---------------- Rollback ----------------
const down = read("supabase/rollbacks/20261127150000_site_employee_email_and_supervisors_down.sql");
{
  const m = await db.exec(down).then(() => null, (e) => e.message);
  check("rollback applies", m === null, m);
}
check("after rollback HR still lists site logins", !err(await as(HR, "SELECT * FROM public.list_site_employee_logins()")));
check("after rollback the directory view works", !err(await as(HR, "SELECT * FROM public.hr_people_directory")));
{
  const m = await db.exec(up).then(() => null, (e) => e.message);
  check("migration re-applies after rollback", m === null, m);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

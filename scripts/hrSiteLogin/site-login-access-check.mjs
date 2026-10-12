/**
 * PGlite check (in-memory, never touches the real database) for
 * 20261012210000_hr_site_login_page_access.sql: anyone who can open HR People Management
 * can create site employee logins, and the rollback restores the old rule.
 * Run: node scripts/hrSiteLogin/site-login-access-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8").replace(/NOTIFY pgrst[^;]*;/g, "");
const up = read("supabase/migrations/20261012210000_hr_site_login_page_access.sql");
const down = read("supabase/rollbacks/20261012210000_hr_site_login_page_access_down.sql");

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};

const HR_IFSPL = "00000000-0000-0000-0000-000000000001";
const HR_SITE = "00000000-0000-0000-0000-000000000002";
const PM_SCREEN_SITE = "00000000-0000-0000-0000-000000000003";
const OTHER_HR_SCREEN = "00000000-0000-0000-0000-000000000004";
const SALES = "00000000-0000-0000-0000-000000000005";
const ADMIN = "00000000-0000-0000-0000-000000000006";

const db = new PGlite();
await db.exec(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    END IF;
  END $$;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, team text, employee_code text,
    allowed_modules jsonb DEFAULT '[]', allowed_sub_modules jsonb DEFAULT '[]');
  CREATE TABLE public.people (id bigserial PRIMARY KEY, unique_code text, is_active boolean DEFAULT true);
  CREATE TABLE public.admin_ifsp_employee_master (employee_code text);
  CREATE FUNCTION public.norm_emp_code(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim(coalesce(t, ''))) $$;
  CREATE FUNCTION public.normalize_erp_role(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(lower(btrim(coalesce(t, ''))), '[\\s-]+', '_', 'g') $$;
  CREATE FUNCTION public.normalize_erp_module_key(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE lower(btrim(coalesce(raw, ''))) WHEN 'dahej-hr' THEN 'hr' ELSE lower(btrim(coalesce(raw, ''))) END $$;
  CREATE FUNCTION public.jsonb_text_array(src jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN jsonb_typeof(src) = 'array' THEN src ELSE '[]'::jsonb END $$;
  CREATE FUNCTION public.current_user_is_site_employee_login() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.profiles pr JOIN public.people pe ON public.norm_emp_code(pe.unique_code) = public.norm_emp_code(pr.employee_code)
      WHERE pr.id = auth.uid() AND public.normalize_erp_role(pr.role) NOT IN ('admin', 'super_admin', 'super_admin_pro')
        AND NOT EXISTS (SELECT 1 FROM public.admin_ifsp_employee_master em WHERE public.norm_emp_code(em.employee_code) = public.norm_emp_code(pr.employee_code))
    ) $$;
  INSERT INTO public.admin_ifsp_employee_master VALUES ('IF100');
  INSERT INTO public.people (unique_code) VALUES ('S200'), ('S300'), ('S400');
  INSERT INTO public.profiles (id, role, team, employee_code, allowed_modules, allowed_sub_modules) VALUES
    ('${HR_IFSPL}', 'executive', 'HR', 'IF100', '[]', '[]'),
    ('${HR_SITE}', 'manager', 'HR', 'S200', '[]', '[]'),
    ('${PM_SCREEN_SITE}', 'executive', 'Operations', 'S300', '[]', '["hr.people-management"]'),
    ('${OTHER_HR_SCREEN}', 'executive', 'Operations', 'S400', '[]', '["hr.site-attendance"]'),
    ('${SALES}', 'executive', 'Sales', 'X1', '[]', '[]'),
    ('${ADMIN}', 'admin', 'Administration', 'X2', '[]', '[]');
`);

const OLD = `
  CREATE OR REPLACE FUNCTION public.current_user_can_manage_site_logins() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
`;
await db.exec(OLD);
await db.exec(down);

const can = async (uid) => {
  await db.exec(`SET test.uid = '${uid}'`);
  const r = (await db.query("SELECT public.current_user_can_manage_site_logins() AS ok")).rows[0].ok;
  await db.exec("RESET test.uid");
  return r;
};

check("before: HR user whose code is in the site people list is refused", (await can(HR_SITE)) === false);
check("before: IFSPL HR user is allowed", (await can(HR_IFSPL)) === true);

check("migration applies", (await db.exec(up).then(() => null, (e) => e.message)) === null);
check("migration is re-runnable", (await db.exec(up).then(() => null, (e) => e.message)) === null);
check("IFSPL HR user can manage site logins", (await can(HR_IFSPL)) === true);
check("HR team user whose code is in the site people list can now manage", (await can(HR_SITE)) === true);
check("user given the People Management screen can manage", (await can(PM_SCREEN_SITE)) === true);
check("user with another HR screen only still cannot manage", (await can(OTHER_HR_SCREEN)) === false);
check("user without HR access cannot manage", (await can(SALES)) === false);
check("admin role can manage", (await can(ADMIN)) === true);

check("rollback applies", (await db.exec(down).then(() => null, (e) => e.message)) === null);
check("after rollback the site-list HR user is refused again", (await can(HR_SITE)) === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

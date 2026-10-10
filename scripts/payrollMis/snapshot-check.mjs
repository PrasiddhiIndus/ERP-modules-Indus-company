/**
 * Checks for the payroll MIS migrations (in-memory Postgres; never touches a real database):
 *   20261010120000_payroll_mis_foundation.sql
 *   20261010120100_payroll_mis_snapshot.sql
 * against the real salary month lock (20261005220000_admin_salary_month_run_lock.sql).
 *
 *   node scripts/payrollMis/snapshot-check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8").replace(/NOTIFY pgrst[^;]*;/g, "");
const lockMigration = read("supabase/migrations/20261005220000_admin_salary_month_run_lock.sql");
const foundation = read("supabase/migrations/20261010120000_payroll_mis_foundation.sql");
const snapshot = read("supabase/migrations/20261010120100_payroll_mis_snapshot.sql");
const snapshotDown = read("supabase/rollbacks/20261010120100_payroll_mis_snapshot_down.sql");
const foundationDown = read("supabase/rollbacks/20261010120000_payroll_mis_foundation_down.sql");

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message || String(e);
  }
};

const AUG = "00000000-0000-0000-0000-00000000a008";
const SEP = "00000000-0000-0000-0000-00000000a009";

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"email":"hr@x"}'::jsonb $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION public.admin_salary_user_has_access() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION public.admin_employee_flags_can_edit() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

  CREATE TABLE public.admin_ifsp_employee_master (
    id bigint PRIMARY KEY, employee_id text, full_name text, designation text, department text,
    location text, employment_type text, date_of_joining date, date_of_leaving date, date_of_relieving date,
    status_reason text, uan_no text, esic_no text);
  CREATE TABLE public.admin_salary_month_runs (
    id uuid PRIMARY KEY, pay_year int, pay_month int, month_key text UNIQUE, month_days int,
    status text, total_gross numeric, total_deductions numeric, total_net numeric, summary_json jsonb);
  CREATE TABLE public.admin_salary_month_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, employee_master_id bigint,
    employee_code text, employee_name text, designation text, date_of_joining date,
    present_days numeric, total_days numeric, pf_basic numeric, pf_earned_basic numeric,
    basic_full numeric, basic_earned numeric, hra_full numeric, hra_earned numeric,
    special_full numeric, special_allowance numeric, gross_wages numeric,
    emp_pf numeric, emp_esic numeric, pt_amount numeric, loan numeric, sal_adv numeric,
    unpaid_paid numeric, tds numeric, total_ded numeric, net_salary numeric,
    computed_json jsonb, source_snapshot_json jsonb);
  CREATE TABLE public.admin_salary_structures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_master_id bigint UNIQUE,
    er_pf_monthly numeric, er_esic_monthly numeric, gratuity_monthly numeric, leave_encash_monthly numeric,
    mediclaim_monthly numeric, bonus_monthly numeric, special_perf_bonus_monthly numeric,
    ex_gratia_monthly numeric, stat_bonus_monthly numeric, ctc_monthly numeric,
    wef_date date, revision_type text);
`);
await db.exec(lockMigration);
const lockDefBefore = (await db.query(
  `SELECT pg_get_functiondef('public.admin_salary_lock_month_run(uuid)'::regprocedure) AS d`)).rows[0].d;

await db.exec(`
  INSERT INTO public.admin_ifsp_employee_master
    (id, employee_id, full_name, designation, department, location, employment_type, date_of_joining, status_reason)
  VALUES
    (1, 'E001', 'Asha', 'Engineer', 'Training', 'Vadodara', 'permanent', '2024-01-10', NULL),
    (2, 'E002', 'Bhavin', 'Technician', 'R&M', 'Dahej', 'permanent', '2026-09-16', NULL);
  INSERT INTO public.admin_salary_structures
    (employee_master_id, er_pf_monthly, er_esic_monthly, gratuity_monthly, leave_encash_monthly, mediclaim_monthly,
     bonus_monthly, special_perf_bonus_monthly, ex_gratia_monthly, ctc_monthly, wef_date, revision_type)
  VALUES
    (1, 1700, 0, 1000, 400, 300, 0, 0, 500, 34000, '2026-09-01', 'increment'),
    (2, 1560, 650, 600, 0, 0, 200, 100, 0, 22000, '2026-09-16', 'initial');
  INSERT INTO public.admin_salary_month_runs (id, pay_year, pay_month, month_key, month_days, status, total_gross, total_deductions, total_net)
  VALUES ('${AUG}', 2026, 8, '2026-08', 31, 'processed', 28000, 2000, 26000),
         ('${SEP}', 2026, 9, '2026-09', 30, 'processed', 40000, 3500, 36500);
  INSERT INTO public.admin_salary_month_lines
    (run_id, employee_master_id, employee_code, employee_name, present_days, total_days, pf_basic, pf_earned_basic,
     basic_full, basic_earned, hra_full, hra_earned, special_full, special_allowance, gross_wages,
     emp_pf, emp_esic, pt_amount, tds, total_ded, net_salary, computed_json)
  VALUES
    ('${AUG}', 1, 'E001', 'Asha', 31, 31, 13000, 13000, 13000, 13000, 6500, 6500, 8500, 8500, 28000,
     1560, 0, 200, 240, 2000, 26000, '{"annexure":{"er_pf_full":1690}}'),
    ('${SEP}', 1, 'E001', 'Asha', 30, 30, 15000, 15000, 15000, 15000, 7500, 7500, 7500, 7500, 30000,
     1800, 0, 200, 500, 2500, 27500,
     '{"perf_incentive_earned":1000,"extra_earnings":[{"earned":250}],"annexure":{"er_pf_full":1800}}'),
    ('${SEP}', 2, 'E002', 'Bhavin', 15, 30, 10000, 5000, 10000, 5000, 5000, 2500, 5000, 2500, 10000,
     600, 75, 0, 0, 1000, 9000, '{}');
`);

// August is locked before the MIS migrations exist (history case).
await db.exec(`SELECT public.admin_salary_lock_month_run('${AUG}')`);

await db.exec(foundation);
await db.exec(snapshot);

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (sql, params = []) => (await db.query(sql, params)).rows;
const num = (v) => Number(v);
const snap = (month, emp) => one(
  `SELECT * FROM public.admin_payroll_mis_snapshot WHERE month_key = $1 AND employee_master_id = $2`, [month, emp]);

console.log("Existing lock function");
const lockDefAfter = (await one(
  `SELECT pg_get_functiondef('public.admin_salary_lock_month_run(uuid)'::regprocedure) AS d`)).d;
check("lock function text unchanged by the MIS migrations", lockDefAfter === lockDefBefore);

console.log("\nOne-time build for months already locked");
check("August snapshot built at migration time", (await one(
  `SELECT count(*)::int AS n FROM public.admin_payroll_mis_snapshot WHERE month_key = '2026-08'`)).n === 1);
check("one-time build logged", (await one(
  `SELECT count(*)::int AS n FROM public.admin_payroll_mis_job_log WHERE job = 'snapshot_initial' AND ok`)).n === 1);
check("unlocked September has no snapshot yet", (await one(
  `SELECT count(*)::int AS n FROM public.admin_payroll_mis_snapshot WHERE month_key = '2026-09'`)).n === 0);

console.log("\nLock September → snapshot");
await db.exec(`UPDATE public.admin_payroll_departments SET vertical_code = 'training' WHERE department = 'Training'`);
await db.exec(`INSERT INTO public.admin_payroll_employee_tags (employee_master_id, vertical_code, grade, work_state)
               VALUES (2, 'rm', 'G3', 'GJ')`);
await db.exec(`SELECT public.admin_salary_lock_month_run('${SEP}')`);
const a = await snap("2026-09", 1);
const b = await snap("2026-09", 2);
check("two employee rows", (await one(
  `SELECT count(*)::int AS n FROM public.admin_payroll_mis_snapshot WHERE month_key = '2026-09'`)).n === 2);
check("full month: factor 1", num(a.proration_factor) === 1);
check("employer PF from the line CTC breakdown (1800, not CTC record 1700)", num(a.er_pf) === 1800, a.er_pf);
check("gratuity = 1 × 1000", num(a.gratuity_prov) === 1000);
check("bonus provision = ex-gratia + bonus + special performance bonus (500)", num(a.bonus_prov) === 500);
check("leave encashment provision 400", num(a.leave_encash_prov) === 400);
check("insurance from CTC mediclaim 300", num(a.insurance) === 300);
check("incentive = performance incentive + extra earnings (1250)", num(a.incentive) === 1250);
check("total CTC = gross + employer cost (30000 + 4000)", num(a.total_ctc) === 34000, a.total_ctc);
check("vertical from department master when untagged", a.vertical_code === "training");
check("increment in the month flagged", a.ctc_revised_in_month === true);
check("half month: factor 0.5", num(b.proration_factor) === 0.5);
check("employer PF = 0.5 × CTC record 1560 (no line breakdown)", num(b.er_pf) === 780, b.er_pf);
check("employer ESIC = 0.5 × 650", num(b.er_esi) === 325, b.er_esi);
check("gratuity = 0.5 × 600", num(b.gratuity_prov) === 300);
check("bonus = 0.5 × (200 + 100)", num(b.bonus_prov) === 150);
check("vertical tag wins; grade and state from tags", b.vertical_code === "rm" && b.grade === "G3" && b.work_state === "GJ");
check("LOP days = 15", num(b.lop_days) === 15);
check("ESI wage = gross when employee ESIC deducted", num(b.esi_wage) === 10000);
check("PF wage = earned PF basic", num(b.pf_wage) === 5000);
check("initial CTC is not an increment", b.ctc_revised_in_month === false);

console.log("\nStatutory payments");
const pay = async () => all(`SELECT statute, state, amount, due_date::text AS due, paid_on, amount_changed_after_payment AS changed
                             FROM public.admin_payroll_statutory_payments WHERE wage_month = '2026-09' ORDER BY statute, state`);
let rows = await pay();
const find = (statute, state) => rows.find((r) => r.statute === statute && r.state === state);
check("PF for state ALL = 1800 + 1800", num(find("PF", "ALL")?.amount) === 3600, rows);
check("PF for GJ = 600 + 780", num(find("PF", "GJ")?.amount) === 1380, rows);
check("ESI for GJ = 75 + 325", num(find("ESI", "GJ")?.amount) === 400);
check("TDS row 500, due 7 Oct", num(find("TDS", "ALL")?.amount) === 500 && find("TDS", "ALL")?.due === "2026-10-07");
check("PF due 15 Oct", find("PF", "ALL")?.due === "2026-10-15");
check("no zero-amount rows", rows.every((r) => num(r.amount) > 0));
const countBefore = rows.length;

console.log("\nPaid needs challan");
const pfId = (await one(`SELECT id FROM public.admin_payroll_statutory_payments WHERE wage_month='2026-09' AND statute='PF' AND state='ALL'`)).id;
check("mark paid without challan ref is refused", !!(await throws(() =>
  db.query(`SELECT public.admin_payroll_mis_mark_paid($1, '2026-10-12', '  ')`, [pfId]))));
check("direct update with paid_on but no challan is refused by the table", !!(await throws(() =>
  db.query(`UPDATE public.admin_payroll_statutory_payments SET paid_on = '2026-10-12' WHERE id = $1`, [pfId]))));
await db.query(`SELECT public.admin_payroll_mis_mark_paid($1, '2026-10-12', 'CH-1001')`, [pfId]);
check("mark paid with challan ref works", (await one(
  `SELECT challan_ref FROM public.admin_payroll_statutory_payments WHERE id = $1`, [pfId])).challan_ref === "CH-1001");

console.log("\nUnlock, change, re-lock → replace");
await db.exec(`SELECT public.admin_salary_unlock_month_run('${SEP}', 'correct PF deduction')`);
await db.exec(`UPDATE public.admin_salary_month_lines SET emp_pf = 1900, tds = 0 WHERE run_id = '${SEP}' AND employee_master_id = 1`);
await db.exec(`SELECT public.admin_salary_lock_month_run('${SEP}')`);
check("still two snapshot rows after re-lock", (await one(
  `SELECT count(*)::int AS n FROM public.admin_payroll_mis_snapshot WHERE month_key = '2026-09'`)).n === 2);
check("snapshot shows the new deduction", num((await snap("2026-09", 1)).emp_pf) === 1900);
rows = await pay();
check("no duplicate payment rows (unique wage month + statute + state)", rows.length === countBefore, rows);
const pf = find("PF", "ALL");
check("paid PF keeps paid date and is flagged as changed after payment", !!pf.paid_on && pf.changed === true && num(pf.amount) === 3700, pf);
check("TDS that dropped out is set to 0, not duplicated", num(find("TDS", "ALL")?.amount) === 0);

console.log("\nInsurance premium override");
await db.exec(`INSERT INTO public.admin_payroll_insurance_premiums (policy_name, policy_start, policy_end, annual_premium, spread)
               VALUES ('GMC 2026', '2026-04-01', '2027-03-31', 12000.10, 'twelve')`);
await db.exec(`SELECT public.admin_payroll_mis_rebuild_snapshot('${SEP}')`);
const ia = await snap("2026-09", 1);
const ib = await snap("2026-09", 2);
check("covered employee carries the monthly premium (12000.10 / 12 = 1000.01)", num(ia.insurance) === 1000.01, ia.insurance);
check("employee without mediclaim in CTC gets 0", num(ib.insurance) === 0 && ib.insurance_source === "premium");

console.log("\nSnapshot failure never blocks the lock");
await db.exec(`SELECT public.admin_salary_unlock_month_run('${SEP}', 'test failure path')`);
await db.exec(`ALTER TABLE public.admin_payroll_mis_snapshot RENAME TO admin_payroll_mis_snapshot_x`);
const lockErr = await throws(() => db.exec(`SELECT public.admin_salary_lock_month_run('${SEP}')`));
check("lock succeeds while the snapshot is broken", lockErr === null, lockErr);
check("month is locked", (await one(`SELECT is_locked FROM public.admin_salary_month_runs WHERE id = '${SEP}'`)).is_locked === true);
check("failure written to the job log", (await one(
  `SELECT ok FROM public.admin_payroll_mis_job_log WHERE run_id = '${SEP}' ORDER BY id DESC LIMIT 1`)).ok === false);
await db.exec(`ALTER TABLE public.admin_payroll_mis_snapshot_x RENAME TO admin_payroll_mis_snapshot`);
await db.exec(`SELECT public.admin_payroll_mis_rebuild_snapshot('${SEP}')`);
check("manual rebuild works afterwards", (await one(
  `SELECT count(*)::int AS n FROM public.admin_payroll_mis_snapshot WHERE month_key = '2026-09'`)).n === 2);

console.log("\nReport reads");
const months = await all(`SELECT month_key, snapshot_count FROM public.admin_payroll_mis_months()`);
check("both locked months listed newest first", months.map((m) => m.month_key).join(",") === "2026-09,2026-08");
const reg = await all(`SELECT * FROM public.admin_payroll_mis_register_totals('2026-09', '2026-09')`);
check("register totals = sum of lines", num(reg[0].gross) === 40000 && num(reg[0].net_pay) === 36500);
const unlockedRows = async () => (await all(`SELECT * FROM public.admin_payroll_mis_rows('2026-08', '2026-09')`)).length;
check("rows for locked months", (await unlockedRows()) === 3);
await db.exec(`SELECT public.admin_salary_unlock_month_run('${AUG}', 'reopen august')`);
check("unlocked month disappears from reports", (await unlockedRows()) === 2);

console.log("\nLines guard still blocks edits on a locked month");
check("locked September lines cannot be edited", !!(await throws(() =>
  db.exec(`UPDATE public.admin_salary_month_lines SET tds = 1 WHERE run_id = '${SEP}'`))));

console.log("\nRollback");
await db.exec(snapshotDown);
await db.exec(foundationDown);
const left = (await one(`SELECT count(*)::int AS n FROM pg_class WHERE relname LIKE 'admin_payroll_%'`)).n;
check("all MIS tables removed", left === 0, left);
const lockAgain = await throws(() => db.exec(`SELECT public.admin_salary_lock_month_run('${AUG}')`));
check("lock still works after rollback", lockAgain === null, lockAgain);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

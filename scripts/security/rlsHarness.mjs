/**
 * In-memory Postgres (PGlite) with the real Projects quotation / R&M enquiry migrations.
 * Used to measure what each profile can do on the C2 tables before and after
 * 20261117120000_secure_projects_quotations_rm_enquiries_rls.sql. Never touches a real database.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = `${ROOT}/supabase/migrations`;
const ROLLBACKS = `${ROOT}/supabase/rollbacks`;

export const C2_MIGRATION = '20261117120000_secure_projects_quotations_rm_enquiries_rls.sql';
export const C2_ROLLBACK = '20261117120000_secure_projects_quotations_rm_enquiries_rls_down.sql';

const read = (dir, name) => readFileSync(`${dir}/${name}`, 'utf8');
export const readMigration = (name) => read(MIGRATIONS, name);
export const readRollback = (name) => read(ROLLBACKS, name);

/** The history-table block of 20261023120000 (the rest of that file needs the whole enquiry schema). */
function historyTableSql() {
  const sql = readMigration('20261023120000_projects_enquiry_edit_approval_receipt_lock.sql');
  const start = sql.indexOf('create table if not exists projects.enquiry_field_change_history');
  const endMarker = 'grant all on projects.enquiry_field_change_history to service_role;';
  const end = sql.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error('enquiry_field_change_history block not found');
  return sql.slice(start, end + endMarker.length);
}

export const SEED = {
  quotation: '11111111-1111-4111-8111-111111111111',
  row: '22222222-2222-4222-8222-222222222222',
  enquiry: '33333333-3333-4333-8333-333333333333',
  rmEnquiry: '44444444-4444-4444-8444-444444444444',
  author: '55555555-5555-4555-8555-555555555555',
};

/** Database in the state production is in today (historical migrations only). */
export async function buildDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      role text,
      team text,
      allowed_modules jsonb,
      allowed_sub_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_active boolean DEFAULT true,
      username text,
      email text
    );
    CREATE SCHEMA projects;
    CREATE TABLE projects.enquiries (id uuid PRIMARY KEY);
  `);
  await db.exec(readMigration('20261022120000_projects_quotation_maker.sql'));
  await db.exec(historyTableSql());
  await db.exec(readMigration('20261102180000_rm_schema_enquiries.sql'));
  await db.exec(`
    INSERT INTO auth.users (id) VALUES ('${SEED.author}');
    INSERT INTO projects.quotations (id, offer_no) VALUES ('${SEED.quotation}', 'SEED-1');
    INSERT INTO projects.quotation_rows (id, quotation_id, row_type) VALUES ('${SEED.row}', '${SEED.quotation}', 'item');
    INSERT INTO projects.quotation_maker_audit (quotation_id, action, actor_id, actor_name)
      VALUES ('${SEED.quotation}', 'seed', '${SEED.author}', 'Seed Author');
    INSERT INTO projects.enquiries (id) VALUES ('${SEED.enquiry}');
    INSERT INTO projects.enquiry_field_change_history (enquiry_id, field_key) VALUES ('${SEED.enquiry}', 'client');
    INSERT INTO rm.enquiries (id, client) VALUES ('${SEED.rmEnquiry}', 'Seed Client');
  `);
  return db;
}

export const applyMigration = (db) => db.exec(readMigration(C2_MIGRATION));
export const applyRollback = (db) => db.exec(readRollback(C2_ROLLBACK));

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const jsonLit = (v) => (v == null ? 'NULL' : `${lit(JSON.stringify(v))}::jsonb`);

export async function upsertProfile(db, p) {
  await db.exec(`
    INSERT INTO public.profiles (id, role, team, allowed_modules, allowed_sub_modules, is_active, username, email)
    VALUES (${lit(p.id)}, ${lit(p.role)}, ${lit(p.team)}, ${jsonLit(p.allowed_modules)},
            COALESCE(${jsonLit(p.allowed_sub_modules)}, '[]'::jsonb), ${p.is_active === false ? 'false' : 'true'},
            ${lit(p.username)}, ${lit(p.email)})
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, team = EXCLUDED.team,
      allowed_modules = EXCLUDED.allowed_modules, allowed_sub_modules = EXCLUDED.allowed_sub_modules,
      is_active = EXCLUDED.is_active, username = EXCLUDED.username, email = EXCLUDED.email;
  `);
}

/** Run one statement as an authenticated user inside a rolled-back transaction. */
async function tryAs(db, uid, sql) {
  await db.exec(`BEGIN; SELECT set_config('test.uid', ${lit(uid)}, true); SET LOCAL ROLE authenticated;`);
  try {
    const res = await db.query(sql);
    const n = Number(res.rows?.[0]?.n ?? res.affectedRows ?? 0);
    return { ok: true, n };
  } catch (err) {
    return { ok: false, n: 0, error: err.message };
  } finally {
    await db.exec('ROLLBACK;');
  }
}

const count = (from) => `SELECT count(*)::int AS n FROM ${from}`;
const affected = (stmt) => `WITH x AS (${stmt} RETURNING 1) SELECT count(*)::int AS n FROM x`;

/** Operations measured per table. A permission is "granted" when the statement succeeds and touches a row. */
export const OPERATIONS = {
  'projects.quotations': {
    select: count('projects.quotations'),
    insert: affected(`INSERT INTO projects.quotations (offer_no) VALUES ('probe')`),
    update: affected(`UPDATE projects.quotations SET offer_status = offer_status WHERE id = '${SEED.quotation}'`),
    delete: affected(`DELETE FROM projects.quotations WHERE id = '${SEED.quotation}'`),
  },
  'projects.quotation_rows': {
    select: count('projects.quotation_rows'),
    insert: affected(`INSERT INTO projects.quotation_rows (quotation_id, row_type) VALUES ('${SEED.quotation}', 'item')`),
    update: affected(`UPDATE projects.quotation_rows SET sort_order = sort_order WHERE id = '${SEED.row}'`),
    delete: affected(`DELETE FROM projects.quotation_rows WHERE id = '${SEED.row}'`),
  },
  'projects.quotation_maker_audit': {
    select: count('projects.quotation_maker_audit'),
    insert: affected(`INSERT INTO projects.quotation_maker_audit (quotation_id, action) VALUES ('${SEED.quotation}', 'probe')`),
    update: affected(`UPDATE projects.quotation_maker_audit SET action = 'tampered'`),
    delete: affected(`DELETE FROM projects.quotation_maker_audit`),
  },
  'projects.enquiry_field_change_history': {
    select: count('projects.enquiry_field_change_history'),
    insert: affected(`INSERT INTO projects.enquiry_field_change_history (enquiry_id, field_key) VALUES ('${SEED.enquiry}', 'x')`),
    update: affected(`UPDATE projects.enquiry_field_change_history SET field_key = 'tampered'`),
    delete: affected(`DELETE FROM projects.enquiry_field_change_history`),
  },
  'rm.enquiries': {
    select: count('rm.enquiries'),
    insert: affected(`INSERT INTO rm.enquiries (client) VALUES ('probe')`),
    update: affected(`UPDATE rm.enquiries SET remarks = remarks WHERE id = '${SEED.rmEnquiry}'`),
    delete: affected(`DELETE FROM rm.enquiries WHERE id = '${SEED.rmEnquiry}'`),
  },
};

/** { 'projects.quotations': { select: true, ... }, ... } for one profile id. */
export async function measureAccess(db, uid) {
  const out = {};
  for (const [table, ops] of Object.entries(OPERATIONS)) {
    out[table] = {};
    for (const [op, sql] of Object.entries(ops)) {
      const r = await tryAs(db, uid, sql);
      out[table][op] = r.ok && r.n > 0;
    }
  }
  return out;
}

export { tryAs };

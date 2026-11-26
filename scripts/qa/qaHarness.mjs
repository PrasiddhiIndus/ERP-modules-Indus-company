/**
 * In-memory Postgres (PGlite) harness for QA schema business-rule tests.
 * Never touches a real database.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = '20261126150000_qa_schema.sql';

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

export const USERS = {
  lead: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  tester: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  developer: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  po: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  bo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  viewer: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
  outsider: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
};

function readMigrationSql() {
  let sql = readFileSync(`${ROOT}/supabase/migrations/${MIGRATION}`, 'utf8');
  // PGlite may lack pgcrypto; provide a deterministic digest stub instead.
  sql = sql.replace(
    /create extension if not exists pgcrypto\s*;/i,
    `
    CREATE OR REPLACE FUNCTION digest(data text, algo text) RETURNS bytea
    LANGUAGE sql IMMUTABLE AS $digest$
      SELECT decode(md5($1 || $2) || md5($2 || $1), 'hex');
    $digest$;
    `
  );
  return sql;
}

export async function buildQaDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

    CREATE TABLE auth.users (id uuid PRIMARY KEY);

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id),
      role text,
      team text,
      allowed_modules jsonb,
      allowed_sub_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_active boolean DEFAULT true,
      username text,
      email text
    );
  `);

  await db.exec(readMigrationSql());

  // Seed auth + profiles + members (as table owner / bypass RLS)
  for (const [key, id] of Object.entries(USERS)) {
    if (key === 'outsider') {
      await db.exec(`INSERT INTO auth.users (id) VALUES ('${id}');`);
      await db.exec(`
        INSERT INTO public.profiles (id, username, email, is_active)
        VALUES ('${id}', 'Outsider', 'out@example.com', true);
      `);
      continue;
    }
    const role =
      key === 'lead'
        ? 'qa_lead'
        : key === 'tester'
          ? 'tester'
          : key === 'developer'
            ? 'developer'
            : key === 'po'
              ? 'product_owner'
              : key === 'bo'
                ? 'business_owner'
                : 'viewer';
    const name = key;
    await db.exec(`INSERT INTO auth.users (id) VALUES ('${id}');`);
    await db.exec(`
      INSERT INTO public.profiles (id, username, email, is_active)
      VALUES ('${id}', ${lit(name)}, ${lit(`${key}@example.com`)}, true);
    `);
    await db.exec(`
      INSERT INTO qa.members (user_id, full_name, qa_role, active)
      VALUES ('${id}', ${lit(name)}, '${role}'::qa.member_role, true);
    `);
  }

  return db;
}

async function withUserSession(db, uid, sql, { commit }) {
  try {
    await db.exec(`BEGIN`);
    // is_local=true is OK inside an open transaction (survives until COMMIT/ROLLBACK).
    await db.exec(`SELECT set_config('request.jwt.claim.sub', ${lit(uid)}, true)`);
    await db.exec(
      `SELECT set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: uid, role: 'authenticated' }))}, true)`
    );
    await db.exec(`SET LOCAL ROLE authenticated`);
    const result = await db.query(sql);
    if (commit) await db.exec(`COMMIT`);
    else await db.exec(`ROLLBACK`);
    return { ok: true, error: null, rows: result.rows || [], fields: result.fields };
  } catch (err) {
    try {
      await db.exec(`ROLLBACK`);
    } catch {
      /* ignore */
    }
    return { ok: false, error: String(err?.message || err), rows: [] };
  }
}

/** Run SQL as a given user inside a rolled-back transaction. Returns { ok, error, rows }. */
export async function asUser(db, uid, sql) {
  return withUserSession(db, uid, sql, { commit: false });
}

/** Persist SQL as a given user (commits). */
export async function asUserCommit(db, uid, sql) {
  return withUserSession(db, uid, sql, { commit: true });
}

/** Run as table owner (no RLS role). */
export async function asOwner(db, sql) {
  try {
    const result = await db.query(sql);
    return { ok: true, error: null, rows: result.rows || [] };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), rows: [] };
  }
}

/**
 * PGlite check for enquiry_receipt_date lock in
 * 20261023120000_projects_enquiry_edit_approval_receipt_lock.sql
 * Run: node scripts/projectsEnquiry/enquiry-receipt-date-lock-check.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sql = readFileSync(
  `${ROOT}/supabase/migrations/20261023120000_projects_enquiry_edit_approval_receipt_lock.sql`,
  'utf8'
).replace(/\r\n/g, '\n');
// Only the receipt-date lock fragment (skip RPCs / FK tables that need full schema).
const marker = '-- Field change history (written whenever enquiry data actually changes)';
const lockOnly = sql.includes(marker) ? sql.slice(0, sql.indexOf(marker)) : sql;

let passed = 0;
let failed = 0;
const check = (label, ok, extra) => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ''}`);
};

const db = new PGlite();
await db.exec(`
  CREATE SCHEMA projects;
  CREATE TABLE projects.enquiries (id int PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}'::jsonb);
  INSERT INTO projects.enquiries VALUES
    (1, '{"enquiry_receipt_date":"2026-10-01","client_name":"A"}'),
    (2, '{"client_name":"B"}');
`);
const applyErr = await db.exec(lockOnly).then(() => null, (e) => e.message || String(e));
if (applyErr) console.error('apply error:', applyErr);
check('lock fragment applies', applyErr === null);

await db.exec(`UPDATE projects.enquiries SET data = '{"enquiry_receipt_date":"2026-12-31","client_name":"A2"}' WHERE id = 1`);
let d = (await db.query('SELECT data FROM projects.enquiries WHERE id = 1')).rows[0].data;
check('saved receipt date is kept', d.enquiry_receipt_date === '2026-10-01', d);
check('other fields still update', d.client_name === 'A2', d);

await db.exec(`UPDATE projects.enquiries SET data = '{"enquiry_receipt_date":"2026-10-05","client_name":"B"}' WHERE id = 2`);
check(
  'date can be set when never saved',
  (await db.query('SELECT data FROM projects.enquiries WHERE id = 2')).rows[0].data.enquiry_receipt_date === '2026-10-05'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

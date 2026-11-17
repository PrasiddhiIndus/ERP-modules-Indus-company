#!/usr/bin/env node
/**
 * CI check — fails when a migration adds an "open" RLS policy for app users:
 *   USING (true) / WITH CHECK (true) (also 1 = 1) on a policy that applies to
 *   authenticated, anon or public (or has no TO clause).
 *
 *   npm run security:rls                  check (exit 1 on new open policies)
 *   npm run security:rls -- --update-baseline   record the current findings as the baseline
 *
 * Existing findings are listed in rls-open-policy-baseline.json (grandfathered; fix them over time).
 * Read-only reference / lookup tables may be allow-listed in rls-open-policy-allowlist.json
 * (FOR SELECT only, with a reason). Policies for service_role only are ignored.
 * PROTECTED_TABLES may never get an open policy, even through the baseline or allowlist.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const MIGRATIONS_DIR = `${ROOT}/supabase/migrations`;
const BASELINE_FILE = `${HERE}/rls-open-policy-baseline.json`;
const ALLOWLIST_FILE = `${HERE}/rls-open-policy-allowlist.json`;

/** Tables secured by fix C2 — an open policy here is always an error. */
export const PROTECTED_TABLES = new Set([
  'projects.quotations',
  'projects.quotation_rows',
  'projects.quotation_maker_audit',
  'projects.enquiry_field_change_history',
  'rm.enquiries',
]);

const APP_ROLES = new Set(['authenticated', 'anon', 'public']);

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const unquote = (s) => String(s || '').replace(/"/g, '').trim().toLowerCase();

/** Expression inside the balanced parentheses that start at `open` (index of "("). */
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

function clauseExpr(stmt, keywordRe) {
  const m = keywordRe.exec(stmt);
  if (!m) return null;
  const open = stmt.indexOf('(', m.index + m[0].length - 1);
  return open < 0 ? null : balanced(stmt, open);
}

/** True for expressions that let every (logged-in) user through. */
export function isAlwaysTrue(expr) {
  if (expr == null) return false;
  const e = expr.toLowerCase().replace(/[\s()]/g, '');
  return (
    e === 'true' ||
    e === "'true'" ||
    e === "'t'" ||
    e === '1=1' ||
    e === 'true::boolean' ||
    // "any logged-in user" — just as open for an ERP where every employee can log in
    e === "auth.role='authenticated'" ||
    e === "auth.role='authenticated'::text" ||
    e === 'auth.uidisnotnull' ||
    e === 'selectauth.uidisnotnull' ||
    e === "selectauth.role='authenticated'"
  );
}

/** Every CREATE POLICY statement in one SQL text. */
export function parsePolicies(sql) {
  const text = stripComments(sql);
  const out = [];
  // Names may hold format() placeholders (%s / %I) when the policy is created with EXECUTE format(...).
  const re = /create\s+policy\s+("[^"]+"|[\w$%]+)\s+on\s+((?:"[^"]+"|[\w$%]+)(?:\s*\.\s*(?:"[^"]+"|[\w$%]+))?)/gi;
  let m;
  while ((m = re.exec(text))) {
    const end = text.indexOf(';', m.index);
    const stmt = text.slice(m.index, end < 0 ? text.length : end);
    const tableRaw = unquote(m[2]).replace(/\s+/g, '');
    const table = tableRaw.includes('.') ? tableRaw : `public.${tableRaw}`;
    const cmd = (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(stmt)?.[1] || 'all').toLowerCase();
    const toMatch = /\bto\s+([\w\s",]+?)(?=\s+using\b|\s+with\s+check\b|$)/i.exec(stmt);
    const roles = toMatch ? toMatch[1].split(',').map(unquote).filter(Boolean) : ['public'];
    const usingExpr = clauseExpr(stmt, /\busing\s*\(/i);
    const checkExpr = clauseExpr(stmt, /\bwith\s+check\s*\(/i);
    out.push({ name: unquote(m[1]), table, cmd, roles, usingExpr, checkExpr });
  }
  return out;
}

export function openPolicyFindings(file, sql) {
  return parsePolicies(sql)
    .filter((p) => p.roles.some((r) => APP_ROLES.has(r)))
    .filter((p) => isAlwaysTrue(p.usingExpr) || isAlwaysTrue(p.checkExpr))
    .map((p) => ({ ...p, file, id: `${file}::${p.table}::${p.name}` }));
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function evaluate(findings, baselineIds, allowlist) {
  const allowed = new Map((allowlist || []).map((a) => [String(a.table).toLowerCase(), a]));
  const errors = [];
  for (const f of findings) {
    if (PROTECTED_TABLES.has(f.table) && !baselineIds.has(f.id)) {
      errors.push(`${f.id}: open policy on protected table ${f.table}`);
      continue;
    }
    if (baselineIds.has(f.id)) continue;
    const allow = allowed.get(f.table);
    if (allow && f.cmd === 'select' && String(allow.reason || '').trim()) continue;
    errors.push(
      `${f.id}: ${f.cmd.toUpperCase()} policy for ${f.roles.join(', ')} uses ${isAlwaysTrue(f.usingExpr) ? 'USING (true)' : 'WITH CHECK (true)'}`
    );
  }
  return errors;
}

function main() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const findings = files.flatMap((f) => openPolicyFindings(f, readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8')));

  if (process.argv.includes('--update-baseline')) {
    const ids = [...new Set(findings.map((f) => f.id))].sort();
    writeFileSync(BASELINE_FILE, `${JSON.stringify({ note: 'Open RLS policies that existed before the CI check (grandfathered). Do not add to this list — scope new policies instead.', findings: ids }, null, 2)}\n`);
    console.log(`Baseline written: ${ids.length} existing open policies.`);
    return;
  }

  const baseline = new Set(readJson(BASELINE_FILE, { findings: [] }).findings || []);
  const allowlist = readJson(ALLOWLIST_FILE, { tables: [] }).tables || [];
  const errors = evaluate(findings, baseline, allowlist);
  if (errors.length) {
    console.error(`RLS policy check failed — ${errors.length} open polic${errors.length === 1 ? 'y' : 'ies'}:`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\nUse a scope check (e.g. public.current_user_can_access_module(...)) instead of true.');
    console.error(`Read-only lookup tables: add { "table", "reason" } to ${ALLOWLIST_FILE} (FOR SELECT only).`);
    process.exit(1);
  }
  console.log(`RLS policy check passed (${findings.length} grandfathered/allow-listed open policies, no new ones).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

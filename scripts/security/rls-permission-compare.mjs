/**
 * Before / after permission comparison for security fix C2 (Projects quotations, quotation audit,
 * enquiry change history, R&M enquiries).
 *
 *   npm run security:rls-compare -- [--out <dir>] [--profiles <file.json>]
 *
 * The report lists employee names / emails: it is written outside the repository
 * (default: <system temp>/rls-compare) and must not be committed.
 *
 * Without --profiles it reads public.profiles (read-only; only access columns) using SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY from .env.server. Every distinct access setup is then run through the real
 * SQL in an in-memory Postgres: historical migrations (BEFORE) → new migration (AFTER) → rollback.
 *
 * Exit code 1 when anyone who can open Projects / R&M pages today (or any Admin / Super Admin)
 * would lose access, when the JS scope rule disagrees with SQL, or when the rollback does not
 * restore the BEFORE state.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  getAccessibleModules,
  getAccessibleSubModulePaths,
  isPathAllowed,
  MODULE_PATH_PREFIXES,
} from '../../src/config/roles.js';
import { profileHasDataScope, isFullDataAccessRole } from '../../shared/erpDataScopes.mjs';
import { ROOT, buildDb, applyMigration, applyRollback, upsertProfile, measureAccess } from './rlsHarness.mjs';

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const outDir = resolve(argValue('--out') || `${tmpdir()}/rls-compare`);
const profilesFile = argValue('--profiles');

const ACCESS_COLUMNS = 'id, username, email, role, team, allowed_modules, allowed_sub_modules, is_active, module_access_pending';

async function loadProfiles() {
  if (profilesFile) return JSON.parse(readFileSync(profilesFile, 'utf8'));
  dotenv.config({ path: `${ROOT}/.env.server` });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.server');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('profiles').select(ACCESS_COLUMNS).order('id').range(from, from + 999);
    if (error) throw new Error(`profiles read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// What the UI lets each profile open today (src/config/roles.js route guards)
// ---------------------------------------------------------------------------
const PROJECT_PREFIXES = MODULE_PATH_PREFIXES.projects;
const RM_PREFIXES = MODULE_PATH_PREFIXES.commercialRm;
const RM_PAGES = [
  '/app/commercial/rm-mm-amc-iev/dashboard',
  '/app/commercial/rm-mm-amc-iev/manpower-management',
  '/app/commercial/rm-mm-amc-iev/internal-quotation',
  '/app/commercial/rm-mm-amc-iev/po-entry',
  '/app/commercial/rm-mm-amc-iev/contact-log',
  '/app/commercial/rm-mm-amc-iev/po-at-glance',
];

function frontendAccess(profile) {
  const modules = getAccessibleModules(profile);
  const subPaths = getAccessibleSubModulePaths(profile);
  const canOpen = (path) => isPathAllowed(path, modules, subPaths);
  const under = (prefixes) => [...subPaths].filter((p) => prefixes.some((pre) => p.startsWith(pre)));
  const projectPages = [...PROJECT_PREFIXES, ...under(PROJECT_PREFIXES)];
  const rmPages = [...RM_PAGES, ...under(RM_PREFIXES)];
  return {
    projects: projectPages.some(canOpen),
    projectsQuotation: canOpen('/app/projects/quotation'),
    rm: rmPages.some(canOpen),
    rmEnquiry: canOpen('/app/commercial/rm-mm-amc-iev/manpower-management'),
  };
}

const signatureOf = (p) =>
  JSON.stringify([
    String(p.role ?? ''), String(p.team ?? ''), p.allowed_modules ?? null, p.allowed_sub_modules ?? null,
    p.is_active === false, p.module_access_pending === true,
  ]);

const PROJECT_TABLES = [
  'projects.quotations', 'projects.quotation_rows', 'projects.quotation_maker_audit', 'projects.enquiry_field_change_history',
];
const EXPECTED_AFTER = {
  'projects.quotations': { select: true, insert: true, update: true, delete: true },
  'projects.quotation_rows': { select: true, insert: true, update: true, delete: true },
  'projects.quotation_maker_audit': { select: true, insert: true, update: false, delete: false },
  'projects.enquiry_field_change_history': { select: true, insert: false, update: false, delete: false },
  'rm.enquiries': { select: true, insert: true, update: true, delete: true },
};

const summarize = (access, tables) =>
  tables.map((t) => `${t.split('.')[1]}:${['select', 'insert', 'update', 'delete'].filter((op) => access[t][op]).map((o) => o[0].toUpperCase()).join('') || '-'}`).join(' ');

async function main() {
  const profiles = await loadProfiles();
  const groups = new Map();
  for (const p of profiles) {
    const sig = signatureOf(p);
    if (!groups.has(sig)) groups.set(sig, { sample: p, members: [] });
    groups.get(sig).members.push(p);
  }

  const db = await buildDb();
  const entries = [...groups.values()].map((g, i) => ({
    ...g,
    probeId: `b0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  }));
  for (const g of entries) await upsertProfile(db, { ...g.sample, id: g.probeId });

  for (const g of entries) g.before = await measureAccess(db, g.probeId);
  await applyMigration(db);
  for (const g of entries) g.after = await measureAccess(db, g.probeId);
  await applyRollback(db);
  for (const g of entries) g.rolledBack = await measureAccess(db, g.probeId);

  const problems = [];
  const rows = [];
  for (const g of entries) {
    const p = g.sample;
    const ui = frontendAccess(p);
    const admin = isFullDataAccessRole(p.role) && p.is_active !== false;
    const sqlProjects = g.after['projects.quotations'].select;
    const sqlRm = g.after['rm.enquiries'].select;
    const jsProjects = profileHasDataScope(p, 'projects');
    const jsRm = profileHasDataScope(p, 'commercialRm');
    const label = `role=${p.role ?? '∅'} team=${p.team ?? '∅'} modules=${JSON.stringify(p.allowed_modules ?? null)} sub=${JSON.stringify(p.allowed_sub_modules ?? null)}${p.is_active === false ? ' INACTIVE' : ''}`;

    const needProjects = ui.projects || admin;
    const needRm = ui.rm || admin;
    const fullFor = (tables) => tables.every((t) => Object.entries(EXPECTED_AFTER[t]).every(([op, want]) => g.after[t][op] === want));
    if (needProjects && !fullFor(PROJECT_TABLES)) problems.push({ kind: 'LOSS projects', label, members: g.members.length });
    if (needRm && !fullFor(['rm.enquiries'])) problems.push({ kind: 'LOSS rm', label, members: g.members.length });
    if (jsProjects !== sqlProjects) problems.push({ kind: 'JS/SQL mismatch projects', label, members: g.members.length });
    if (jsRm !== sqlRm) problems.push({ kind: 'JS/SQL mismatch rm', label, members: g.members.length });
    if (JSON.stringify(g.rolledBack) !== JSON.stringify(g.before)) problems.push({ kind: 'ROLLBACK differs', label, members: g.members.length });
    if (g.after['projects.quotation_maker_audit'].update || g.after['projects.quotation_maker_audit'].delete) {
      problems.push({ kind: 'AUDIT still mutable', label, members: g.members.length });
    }

    rows.push({
      label, members: g.members, ui, admin,
      before: summarize(g.before, [...PROJECT_TABLES, 'rm.enquiries']),
      after: summarize(g.after, [...PROJECT_TABLES, 'rm.enquiries']),
      sqlProjects, sqlRm, extraProjects: sqlProjects && !needProjects, extraRm: sqlRm && !needRm,
    });
  }

  const count = (fn) => rows.reduce((n, r) => n + (fn(r) ? r.members.length : 0), 0);
  const totals = {
    profiles: profiles.length,
    distinctAccessSetups: rows.length,
    before_projectsData: profiles.length,
    before_rmData: profiles.length,
    ui_projects: count((r) => r.ui.projects),
    ui_rm: count((r) => r.ui.rm),
    adminOrSuper: count((r) => r.admin),
    after_projectsData: count((r) => r.sqlProjects),
    after_rmData: count((r) => r.sqlRm),
    after_projects_extra_vs_ui: count((r) => r.extraProjects),
    after_rm_extra_vs_ui: count((r) => r.extraRm),
    lost_projects: count((r) => !r.sqlProjects),
    lost_rm: count((r) => !r.sqlRm),
  };

  mkdirSync(outDir, { recursive: true });
  const who = (m) => m.map((x) => `${x.username || '(no name)'} <${x.email || x.id}>`).join('; ');
  const md = [
    '# C2 permission comparison (before → after)',
    '',
    `Generated ${new Date().toISOString()} from ${profilesFile ? profilesFile : 'live public.profiles (read-only)'}.`,
    'BEFORE = historical migrations (open policies). AFTER = 20261117120000. Letters: S select, I insert, U update, D delete.',
    '',
    '## Totals',
    '',
    '| Measure | Profiles |',
    '|---|---|',
    ...Object.entries(totals).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    `## Problems (${problems.length})`,
    '',
    problems.length ? problems.map((p) => `- **${p.kind}** (${p.members}) — ${p.label}`).join('\n') : 'None — no Admin, Super Admin, Projects or R&M user loses access; JS rule = SQL; rollback restores BEFORE exactly.',
    '',
    '## Every distinct access setup',
    '',
    '| Profiles | Setup | UI Projects | UI R&M | Before | After |',
    '|---|---|---|---|---|---|',
    ...rows
      .sort((a, b) => b.members.length - a.members.length)
      .map((r) => `| ${r.members.length} | ${r.label.replace(/\|/g, '/')} | ${r.ui.projects ? 'yes' : 'no'} | ${r.ui.rm ? 'yes' : 'no'} | ${r.before} | ${r.after} |`),
    '',
    '## People who keep access only through Admin / Super Admin (not via UI module)',
    '',
    ...rows.filter((r) => r.extraProjects || r.extraRm).map((r) => `- ${r.label}: ${who(r.members)}`),
    '',
    '## People who lose access (no Projects / R&M page in the UI today)',
    '',
    ...rows.filter((r) => !r.sqlProjects || !r.sqlRm).map((r) =>
      `- [${!r.sqlProjects ? 'Projects' : ''}${!r.sqlProjects && !r.sqlRm ? ' + ' : ''}${!r.sqlRm ? 'R&M' : ''}] ${r.label}: ${who(r.members)}`),
    '',
  ].join('\n');
  writeFileSync(`${outDir}/c2-permission-comparison.md`, md);
  writeFileSync(`${outDir}/c2-permission-comparison.json`, JSON.stringify({ totals, problems, rows }, null, 2));

  console.log(JSON.stringify(totals, null, 2));
  console.log(`problems: ${problems.length}`);
  for (const p of problems) console.log(` - ${p.kind} (${p.members}) ${p.label}`);
  console.log(`report: ${outDir}/c2-permission-comparison.md`);
  if (problems.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});


/**
 * Security fix C2 — runs the real migration and rollback SQL in an in-memory Postgres (PGlite).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { profileHasDataScope } from '../shared/erpDataScopes.mjs';
import {
  buildDb, applyMigration, applyRollback, upsertProfile, measureAccess, tryAs, SEED,
} from '../scripts/security/rlsHarness.mjs';

const P = (n) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Edge cases for the scope rule. `projects` / `rm` = expected access after the migration. */
const PROFILES = [
  { id: P(1), label: 'Super Admin', role: 'super_admin', projects: true, rm: true },
  { id: P(2), label: 'Super Admin Pro', role: 'super_admin_pro', projects: true, rm: true },
  { id: P(3), label: 'Admin, no modules', role: 'admin', projects: true, rm: true },
  { id: P(4), label: 'HOD (Admin alias), mixed case', role: 'HOD', projects: true, rm: true },
  { id: P(5), label: 'Projects team label', role: 'executive', team: 'Projects', projects: true, rm: false },
  { id: P(6), label: 'Projects via allowed_modules', role: 'manager', allowed_modules: ['projects'], projects: true, rm: false },
  { id: P(7), label: 'Projects sub-module only', role: 'executive', allowed_sub_modules: ['projects.quotation-master'], projects: true, rm: false },
  { id: P(8), label: 'Projects-FTC is Fire Tender, not Projects', role: 'executive', team: 'Projects-FTC', projects: false, rm: false },
  { id: P(9), label: 'R&M team label', role: 'executive', team: 'R&M', projects: false, rm: true },
  { id: P(10), label: 'commercialRm module', role: 'executive', allowed_modules: ['commercialRm'], projects: false, rm: true },
  { id: P(11), label: 'commercialRm sub-module only', role: 'executive', allowed_sub_modules: ['commercialRm.enquiry'], projects: false, rm: true },
  { id: P(12), label: 'legacy Sales (owns /app/commercial)', role: 'executive', team: 'sales', projects: false, rm: true },
  { id: P(13), label: 'Commercial (Manpower/Training) is not R&M', role: 'executive', team: 'Commercial', projects: false, rm: false },
  { id: P(14), label: 'HR site-login executive', role: 'executive', team: 'HR', projects: false, rm: false },
  { id: P(15), label: 'self-signup, no role', role: null, projects: false, rm: false },
  { id: P(16), label: 'inactive Super Admin', role: 'super_admin', is_active: false, projects: false, rm: false },
  { id: P(17), label: 'inactive Projects user', role: 'executive', team: 'projects', is_active: false, projects: false, rm: false },
  { id: P(18), label: 'team with extra spaces', role: 'executive', team: '  projects ', projects: true, rm: false },
];

let db;
const before = {};
const after = {};
const rolledBack = {};

beforeAll(async () => {
  db = await buildDb();
  for (const p of PROFILES) await upsertProfile(db, p);
  for (const p of PROFILES) before[p.id] = await measureAccess(db, p.id);
  await applyMigration(db);
  for (const p of PROFILES) after[p.id] = await measureAccess(db, p.id);
}, 120_000);

describe('C2 migration — who keeps access', () => {
  it.each(PROFILES)('$label', (p) => {
    const a = after[p.id];
    const all = (t) => ['select', 'insert', 'update', 'delete'].every((op) => a[t][op]);
    const none = (t) => ['select', 'insert', 'update', 'delete'].every((op) => !a[t][op]);
    if (p.projects) {
      expect(all('projects.quotations')).toBe(true);
      expect(all('projects.quotation_rows')).toBe(true);
      expect(a['projects.quotation_maker_audit']).toEqual({ select: true, insert: true, update: false, delete: false });
      expect(a['projects.enquiry_field_change_history'].select).toBe(true);
    } else {
      expect(none('projects.quotations')).toBe(true);
      expect(none('projects.quotation_rows')).toBe(true);
      expect(none('projects.quotation_maker_audit')).toBe(true);
      expect(a['projects.enquiry_field_change_history'].select).toBe(false);
    }
    expect(all('rm.enquiries')).toBe(p.rm);
    if (!p.rm) expect(none('rm.enquiries')).toBe(true);
  });

  it('before the migration every profile could do everything (the vulnerability)', () => {
    for (const p of PROFILES) {
      expect(before[p.id]['projects.quotations'].delete).toBe(true);
      expect(before[p.id]['projects.quotation_maker_audit'].delete).toBe(true);
      expect(before[p.id]['rm.enquiries'].delete).toBe(true);
    }
  });

  it('JS scope rule (API server) agrees with the SQL policies', () => {
    for (const p of PROFILES) {
      expect(profileHasDataScope(p, 'projects'), p.label).toBe(after[p.id]['projects.quotations'].select);
      expect(profileHasDataScope(p, 'commercialRm'), p.label).toBe(after[p.id]['rm.enquiries'].select);
    }
  });
});

describe('C2 migration — audit table is append-only and stamped', () => {
  it('nobody (not even Super Admin) can update or delete audit rows', () => {
    expect(after[P(1)]['projects.quotation_maker_audit'].update).toBe(false);
    expect(after[P(1)]['projects.quotation_maker_audit'].delete).toBe(false);
  });

  it('actor_id / created_at are stamped by the database, a forged actor_id is replaced', async () => {
    await db.exec(`BEGIN; SELECT set_config('test.uid', '${P(5)}', true); SET LOCAL ROLE authenticated;
      INSERT INTO projects.quotation_maker_audit (quotation_id, action, actor_id, created_at)
      VALUES ('${SEED.quotation}', 'stamp-check', '${SEED.author}', '2000-01-01'); COMMIT;`);
    const { rows } = await db.query(`SELECT actor_id::text AS actor, created_at > now() - interval '1 minute' AS fresh
      FROM projects.quotation_maker_audit WHERE action = 'stamp-check'`);
    expect(rows[0]).toEqual({ actor: P(5), fresh: true });
  });

  it('deleting a quotation still works and keeps its audit rows (FK on delete set null)', async () => {
    const r = await tryAs(db, P(5), `WITH x AS (DELETE FROM projects.quotations WHERE id = '${SEED.quotation}' RETURNING 1)
      SELECT (SELECT count(*) FROM x)::int AS n`);
    expect(r).toMatchObject({ ok: true, n: 1 });
  });

  it('SECURITY DEFINER cleanup (quotation deletion flow) can still remove audit rows', async () => {
    await db.exec(`
      CREATE OR REPLACE FUNCTION projects._test_cleanup_audit() RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = projects, public AS $$
      DECLARE n integer; BEGIN DELETE FROM projects.quotation_maker_audit WHERE action = 'stamp-check';
      GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;
      GRANT EXECUTE ON FUNCTION projects._test_cleanup_audit() TO authenticated;`);
    const r = await tryAs(db, P(5), `SELECT projects._test_cleanup_audit() AS n`);
    expect(r).toMatchObject({ ok: true, n: 1 });
  });
});

describe('C2 rollback', () => {
  it('restores exactly the previous permissions', async () => {
    await applyRollback(db);
    for (const p of PROFILES) rolledBack[p.id] = await measureAccess(db, p.id);
    for (const p of PROFILES) expect(rolledBack[p.id], p.label).toEqual(before[p.id]);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'erp_current_user_has_data_scope'`);
    expect(rows[0].n).toBe(0);
  });

  it('migration can be applied again after a rollback', async () => {
    await applyMigration(db);
    const again = await measureAccess(db, P(14));
    expect(again['projects.quotations'].select).toBe(false);
  });
});

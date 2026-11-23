import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFinanceDb } from './helpers/fakeFinanceDb.js';

const holder = vi.hoisted(() => ({ db: null }));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => { throw new Error('Real Supabase client blocked in tests'); } }));
vi.mock('../src/lib/supabase.js', () => ({
  supabase: { schema: (...args) => holder.db.client.schema(...args) },
}));
vi.mock('../src/lib/supabaseConfig.js', () => ({ isSupabaseEnvConfigured: () => true }));
vi.mock('../src/services/financeApi.js', () => ({
  financeErrorMsg: (e, ctx) => `${ctx}: ${e?.message || e}`,
  invalidateFinanceCache: () => {},
  isFinanceSchemaError: () => false,
}));

const store = await import('../src/pages/finance/api/siteLedgerStore.js');
const { diffSite, diffSiteSetup, describeRemovals, flattenStructure } = await import('../src/pages/finance/api/siteSetupDiff.js');

const P_LAB = '10000000-0000-4000-8000-000000000001';
const P_ADM = '10000000-0000-4000-8000-000000000002';
const C_WAGES = '20000000-0000-4000-8000-000000000001';
const C_PF = '20000000-0000-4000-8000-000000000002';
const C_STAT = '20000000-0000-4000-8000-000000000003';
const S1 = '30000000-0000-4000-8000-000000000001';
const S2 = '30000000-0000-4000-8000-000000000002';

function seed() {
  return {
    expense_parent_heads: [
      { id: P_LAB, code: 'labour', label: 'Labour', color: '#111', sort_order: 0, is_custom: false, is_active: true },
      { id: P_ADM, code: 'adminMisc', label: 'Admin & Misc', color: '#222', sort_order: 1, is_custom: false, is_active: true },
    ],
    expense_child_heads: [
      { id: C_WAGES, code: 'wages', label: 'Wages', parent_head_id: P_LAB, sort_order: 0, is_custom: false, is_active: true },
      { id: C_PF, code: 'pf', label: 'PF', parent_head_id: P_LAB, sort_order: 1, is_custom: false, is_active: true },
      { id: C_STAT, code: 'stationery', label: 'Stationery', parent_head_id: P_ADM, sort_order: 2, is_custom: false, is_active: true },
    ],
    revenue_heads: store.REVENUE_ITEMS.map((r, i) => ({ id: `40000000-0000-4000-8000-00000000000${i}`, code: r.key, label: r.label, sign: r.sign, sort_order: 0, is_active: true })),
    sites: [
      { id: S1, code: 'S1', name: 'Site One', status: 'active', contract_start_period: '2026-04', remarks: '', sort_order: 0 },
      { id: S2, code: 'S2', name: 'Site Two', status: 'active', contract_start_period: '2026-04', remarks: '', sort_order: 1 },
    ],
    site_expense_structure: [
      { id: 'st1', site_id: S1, parent_head_id: P_LAB, child_head_id: C_WAGES, sort_order: 0 },
      { id: 'st2', site_id: S1, parent_head_id: P_LAB, child_head_id: C_PF, sort_order: 1 },
      { id: 'st3', site_id: S1, parent_head_id: P_ADM, child_head_id: C_STAT, sort_order: 2 },
      { id: 'st4', site_id: S2, parent_head_id: P_LAB, child_head_id: C_WAGES, sort_order: 0 },
    ],
    cost_allocations: [],
    budget_versions: [],
    budget_revenue_lines: [],
    budget_expense_lines: [],
    period_entries: [],
    revenue_entry_lines: [],
    expense_entry_lines: [],
  };
}

/** Load the ledger as a browser tab would; returns { baseline, state } deep copies. */
async function openTab() {
  const res = await store.loadLedgerStore([], []);
  expect(res.ok).toBe(true);
  const snap = { sites: res.data.sites, library: res.data.library, parents: res.data.parents };
  return { baseline: structuredClone(snap), state: structuredClone(snap) };
}

const structureCodes = (siteUuid) => {
  const childCode = Object.fromEntries(holder.db.rows('expense_child_heads').map((c) => [c.id, c.code]));
  return holder.db.rows('site_expense_structure').filter((r) => r.site_id === siteUuid).map((r) => childCode[r.child_head_id]).sort();
};

const site = (state, code) => state.sites.find((s) => s.id === code);
const save = (tab) => store.saveSiteSetupChanges({ baseline: tab.baseline, ...tab.state });

beforeEach(() => {
  holder.db = createFakeFinanceDb(seed());
});

describe('Site Setup diff (pure)', () => {
  it('keeps components the baseline never had (another user added them)', () => {
    const base = { id: 'S1', structure: [{ parent: 'labour', children: ['wages', 'pf'] }] };
    const cur = { id: 'S1', structure: [{ parent: 'labour', children: ['wages'] }] };
    const d = diffSite(base, cur);
    expect(d.structure.removed).toEqual(['pf']);
    expect(d.structure.added).toEqual([]);
  });

  it('does not report groups under unknown parent heads as removed when untouched', () => {
    const s = { id: 'S1', structure: [{ parent: 'labour', children: ['wages'] }, { parent: 'otherUsersParent', children: ['x1', 'x2'] }] };
    const d = diffSite(structuredClone(s), structuredClone(s));
    expect(d.changed).toBe(false);
    expect(flattenStructure(s.structure).size).toBe(3);
  });

  it('lists every removal for the confirmation dialog', () => {
    const diff = diffSiteSetup(
      { sites: [{ id: 'S1', structure: [{ parent: 'labour', children: ['wages', 'pf'] }], spreads: [{ id: 'sp1', head: 'pf' }] }], library: [{ key: 'pf', label: 'PF', parent: 'labour' }], parents: [] },
      { sites: [{ id: 'S1', structure: [{ parent: 'labour', children: ['wages'] }], spreads: [] }], library: [], parents: [] },
    );
    const lines = describeRemovals(diff, { siteName: () => 'Site One', headLabel: (k) => k.toUpperCase() });
    expect(lines.join('\n')).toMatch(/Site One: remove 1 component\(s\) — PF/);
    expect(lines.join('\n')).toMatch(/delete 1 cost spread/);
    expect(lines.join('\n')).toMatch(/Cost-line library: remove PF/);
  });

  it('no edits → no changes', () => {
    const state = { sites: [{ id: 'S1', name: 'x', structure: [{ parent: 'labour', children: ['wages'] }] }], library: [{ key: 'wages', label: 'Wages', parent: 'labour' }], parents: [{ key: 'labour', label: 'Labour' }] };
    expect(diffSiteSetup(structuredClone(state), structuredClone(state)).hasChanges).toBe(false);
  });
});

describe('saveSiteSetupChanges — concurrent editing', () => {
  it('a stale tab removing one component does not wipe a component another user added', async () => {
    const tabA = await openTab();
    const tabB = await openTab();

    // User B adds a new site-specific cost line "Fuel" to S1 and saves.
    tabB.state.library.push({ key: 'S1_fuel', label: 'Fuel', parent: 'labour', custom: true, siteScoped: true });
    site(tabB.state, 'S1').structure.find((g) => g.parent === 'labour').children.push('S1_fuel');
    await save(tabB);
    expect(structureCodes(S1)).toEqual(['S1_fuel', 'pf', 'stationery', 'wages']);

    // User A (tab opened before B's save) removes PF from S1 and saves.
    holder.db.resetRequests();
    const labour = site(tabA.state, 'S1').structure.find((g) => g.parent === 'labour');
    labour.children = labour.children.filter((k) => k !== 'pf');
    const report = await save(tabA);

    expect(structureCodes(S1)).toEqual(['S1_fuel', 'stationery', 'wages']);
    expect(structureCodes(S2)).toEqual(['wages']);
    expect(report.sitesSaved).toEqual(['S1']);
    // No full replace, no head rewrites, nothing on other sites.
    const writes = holder.db.requests;
    expect(writes.some((r) => r.table === 'rpc:replace_site_structure')).toBe(false);
    expect(writes.some((r) => r.table === 'expense_child_heads' || r.table === 'expense_parent_heads')).toBe(false);
    expect(writes.filter((r) => r.table === 'site_expense_structure').map((r) => r.op)).toEqual(['delete']);
  });

  it('a stale tab editing site details keeps a cost spread another user added', async () => {
    const tabA = await openTab();
    const tabB = await openTab();

    site(tabB.state, 'S1').spreads.push({ id: 'sp-b', head: 'wages', total: 1200, start: '2026-05', months: 12, mode: 'fixed', note: '' });
    await save(tabB);
    expect(holder.db.rows('cost_allocations')).toHaveLength(1);

    site(tabA.state, 'S1').name = 'Site One (renamed)';
    await save(tabA);

    expect(holder.db.rows('cost_allocations')).toHaveLength(1);
    expect(holder.db.rows('sites').find((s) => s.id === S1).name).toBe('Site One (renamed)');
    expect(structureCodes(S1)).toEqual(['pf', 'stationery', 'wages']);
  });

  it('removing a library cost line that another site now uses keeps the cost line', async () => {
    const tabA = await openTab();
    const tabB = await openTab();

    site(tabB.state, 'S2').structure.push({ parent: 'adminMisc', children: ['stationery'] });
    await save(tabB);

    // Tab A deletes "stationery" from the library (and from the sites it can see).
    tabA.state.library = tabA.state.library.filter((h) => h.key !== 'stationery');
    for (const s of tabA.state.sites) {
      s.structure = s.structure.map((g) => ({ ...g, children: g.children.filter((k) => k !== 'stationery') })).filter((g) => g.children.length);
    }
    const report = await save(tabA);

    expect(report.headsKept).toEqual(['stationery']);
    expect(holder.db.rows('expense_child_heads').some((c) => c.code === 'stationery')).toBe(true);
    expect(structureCodes(S2)).toEqual(['stationery', 'wages']);
    expect(structureCodes(S1)).toEqual(['pf', 'wages']);
  });

  it('a stale tab reordering does not re-create a component another user removed', async () => {
    const tabA = await openTab();
    const tabB = await openTab();

    const labourB = site(tabB.state, 'S1').structure.find((g) => g.parent === 'labour');
    labourB.children = labourB.children.filter((k) => k !== 'pf');
    await save(tabB);

    site(tabA.state, 'S1').structure.find((g) => g.parent === 'labour').children.reverse();
    await save(tabA);

    expect(structureCodes(S1)).toEqual(['stationery', 'wages']);
  });

  it('saving with no changes writes nothing', async () => {
    const tab = await openTab();
    holder.db.resetRequests();
    const report = await save(tab);
    expect(report.diff.hasChanges).toBe(false);
    expect(holder.db.requests).toHaveLength(0);
  });

  it('components stay intact after reload and a later unrelated save', async () => {
    const tab = await openTab();
    site(tab.state, 'S1').structure.find((g) => g.parent === 'labour').children.reverse();
    await save(tab);
    const again = await openTab();
    expect(site(again.state, 'S1').structure.flatMap((g) => g.children).sort()).toEqual(['pf', 'stationery', 'wages']);
    site(again.state, 'S2').name = 'Site Two (edited)';
    await save(again);
    expect(structureCodes(S1)).toEqual(['pf', 'stationery', 'wages']);
    expect(structureCodes(S2)).toEqual(['wages']);
  });

  it('creates a brand-new site with its components', async () => {
    const tab = await openTab();
    tab.state.sites.push({ id: 'S3', name: 'Site Three', status: 'active', contractStart: '2026-11', structure: [{ parent: 'labour', children: ['wages', 'pf'] }], spreads: [], estimates: [], customHeads: [], excludedHeadKeys: [] });
    await save(tab);
    const s3 = holder.db.rows('sites').find((s) => s.code === 'S3');
    expect(s3).toBeTruthy();
    expect(structureCodes(s3.id)).toEqual(['pf', 'wages']);
  });

  it('refuses to save without a baseline (failed load)', async () => {
    const tab = await openTab();
    await expect(store.saveSiteSetupChanges({ baseline: null, ...tab.state })).rejects.toThrow(/reload Site Ledger/i);
  });
});

describe('activity-log tagging', () => {
  it('Site Setup writes are tagged as a user action with one batch id', async () => {
    const tab = await openTab();
    holder.db.resetRequests();
    site(tab.state, 'S1').name = 'Renamed';
    site(tab.state, 'S1').structure = site(tab.state, 'S1').structure.filter((g) => g.parent !== 'adminMisc');
    await save(tab);
    const writes = holder.db.requests;
    expect(writes.length).toBeGreaterThan(0);
    expect(new Set(writes.map((r) => r.audit?.trigger))).toEqual(new Set(['user']));
    expect(new Set(writes.map((r) => r.audit?.action))).toEqual(new Set(['site_setup_save']));
    expect(new Set(writes.map((r) => r.audit?.batch)).size).toBe(1);
  });

  it('figure flush on leaving the page is tagged automatic; Save is tagged user', async () => {
    const tab = await openTab();
    const ctx = { sites: tab.state.sites, library: tab.state.library, parents: tab.state.parents };

    holder.db.resetRequests();
    const pending = store.savePeriodRecord('S1', '2026-11', { wages: 500 }, ctx);
    await store.flushAllPendingPeriodRecords();
    await pending;
    expect(holder.db.requests.length).toBeGreaterThan(0);
    expect(new Set(holder.db.requests.map((r) => r.audit?.trigger))).toEqual(new Set(['automatic']));

    holder.db.resetRequests();
    await store.savePeriodRecord('S1', '2026-11', { wages: 750 }, ctx, { immediate: true });
    expect(new Set(holder.db.requests.map((r) => r.audit?.trigger))).toEqual(new Set(['user']));
    expect(new Set(holder.db.requests.map((r) => r.audit?.action))).toEqual(new Set(['figure_save']));
    // A figure save never rewrites heads or site setup.
    expect(holder.db.requests.some((r) => /expense_(child|parent)_heads|site_expense_structure|sites/.test(r.table))).toBe(false);
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  analyzeChildRemoval,
  analyzeChildRemovals,
  budgetAmountForChild,
  canRemoveFromStructure,
  describeRemovalDependencies,
  periodsWithFigures,
  spreadsForChild,
} from '../src/pages/finance/site-ledger/validation/setupDependencies.js';
import {
  AMOUNT_FIELD_ATTR,
  handleAmountEnterNavigation,
  nextAmountFieldIndex,
} from '../src/pages/finance/site-ledger/pages/entryGridNav.js';
import { SetupDependencyPanel } from '../src/pages/finance/site-ledger/components/SetupDependencyPanel.jsx';
import { SetupConflictPanel } from '../src/pages/finance/site-ledger/components/ConflictResolutionPanel.jsx';

const SITE = {
  id: 'S1',
  name: 'Site One',
  spreads: [
    { id: 'sp1', head: 'ppe', total: 1200, start: '2026-04', months: 12 },
    { id: 'sp2', head: 'other', total: 300, start: '2026-04', months: 3 },
  ],
  estimates: [
    { id: 'e1', expenses: { ppe: 5000, rent: 0 } },
    { id: 'e2', expenses: { ppe: '2,500' } },
  ],
};

const RECORDS = {
  'S1__2026-02': { ppe: 100, rent: 0 },
  'S1__2026-03': { ppe: 250 },
  'S1__2026-04': { ppe: 0, rent: 900 },
  'S2__2026-02': { ppe: 777 },
  'S1__2026-05': { ppe: '1,000' },
};

describe('setupDependencies — building blocks', () => {
  it('lists only non-zero period figures for the given site, sorted', () => {
    expect(periodsWithFigures(RECORDS, 'S1', 'ppe')).toEqual(['2026-02', '2026-03', '2026-05']);
    expect(periodsWithFigures(RECORDS, 'S1', 'rent')).toEqual(['2026-04']);
    expect(periodsWithFigures(RECORDS, 'S1', 'missing')).toEqual([]);
    expect(periodsWithFigures(null, 'S1', 'ppe')).toEqual([]);
  });

  it('sums budget estimates, ignoring zero/blank and parsing commas', () => {
    expect(budgetAmountForChild(SITE, 'ppe')).toBe(7500);
    expect(budgetAmountForChild(SITE, 'rent')).toBe(0);
    expect(budgetAmountForChild({}, 'ppe')).toBe(0);
  });

  it('finds spreads that reference the head', () => {
    expect(spreadsForChild(SITE, 'ppe')).toHaveLength(1);
    expect(spreadsForChild(SITE, 'rent')).toHaveLength(0);
  });
});

describe('analyzeChildRemoval', () => {
  it('is safe with suggestion "remove" when nothing references the line', () => {
    const r = analyzeChildRemoval({ site: SITE, childKey: 'unused', records: RECORDS });
    expect(r.safe).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.historicalPeriods).toEqual([]);
    expect(r.hasBudget).toBe(false);
    expect(r.hasSpread).toBe(false);
    expect(r.suggestion).toBe('remove');
    expect(canRemoveFromStructure(r)).toBe(true);
  });

  it('flags historical figures, budget and spread, and suggests deactivate', () => {
    const r = analyzeChildRemoval({
      site: SITE,
      childKey: 'ppe',
      records: RECORDS,
      periodLabel: (k) => `P:${k}`,
    });
    expect(r.safe).toBe(false);
    expect(r.historicalPeriods).toEqual(['2026-02', '2026-03', '2026-05']);
    expect(r.hasBudget).toBe(true);
    expect(r.budgetAmount).toBe(7500);
    expect(r.hasSpread).toBe(true);
    expect(r.spreadCount).toBe(1);
    expect(r.suggestion).toBe('deactivate');
    expect(r.hardBlock).toBe(false);
    expect(canRemoveFromStructure(r)).toBe(true);
    expect(r.reasons.join(' ')).toContain('P:2026-02');
  });

  it('treats only-budget / only-spread as a warning but still removable', () => {
    const budgetOnly = analyzeChildRemoval({
      site: { id: 'S1', estimates: [{ expenses: { x: 10 } }] },
      childKey: 'x',
      records: {},
    });
    expect(budgetOnly.safe).toBe(false);
    expect(budgetOnly.suggestion).toBe('remove');
    expect(budgetOnly.hasBudget).toBe(true);

    const spreadOnly = analyzeChildRemoval({
      site: { id: 'S1', spreads: [{ id: 'a', head: 'y' }, { id: 'b', head: 'y' }] },
      childKey: 'y',
      records: {},
    });
    expect(spreadOnly.suggestion).toBe('remove');
    expect(spreadOnly.spreadCount).toBe(2);
    expect(spreadOnly.reasons[0]).toMatch(/2 spread costs use/);
  });

  it('separates the current period from earlier periods in the wording', () => {
    const r = analyzeChildRemoval({
      site: SITE,
      childKey: 'ppe',
      records: RECORDS,
      currentPeriodKey: '2026-03',
    });
    expect(r.currentPeriods).toEqual(['2026-03']);
    expect(r.reasons.some((m) => /period you are working on/.test(m))).toBe(true);
    expect(r.reasons.some((m) => /2 earlier periods/.test(m))).toBe(true);
  });

  it('hard-blocks when unsaved figure edits reference the line', () => {
    const r = analyzeChildRemoval({
      site: SITE,
      childKey: 'ppe',
      records: RECORDS,
      unsavedFigurePeriods: ['2026-06', '2026-06'],
    });
    expect(r.suggestion).toBe('blocked');
    expect(r.hardBlock).toBe(true);
    expect(r.safe).toBe(false);
    expect(r.blockers).toHaveLength(1);
    expect(canRemoveFromStructure(r)).toBe(false);
  });

  it('never suggests deleting figures and keeps copy free of schema jargon', () => {
    const r = analyzeChildRemoval({ site: SITE, childKey: 'ppe', records: RECORDS });
    const text = r.reasons.join(' ').toLowerCase();
    expect(text).not.toMatch(/delete (the )?figures|admin_|_id\b|rpc|trigger|table/);
    expect(text).toContain('stay in the records');
  });

  it('truncates long period lists in the message but keeps every period in the result', () => {
    const records = {};
    for (let m = 1; m <= 9; m += 1) records[`S1__2025-${String(m).padStart(2, '0')}`] = { k: 5 };
    const r = analyzeChildRemoval({ site: { id: 'S1' }, childKey: 'k', records, maxPeriodsInMessage: 3 });
    expect(r.historicalPeriods).toHaveLength(9);
    expect(r.reasons[0]).toMatch(/and 6 more/);
  });

  it('analyzes several lines at once', () => {
    const out = analyzeChildRemovals({ site: SITE, childKeys: ['ppe', 'unused'], records: RECORDS });
    expect(out.ppe.safe).toBe(false);
    expect(out.unused.safe).toBe(true);
  });
});

describe('describeRemovalDependencies (save-time preview)', () => {
  it('describes dependencies of removed lines using the baseline site', () => {
    const diff = {
      sites: [
        { siteCode: 'S1', structure: { removed: ['ppe', 'unused'] } },
        { siteCode: 'S9', structure: { removed: ['ppe'] } },
        { siteCode: 'S1', structure: { removed: [] } },
      ],
    };
    const lines = describeRemovalDependencies(diff, {
      baselineSites: [SITE],
      records: RECORDS,
      siteName: (c) => `Name ${c}`,
      headLabel: (k) => k.toUpperCase(),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Name S1 · PPE');
    expect(lines[0]).toContain('figures in 3 periods are kept');
    expect(lines[0]).toContain('budget line is removed');
    expect(lines[0]).toContain('1 spread cost removed');
  });

  it('returns nothing when nothing is removed', () => {
    expect(describeRemovalDependencies({ sites: [] })).toEqual([]);
    expect(describeRemovalDependencies(null)).toEqual([]);
  });
});

describe('entry grid keyboard navigation', () => {
  it('computes next / previous indexes and stops at the ends', () => {
    expect(nextAmountFieldIndex(3, 0)).toBe(1);
    expect(nextAmountFieldIndex(3, 2)).toBe(-1);
    expect(nextAmountFieldIndex(3, 1, true)).toBe(0);
    expect(nextAmountFieldIndex(3, 0, true)).toBe(-1);
    expect(nextAmountFieldIndex(0, 0)).toBe(-1);
    expect(nextAmountFieldIndex(3, -1)).toBe(-1);
  });

  it('moves focus to the next amount field on Enter', () => {
    const calls = [];
    const mk = (name) => ({
      name,
      disabled: false,
      hasAttribute: (a) => a === AMOUNT_FIELD_ATTR,
      focus: () => calls.push(`focus:${name}`),
      select: () => calls.push(`select:${name}`),
    });
    const a = mk('a');
    const b = mk('b');
    const container = { querySelectorAll: () => [a, b] };
    let prevented = false;
    const ev = { key: 'Enter', target: a, shiftKey: false, preventDefault: () => { prevented = true; } };
    expect(handleAmountEnterNavigation(ev, container)).toBe(true);
    expect(prevented).toBe(true);
    expect(calls).toEqual(['focus:b', 'select:b']);

    expect(handleAmountEnterNavigation({ ...ev, target: b, preventDefault() {} }, container)).toBe(false);
    expect(handleAmountEnterNavigation({ ...ev, key: 'Tab' }, container)).toBe(false);
    expect(handleAmountEnterNavigation({ ...ev, target: { hasAttribute: () => false } }, container)).toBe(false);
  });
});

describe('SetupDependencyPanel / SetupConflictPanel markup', () => {
  const render = (analysis) => renderToStaticMarkup(
    React.createElement(SetupDependencyPanel, { analysis, headLabel: 'PPE Kit', siteName: 'Site One' }),
  );

  it('offers Cancel | Keep assigned | Remove when removal is allowed', () => {
    const html = render(analyzeChildRemoval({ site: SITE, childKey: 'ppe', records: RECORDS }));
    expect(html).toContain('data-testid="setup-dependency-cancel"');
    expect(html).toContain('data-testid="setup-dependency-keep"');
    expect(html).toContain('data-testid="setup-dependency-remove"');
    expect(html).toContain('Remove from site structure');
    expect(html).toContain('data-testid="setup-dependency-history-note"');
    expect(html).toContain('kept in the database');
  });

  it('hides Remove when hard-blocked', () => {
    const html = render(analyzeChildRemoval({
      site: SITE, childKey: 'ppe', records: RECORDS, unsavedFigurePeriods: ['2026-06'],
    }));
    expect(html).not.toContain('data-testid="setup-dependency-remove"');
    expect(html).toContain('data-testid="setup-dependency-blocked"');
    expect(html).toContain('data-testid="setup-dependency-keep"');
  });

  it('renders the setup conflict panel with keep / reload actions', () => {
    const html = renderToStaticMarkup(React.createElement(SetupConflictPanel, { message: 'Changed elsewhere' }));
    expect(html).toContain('data-testid="setup-conflict-panel"');
    expect(html).toContain('Changed elsewhere');
    expect(html).toContain('Keep my draft');
    expect(html).toContain('Load latest from database');
  });
});

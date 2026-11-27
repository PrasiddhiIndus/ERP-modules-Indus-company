import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARENTS,
  PARENTS,
  syncParents,
  parentLabel,
  REVENUE_ITEMS,
} from '../src/pages/finance/site-ledger/domain/constants.js';
import {
  displayStructure,
  compactStructure,
  siteChildKeys,
  migrateStructureParents,
  structureFromKeys,
} from '../src/pages/finance/site-ledger/domain/siteStructure.js';
import {
  enrichSitesWithVersions,
  prepareNewSiteVersion,
  contractBudgetFor,
  activeSitesOnly,
  inContract,
} from '../src/pages/finance/site-ledger/domain/siteLifecycle.js';
import { inr, inrShort, pct, slug } from '../src/pages/finance/site-ledger/domain/formatMoney.js';

describe('site-ledger domain', () => {
  it('formats money', () => {
    expect(inr(1234567)).toBe('₹12,34,567');
    expect(inrShort(-25000000)).toBe('-₹2.50 Cr');
    expect(pct(12.345)).toBe('12.3%');
    expect(slug('Hello World!')).toBe('hello-world');
    expect(REVENUE_ITEMS).toHaveLength(3);
  });

  it('syncParents mutates the live registry', () => {
    syncParents([{ key: 'a', label: 'A', color: '#000' }]);
    expect(PARENTS).toHaveLength(1);
    expect(parentLabel('a')).toBe('A');
    syncParents(DEFAULT_PARENTS);
    expect(PARENTS).toHaveLength(DEFAULT_PARENTS.length);
  });

  it('structure helpers', () => {
    const site = { structure: [{ parent: 'salaryCost', children: ['salaries'] }, { parent: 'legacyX', children: ['z'] }] };
    const d = displayStructure(site);
    expect(d).toHaveLength(DEFAULT_PARENTS.length + 1);
    expect(siteChildKeys(site)).toEqual(['salaries', 'z']);
    expect(compactStructure([{ parent: 'p', children: ['a', 'a'] }, { parent: 'q', children: [] }])).toEqual([{ parent: 'p', children: ['a'] }]);
    expect(migrateStructureParents([{ parent: 'vehicle', children: ['x'] }])[0].parent).toBe('fireTenderVehicle');
    expect(structureFromKeys(['pf', 'salaries']).map((g) => g.parent)).toEqual(['salaryCost', 'empBenefit']);
  });

  it('site lifecycle helpers', () => {
    const sites = enrichSitesWithVersions([{ id: 's1', name: 'Alpha', contractStart: '2026-01' }]);
    expect(sites[0]).toMatchObject({ siteGroup: 's1', version: 1, status: 'active' });
    const next = prepareNewSiteVersion(sites, { name: 'Alpha' });
    expect(next.find((s) => s.id === 's1').status).toBe('inactive');
    expect(activeSitesOnly(next)).toHaveLength(1);
    const site = { estimates: [{ effectiveFrom: '2026-03' }, { effectiveFrom: '2026-01' }], contractStart: '2026-03' };
    expect(contractBudgetFor(site).effectiveFrom).toBe('2026-03');
    expect(inContract({ contractStart: '2026-01', contractEnd: '2026-03' }, '2026-02')).toBe(true);
    expect(inContract({ contractStart: '2026-01', contractEnd: '2026-03' }, '2026-04')).toBe(false);
  });
});

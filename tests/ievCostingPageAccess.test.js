import { describe, it, expect } from 'vitest';
import {
  IEV_COSTING_PAGES,
  NAV_MODULE_TREE,
  ROLES,
  getAccessibleModules,
  getAccessibleSubModulePaths,
  getAllowedIevCostingTabs,
  getOpenableIevCostingTabs,
  isPathAllowed,
} from '../src/config/roles.js';

const profile = (allowed_sub_modules, extra = {}) => ({
  role: ROLES.EXECUTIVE,
  team: 'sales',
  allowed_modules: [],
  allowed_sub_modules,
  ...extra,
});

const access = (p) => {
  const mods = getAccessibleModules(p);
  const paths = getAccessibleSubModulePaths(p);
  return {
    tabs: getAllowedIevCostingTabs(p, mods),
    can: (path) => isPathAllowed(path, mods, paths),
  };
};

const ALL_TABS = ['tender', 'costing', 'quotation', 'oc'];

describe('IEV Costing page-wise access', () => {
  it('lists the IEV Costing pages under IEV Costing in User Management', () => {
    const iev = NAV_MODULE_TREE.find((m) => m.value === 'fireTender');
    const costing = iev.subModules.find((s) => s.value === 'fireTender.costing');
    expect(costing.pathPrefix).toBe('/app/fire-tender/costing-hub');
    expect(costing.tabModules.map((t) => t.label)).toEqual(['New Tender', 'Costing Sheet', 'Quotation', 'PO At Glance']);
    expect(costing.tabModules.map((t) => t.value)).toEqual(IEV_COSTING_PAGES.map((p) => p.value));
    expect(iev.subModules.map((s) => s.value)).toEqual(['fireTender.dashboard', 'fireTender.costing', 'fireTender.manufacturing']);
  });

  it('keeps every tab for the IEV Costing sub-item (unchanged)', () => {
    const a = access(profile(['fireTender.costing']));
    expect(a.tabs).toEqual(ALL_TABS);
    expect(a.can('/app/fire-tender/costing-hub/tender')).toBe(true);
    expect(a.can('/app/fire-tender/costing-hub/oc')).toBe(true);
  });

  it('keeps every tab for the full IEV module, IEV team and the IEV Dashboard sub-item (unchanged)', () => {
    expect(access(profile([], { allowed_modules: ['fireTender'] })).tabs).toEqual(ALL_TABS);
    expect(access(profile([], { team: 'fireTender' })).tabs).toEqual(ALL_TABS);
    expect(access(profile(['fireTender.dashboard'])).tabs).toEqual(ALL_TABS);
    expect(access(profile([], { role: ROLES.SUPER_ADMIN })).tabs).toEqual(ALL_TABS);
  });

  it('shows only the ticked pages when IEV Costing itself is not ticked', () => {
    const a = access(profile(['fireTender.costing.quotation', 'fireTender.costing.po-at-glance']));
    expect(a.tabs).toEqual(['quotation', 'oc']);
    expect(a.can('/app/fire-tender/costing-hub/quotation')).toBe(true);
    expect(a.can('/app/fire-tender/quotation/12')).toBe(true);
    expect(a.can('/app/fire-tender/costing-hub/oc')).toBe(true);
    expect(a.can('/app/fire-tender/costing-hub/tender')).toBe(false);
    expect(a.can('/app/fire-tender/costing-hub/costing')).toBe(false);
    expect(a.can('/app/fire-tender/costing/12')).toBe(false);
    expect(a.can('/app/fire-tender')).toBe(false);
    expect(a.can('/app/fire-tender/configuration/price-master')).toBe(false);
  });

  it('Costing Sheet page includes the costing sheet detail page', () => {
    const a = access(profile(['fireTender.costing.costing-sheet']));
    expect(a.tabs).toEqual(['costing']);
    expect(a.can('/app/fire-tender/costing/7')).toBe(true);
    expect(a.can('/app/fire-tender/costing-hub/costing')).toBe(true);
    expect(a.can('/app/fire-tender/costing-hub/quotation')).toBe(false);
  });

  it('sidebar/IEV bar only offer what the user can open (no Access denied links)', () => {
    const p = profile(['fireTender.costing.po-at-glance']);
    const mods = getAccessibleModules(p);
    const paths = getAccessibleSubModulePaths(p);
    expect(getOpenableIevCostingTabs(p, mods, paths)).toEqual(['oc']);
    expect(isPathAllowed('/app/fire-tender', mods, paths)).toBe(false);
    expect(isPathAllowed('/app/fire-tender-manufacturing', mods, paths)).toBe(false);

    const mfg = profile(['fireTender.manufacturing']);
    expect(getOpenableIevCostingTabs(mfg, getAccessibleModules(mfg), getAccessibleSubModulePaths(mfg))).toEqual([]);

    const full = profile([], { allowed_modules: ['fireTender'] });
    expect(getOpenableIevCostingTabs(full, getAccessibleModules(full), getAccessibleSubModulePaths(full))).toEqual(ALL_TABS);
  });

  it('opens IEV Configuration pages picked under "Selected items" for page-only users', () => {
    const a = access(profile(['fireTender.costing.tender', 'iev-config.selected', 'iev-config.price-master']));
    expect(a.can('/app/fire-tender/configuration/price-master')).toBe(true);
    expect(a.can('/app/fire-tender/configuration/vehicle-type')).toBe(false);
    expect(access(profile(['iev-config.selected', 'iev-config.price-master'])).can('/app/fire-tender/configuration/price-master')).toBe(false);
    expect(access(profile(['fireTender.costing.tender'])).can('/app/fire-tender/configuration/price-master')).toBe(false);
  });

  it('does not change users without any IEV Costing page', () => {
    const mfg = access(profile(['fireTender.manufacturing']));
    expect(mfg.can('/app/fire-tender-manufacturing')).toBe(true);
    expect(mfg.can('/app/fire-tender/costing-hub/tender')).toBe(false);
    expect(access(profile([])).can('/app/fire-tender/costing-hub/tender')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  NAV_MODULE_TREE,
  PROJECTS_ENQUIRY_PAGES,
  ROLES,
  getAccessibleModules,
  getAccessibleSubModulePaths,
  getOpenableProjectsEnquiryTabs,
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
    tabs: getOpenableProjectsEnquiryTabs(p, mods, paths),
    can: (path) => isPathAllowed(path, mods, paths),
  };
};

const STANDARD_TABS = ['enquiry-dashboard', 'enquiry-database', 'enquiry-dropdown'];
const WITH_KPI = ['enquiry-dashboard', 'enquiry-database', 'enquiry-kpi', 'enquiry-dropdown'];
const BASE = '/app/projects/enquiry';
const KPI = `${BASE}/enquiry-kpi`;

describe('Projects Enquiry Master page-wise access', () => {
  it('lists the Enquiry Master pages under Enquiry Master in User Management, KPI as opt-in', () => {
    const projects = NAV_MODULE_TREE.find((m) => m.value === 'projects');
    const enquiry = projects.subModules.find((s) => s.value === 'projects.enquiry');
    expect(enquiry.pathPrefix).toBe(BASE);
    expect(enquiry.tabModules.map((t) => t.label)).toEqual(['Dashboard', 'Enquiry Database', 'KPI', 'Enquiry Dropdown']);
    expect(enquiry.tabModules.map((t) => t.value)).toEqual(PROJECTS_ENQUIRY_PAGES.map((p) => p.value));
    expect(enquiry.tabModules.filter((t) => t.optIn).map((t) => t.value)).toEqual(['projects.enquiry.kpi']);
  });

  it('Enquiry Master sub-item keeps the standard pages but not KPI', () => {
    const a = access(profile(['projects.enquiry']));
    expect(a.tabs).toEqual(STANDARD_TABS);
    expect(a.can(BASE)).toBe(true);
    expect(a.can(`${BASE}/enquiry-dropdown`)).toBe(true);
    expect(a.can(KPI)).toBe(false);
  });

  it('full Projects module does not get KPI without the tick', () => {
    const full = access(profile([], { allowed_modules: ['projects'] }));
    expect(full.tabs).toEqual(STANDARD_TABS);
    expect(full.can(KPI)).toBe(false);
  });

  it('Super Admins get every Enquiry Master page including KPI without a tick', () => {
    for (const role of [ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_PRO]) {
      const a = access(profile([], { role }));
      expect(a.tabs).toEqual(WITH_KPI);
      expect(a.can(KPI)).toBe(true);
      expect(a.can(`${BASE}/enquiry-database`)).toBe(true);
    }
  });

  it('Admin role still needs the KPI tick', () => {
    const a = access(profile([], { role: ROLES.ADMIN, allowed_modules: ['projects'] }));
    expect(a.can(KPI)).toBe(false);
  });

  it('KPI tick adds KPI on top of Enquiry Master or the Projects module', () => {
    expect(access(profile(['projects.enquiry', 'projects.enquiry.kpi'])).tabs).toEqual(WITH_KPI);
    const full = access(profile(['projects.enquiry.kpi'], { allowed_modules: ['projects'] }));
    expect(full.tabs).toEqual(WITH_KPI);
    expect(full.can(KPI)).toBe(true);
  });

  it('KPI tick alone opens only KPI', () => {
    const a = access(profile(['projects.enquiry.kpi']));
    expect(a.tabs).toEqual(['enquiry-kpi']);
    expect(a.can(KPI)).toBe(true);
    expect(a.can(`${BASE}/enquiry-database`)).toBe(false);
    expect(a.can(BASE)).toBe(false);
  });

  it('a single standard page grant opens only that page', () => {
    const a = access(profile(['projects.enquiry.dashboard']));
    expect(a.tabs).toEqual(['enquiry-dashboard']);
    expect(a.can(`${BASE}/enquiry-database`)).toBe(false);
    expect(a.can(KPI)).toBe(false);
  });

  it('several page grants open those pages; Enquiry Database also covers the old entry link', () => {
    const a = access(profile(['projects.enquiry.dashboard', 'projects.enquiry.database']));
    expect(a.tabs).toEqual(['enquiry-dashboard', 'enquiry-database']);
    expect(a.can(`${BASE}/enquiry-entry`)).toBe(true);
    expect(a.can(KPI)).toBe(false);
  });

  it('page grants do not open other Projects pages', () => {
    const a = access(profile(['projects.enquiry.database']));
    expect(a.can('/app/projects/quotation')).toBe(false);
    expect(a.can('/app/projects/po')).toBe(false);
  });

  it('users without Enquiry Master access get no pages', () => {
    expect(access(profile(['projects.quotation-master'])).tabs).toEqual([]);
    expect(access(profile([])).tabs).toEqual([]);
  });
});

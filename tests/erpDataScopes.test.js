/**
 * shared/erpDataScopes.mjs — the department data-scope rule used by the API server and the C2 RLS policies.
 * Also checks it never denies data to someone the UI lets open the matching pages.
 */
import { describe, expect, it } from 'vitest';
import { profileHasDataScope, ERP_DATA_SCOPES, OC_DEPARTMENT_SCOPE } from '../shared/erpDataScopes.mjs';
import { getAccessibleModules, getAccessibleSubModulePaths, isPathAllowed } from '../src/config/roles.js';

const base = { role: 'executive', team: null, allowed_modules: [], allowed_sub_modules: [], is_active: true };
const p = (over) => ({ ...base, ...over });

describe('profileHasDataScope', () => {
  it('Super Admin, Super Admin Pro and Admin/HOD keep all-department access', () => {
    for (const role of ['super_admin', 'SuperAdmin', 'super admin', 'super_admin_pro', 'admin', 'HOD']) {
      for (const scope of Object.keys(ERP_DATA_SCOPES)) {
        expect(profileHasDataScope(p({ role }), scope), `${role} ${scope}`).toBe(true);
      }
    }
  });

  it('inactive accounts have no access, whatever the role', () => {
    expect(profileHasDataScope(p({ role: 'super_admin', is_active: false }), 'projects')).toBe(false);
  });

  it('team labels, modules and sub-modules', () => {
    expect(profileHasDataScope(p({ team: 'Projects' }), 'projects')).toBe(true);
    expect(profileHasDataScope(p({ team: 'R&M' }), 'commercialRm')).toBe(true);
    expect(profileHasDataScope(p({ allowed_modules: ['commercialRm'] }), 'commercialRm')).toBe(true);
    expect(profileHasDataScope(p({ allowed_sub_modules: ['projects.po.budget'] }), 'projects')).toBe(true);
    expect(profileHasDataScope(p({ allowed_sub_modules: ['fireTender.costing.po-at-glance'] }), 'fireTender')).toBe(true);
    expect(profileHasDataScope(p({ team: 'HR' }), 'projects')).toBe(false);
    expect(profileHasDataScope(p({ team: 'Commercial' }), 'commercialRm')).toBe(false);
    expect(profileHasDataScope(null, 'projects')).toBe(false);
  });

  it('every PO At Glance department maps to a scope', () => {
    for (const scope of Object.values(OC_DEPARTMENT_SCOPE)) expect(ERP_DATA_SCOPES[scope]).toBeTruthy();
  });
});

describe('never stricter than the UI route guards', () => {
  const PAGES = {
    projects: ['/app/projects/quotation', '/app/projects/enquiry', '/app/projects/po/po-entry', '/app/projects-po-at-glance', '/app/projects-management', '/app/projects-billing'],
    commercialRm: ['/app/commercial/rm-mm-amc-iev/manpower-management', '/app/commercial/rm-mm-amc-iev/po-entry', '/app/commercial/rm-mm-amc-iev/po-at-glance'],
    maintenance: ['/app/maintenance/po-at-glance'],
    fireTender: ['/app/fire-tender/costing-hub/oc'],
    commercialMt: ['/app/commercial/manpower-training/po-at-glance'],
  };
  const teams = ['', 'Projects', 'projects', 'R&M', 'commercialRm', 'Sales', 'Commercial', 'Maintenance', 'Maintenance-FTC',
    'Fire Tender', 'Projects-FTC', 'Production-FTC', 'HR', 'Finance', 'Management', 'Information System'];
  const moduleSets = [[], ['projects'], ['commercialRm'], ['sales'], ['commercialMt'], ['maintenance'], ['fireTender'], ['billing', 'commercialRm']];
  const subSets = [[], ['projects.quotation-master'], ['projects.enquiry.kpi'], ['commercialRm.enquiry'], ['maintenance.po-at-glance'],
    ['fireTender.costing.po-at-glance'], ['commercialMt.po-at-glance'], ['hr.recruitment.candidates']];
  const roles = ['executive', 'manager', 'admin', 'super_admin'];

  it('anyone who can open a department page is in that department’s data scope', () => {
    let checked = 0;
    for (const role of roles) for (const team of teams) for (const allowed_modules of moduleSets) for (const allowed_sub_modules of subSets) {
      const profile = p({ role, team, allowed_modules, allowed_sub_modules });
      const modules = getAccessibleModules(profile);
      const subPaths = getAccessibleSubModulePaths(profile);
      for (const [scope, pages] of Object.entries(PAGES)) {
        if (pages.some((path) => isPathAllowed(path, modules, subPaths))) {
          expect(profileHasDataScope(profile, scope), `${scope} ${JSON.stringify(profile)}`).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

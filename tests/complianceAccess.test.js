import { describe, it, expect } from 'vitest';
import {
  canAccessCompliance,
  canAccessComplianceSection,
  canOpenCompliancePath,
} from '../src/pages/compliance/payroll/complianceAccess.js';
import {
  ROLES,
  canSeeSubModule,
  getAccessibleModules,
  getAccessibleSubModulePaths,
  isPathAllowed,
} from '../src/config/roles.js';

const user = (extra) => ({
  role: ROLES.EXECUTIVE,
  team: 'Sales',
  email: 'someone@indusfire.com',
  allowed_modules: [],
  allowed_sub_modules: [],
  ...extra,
});

const routeOk = (p, path) =>
  isPathAllowed(path, getAccessibleModules(p), getAccessibleSubModulePaths(p), p);

const ALLOWED = [
  'rahul.ifspl@gmail.com',
  'vivek@indusfire.com',
  'sharmavivekz683@gmail.com',
  'vaisakh@indusfire.com',
  'vaishak@indusfire.com',
  'vaisakh_fire@yahoo.co.in',
];

describe('Compliance access', () => {
  it('Vivek, Vaisakh, and Rahul open every section', () => {
    for (const email of ALLOWED) {
      const p = user({ email });
      expect(canAccessCompliance(p)).toBe(true);
      expect(routeOk(p, '/app/compliance/dashboard')).toBe(true);
      expect(routeOk(p, '/app/ifsp-employee-compliance')).toBe(true);
      expect(routeOk(p, '/app/general-compliance')).toBe(true);
    }
  });

  it('other people cannot open Compliance', () => {
    for (const email of ['latha@indusfire.com', 'bency@indusfire.com', 'amitp.ifspl@gmail.com', 'someone@indusfire.com']) {
      const p = user({ email });
      expect(canAccessCompliance(p)).toBe(false);
      expect(routeOk(p, '/app/compliance/dashboard')).toBe(false);
      expect(routeOk(p, '/app/general-compliance')).toBe(false);
    }
  });

  it('Super Admin and User Management grants do not open Compliance', () => {
    expect(routeOk(user({ role: ROLES.SUPER_ADMIN }), '/app/compliance/dashboard')).toBe(false);
    expect(routeOk(user({ role: ROLES.ADMIN }), '/app/compliance/dashboard')).toBe(false);
    expect(routeOk(user({ allowed_modules: ['compliance'] }), '/app/compliance/forms')).toBe(false);
    expect(canAccessCompliance(user({ team: 'Compliance' }))).toBe(false);
    const sectionOnly = user({ allowed_sub_modules: ['compliance.general'] });
    expect(canAccessCompliance(sectionOnly)).toBe(false);
    expect(canOpenCompliancePath(sectionOnly, null, '/app/general-compliance')).toBe(false);
    const mods = getAccessibleModules(sectionOnly);
    expect(canSeeSubModule(sectionOnly, mods, 'compliance.general')).toBe(false);
    expect(canAccessComplianceSection(sectionOnly, null, 'compliance.payroll')).toBe(false);
  });
});

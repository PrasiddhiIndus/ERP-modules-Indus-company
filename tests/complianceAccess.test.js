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

describe('Compliance access', () => {
  it('approved emails keep every section (unchanged)', () => {
    const p = user({ email: 'latha@indusfire.com' });
    expect(canAccessCompliance(p)).toBe(true);
    expect(routeOk(p, '/app/compliance/dashboard')).toBe(true);
    expect(routeOk(p, '/app/ifsp-employee-compliance')).toBe(true);
    expect(routeOk(p, '/app/general-compliance')).toBe(true);
  });

  it('users without any Compliance grant still cannot open it', () => {
    const p = user();
    expect(canAccessCompliance(p)).toBe(false);
    expect(routeOk(p, '/app/compliance/dashboard')).toBe(false);
    expect(routeOk(p, '/app/general-compliance')).toBe(false);
  });

  it('Super Admin and Super Admin Pro open every section', () => {
    for (const role of [ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_PRO]) {
      const p = user({ role });
      expect(routeOk(p, '/app/compliance/dashboard')).toBe(true);
      expect(routeOk(p, '/app/ifsp-employee-compliance')).toBe(true);
      expect(routeOk(p, '/app/general-compliance')).toBe(true);
    }
    expect(routeOk(user({ role: ROLES.ADMIN }), '/app/compliance/dashboard')).toBe(false);
  });

  it('the Compliance module in User Management opens every section', () => {
    const p = user({ allowed_modules: ['compliance'] });
    expect(routeOk(p, '/app/compliance/forms')).toBe(true);
    expect(routeOk(p, '/app/ifsp-employee-compliance')).toBe(true);
    expect(routeOk(p, '/app/general-compliance')).toBe(true);
  });

  it('the Compliance team opens every section', () => {
    expect(canAccessCompliance(user({ team: 'Compliance' }))).toBe(true);
  });

  it('a single section opens only that section', () => {
    const p = user({ allowed_sub_modules: ['compliance.general'] });
    expect(canAccessCompliance(p)).toBe(true);
    expect(routeOk(p, '/app/general-compliance')).toBe(true);
    expect(routeOk(p, '/app/compliance/dashboard')).toBe(false);
    expect(routeOk(p, '/app/ifsp-employee-compliance')).toBe(false);
    const mods = getAccessibleModules(p);
    expect(canSeeSubModule(p, mods, 'compliance.general')).toBe(true);
    expect(canSeeSubModule(p, mods, 'compliance.payroll')).toBe(false);
    expect(canOpenCompliancePath(p, null, '/app/compliance/payroll-process')).toBe(false);
  });

  it('inactive accounts get no Compliance from User Management', () => {
    const p = user({ is_active: false, allowed_modules: ['compliance'], allowed_sub_modules: ['compliance.payroll'] });
    expect(canAccessComplianceSection(p, null, 'compliance.payroll')).toBe(false);
  });
});

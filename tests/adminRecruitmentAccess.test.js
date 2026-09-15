import { describe, it, expect } from 'vitest';
import {
  getAccessibleModules,
  getAccessibleSubModulePaths,
  getVisibleRecruitmentTabs,
  getRecruitmentLandingPath,
  hasAnyRecruitmentTabAccess,
  isPathAllowed,
  toggleRecruitmentAccessKey,
  ROLES,
} from '../src/config/roles.js';

const adminProfile = {
  role: ROLES.EXECUTIVE,
  team: 'admin',
  allowed_modules: ['admin'],
  allowed_sub_modules: [],
};

const adminRecruitmentOnly = {
  role: ROLES.EXECUTIVE,
  team: null,
  allowed_modules: [],
  allowed_sub_modules: ['admin.recruitment', 'admin.recruitment.dashboard', 'admin.recruitment.candidates', 'admin.recruitment.offer-generation', 'admin.recruitment.offer-response', 'admin.recruitment.joining', 'admin.recruitment.iom', 'admin.recruitment.conversion'],
};

const adminCandidatesOnly = {
  role: ROLES.EXECUTIVE,
  team: null,
  allowed_modules: [],
  allowed_sub_modules: ['admin.recruitment.candidates'],
};

describe('Admin Recruitment replica access', () => {
  it('full Admin module sees the Calling Database workflow tabs (not referral unless full-module opt-in path)', () => {
    const mods = getAccessibleModules(adminProfile);
    const tabs = getVisibleRecruitmentTabs(adminProfile, mods, null, 'admin');
    const labels = tabs.map((t) => t.label);
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Candidates');
    expect(labels).toContain('Offer Generation');
    expect(labels).toContain('Conversion');
    expect(labels).toContain('Add Referral');
    expect(labels).not.toContain('Dropdown Master');
    expect(getRecruitmentLandingPath(adminProfile, mods, null, 'admin')).toBe('/app/admin/recruitment');
  });

  it('admin.recruitment parent grants workflow tabs and lands on dashboard', () => {
    const mods = getAccessibleModules(adminRecruitmentOnly);
    expect(hasAnyRecruitmentTabAccess(adminRecruitmentOnly, mods, null, 'admin')).toBe(true);
    const tabs = getVisibleRecruitmentTabs(adminRecruitmentOnly, mods, null, 'admin');
    expect(tabs.map((t) => t.tabTo)).toEqual(
      expect.arrayContaining(['.', 'candidates', 'offer-generation', 'conversion'])
    );
    expect(tabs.some((t) => t.tabTo === 'referral')).toBe(false);
  });

  it('candidates-only grant cannot open offer generation', () => {
    const mods = getAccessibleModules(adminCandidatesOnly);
    const paths = getAccessibleSubModulePaths(adminCandidatesOnly);
    expect(isPathAllowed('/app/admin/recruitment/candidates', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/offer-generation', mods, paths)).toBe(false);
    expect(isPathAllowed('/app/admin/employee/master', mods, paths)).toBe(false);
  });

  it('toggleRecruitmentAccessKey expands admin.recruitment like HR calling-master', () => {
    const next = toggleRecruitmentAccessKey([], 'admin.recruitment');
    expect(next).toContain('admin.recruitment');
    expect(next).toContain('admin.recruitment.candidates');
    expect(next).toContain('admin.recruitment.conversion');
    expect(next).not.toContain('admin.recruitment.referral');
    expect(toggleRecruitmentAccessKey(next, 'admin.recruitment')).toEqual([]);
  });

  it('full Admin module can open Admin recruitment routes', () => {
    const mods = getAccessibleModules(adminProfile);
    const paths = getAccessibleSubModulePaths(adminProfile);
    expect(isPathAllowed('/app/admin/recruitment', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/conversion', mods, paths)).toBe(true);
  });

  it('Employee Administration grant includes Calling Database workflow', () => {
    const profile = {
      role: ROLES.EXECUTIVE,
      team: null,
      allowed_modules: [],
      allowed_sub_modules: ['admin.employee'],
    };
    const mods = getAccessibleModules(profile);
    const paths = getAccessibleSubModulePaths(profile);
    expect(isPathAllowed('/app/admin/recruitment/candidates', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/conversion', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/referral', mods, paths)).toBe(false);
    expect(getVisibleRecruitmentTabs(profile, mods, null, 'admin').map((t) => t.tabTo)).toEqual(
      expect.arrayContaining(['.', 'candidates', 'conversion'])
    );
  });
});

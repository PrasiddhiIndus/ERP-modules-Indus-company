import { describe, it, expect } from 'vitest';
import {
  getAccessibleModules,
  getAccessibleSubModulePaths,
  getVisibleRecruitmentTabs,
  getRecruitmentLandingPath,
  hasAnyRecruitmentTabAccess,
  isPathAllowed,
  toggleRecruitmentAccessKey,
  canSeeSubModule,
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

const adminWithRecruitment = {
  role: ROLES.EXECUTIVE,
  team: 'admin',
  allowed_modules: ['admin'],
  allowed_sub_modules: ['admin.recruitment'],
};

const adminCandidatesOnly = {
  role: ROLES.EXECUTIVE,
  team: null,
  allowed_modules: [],
  allowed_sub_modules: ['admin.recruitment.candidates'],
};

describe('Admin Recruitment replica access', () => {
  it('full Admin module alone does not see In-house Recruitment', () => {
    const mods = getAccessibleModules(adminProfile);
    expect(hasAnyRecruitmentTabAccess(adminProfile, mods, null, 'admin')).toBe(false);
    expect(getVisibleRecruitmentTabs(adminProfile, mods, null, 'admin')).toEqual([]);
    expect(canSeeSubModule(adminProfile, mods, 'admin.recruitment')).toBe(false);
  });

  it('explicit admin.recruitment grant opens every workflow section', () => {
    const mods = getAccessibleModules(adminWithRecruitment);
    const tabs = getVisibleRecruitmentTabs(adminWithRecruitment, mods, null, 'admin');
    const labels = tabs.map((t) => t.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Dashboard', 'Requisitions', 'Candidates', 'Interviews', 'Offers', 'Documents', 'Joining', 'Employee Conversion', 'Communication', 'Reports', 'Settings'])
    );
    expect(labels).not.toContain('Offer Generation');
    expect(labels).not.toContain('Dropdown Master');
    expect(getRecruitmentLandingPath(adminWithRecruitment, mods, null, 'admin')).toBe('/app/admin/recruitment');
    expect(canSeeSubModule(adminWithRecruitment, mods, 'admin.recruitment')).toBe(true);
  });

  it('admin.recruitment parent grants workflow tabs and lands on dashboard', () => {
    const mods = getAccessibleModules(adminRecruitmentOnly);
    expect(hasAnyRecruitmentTabAccess(adminRecruitmentOnly, mods, null, 'admin')).toBe(true);
    const tabs = getVisibleRecruitmentTabs(adminRecruitmentOnly, mods, null, 'admin');
    expect(tabs.map((t) => t.tabTo)).toEqual(
      expect.arrayContaining(['.', 'candidates', 'interviews', 'offers', 'documents', 'conversion'])
    );
    expect(tabs.some((t) => t.tabTo === 'referral')).toBe(false);
  });

  it('candidates-only grant cannot open offers', () => {
    const mods = getAccessibleModules(adminCandidatesOnly);
    const paths = getAccessibleSubModulePaths(adminCandidatesOnly);
    expect(isPathAllowed('/app/admin/recruitment/candidates', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/candidates/abc', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/offers', mods, paths)).toBe(false);
    expect(isPathAllowed('/app/admin/employee/master', mods, paths)).toBe(false);
  });

  it('access granted under retired Admin tab keys opens the equivalent new section', () => {
    const profile = {
      role: ROLES.EXECUTIVE,
      team: null,
      allowed_modules: [],
      allowed_sub_modules: ['admin.recruitment.offer-generation', 'admin.recruitment.iom'],
    };
    const mods = getAccessibleModules(profile);
    const paths = getAccessibleSubModulePaths(profile);
    expect(isPathAllowed('/app/admin/recruitment/offers', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/joining', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/candidates', mods, paths)).toBe(false);
    expect(getVisibleRecruitmentTabs(profile, mods, null, 'admin').map((t) => t.tabTo)).toEqual(['offers', 'joining']);
  });

  it('toggleRecruitmentAccessKey expands admin.recruitment like HR calling-master', () => {
    const next = toggleRecruitmentAccessKey([], 'admin.recruitment');
    expect(next).toContain('admin.recruitment');
    expect(next).toContain('admin.recruitment.candidates');
    expect(next).toContain('admin.recruitment.conversion');
    expect(next).not.toContain('admin.recruitment.referral');
    expect(toggleRecruitmentAccessKey(next, 'admin.recruitment')).toEqual([]);
  });

  it('full Admin module cannot open Admin recruitment routes without explicit grant', () => {
    const mods = getAccessibleModules(adminProfile);
    const paths = getAccessibleSubModulePaths(adminProfile);
    expect(isPathAllowed('/app/admin/recruitment', mods, paths)).toBe(false);
    expect(isPathAllowed('/app/admin/recruitment/conversion', mods, paths)).toBe(false);
  });

  it('Admin module plus explicit Recruitment grant can open recruitment routes', () => {
    const mods = getAccessibleModules(adminWithRecruitment);
    const paths = getAccessibleSubModulePaths(adminWithRecruitment);
    expect(isPathAllowed('/app/admin/recruitment', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/requisitions', mods, paths)).toBe(true);
    expect(isPathAllowed('/app/admin/recruitment/conversion', mods, paths)).toBe(true);
  });

  it('Employee Administration grant does not include Recruitment', () => {
    const profile = {
      role: ROLES.EXECUTIVE,
      team: null,
      allowed_modules: [],
      allowed_sub_modules: ['admin.employee'],
    };
    const mods = getAccessibleModules(profile);
    const paths = getAccessibleSubModulePaths(profile);
    expect(isPathAllowed('/app/admin/recruitment/candidates', mods, paths)).toBe(false);
    expect(isPathAllowed('/app/admin/recruitment/conversion', mods, paths)).toBe(false);
    expect(hasAnyRecruitmentTabAccess(profile, mods, null, 'admin')).toBe(false);
    expect(isPathAllowed('/app/admin/employee', mods, paths)).toBe(true);
  });
});

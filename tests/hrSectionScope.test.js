import { describe, it, expect } from 'vitest';
import {
  ROLES,
  canSeeSubModule,
  getAccessibleModules,
  getAccessibleSubModulePaths,
  getNavVisibleModuleKeys,
  getLandingPathForUser,
  getRecruitmentLandingPath,
  hasAnyRecruitmentTabAccess,
  hasHrSectionScope,
  isPathAllowed,
  toggleRecruitmentAccessKey,
} from '../src/config/roles.js';

const HR_SECTIONS = [
  'hr.dashboard',
  'hr.employee-master',
  'hr.calling-master',
  'hr.attendance',
  'hr.salary-management',
  'hr.people-management',
  'hr.site-attendance',
];

const user = (extra) => ({
  role: ROLES.EXECUTIVE,
  team: 'HR',
  email: 'someone@indusfire.com',
  allowed_modules: [],
  allowed_sub_modules: [],
  ...extra,
});

const visibleSections = (p) => {
  const mods = getAccessibleModules(p);
  return HR_SECTIONS.filter((key) =>
    key === 'hr.calling-master'
      ? canSeeSubModule(p, mods, key) || hasAnyRecruitmentTabAccess(p, mods)
      : canSeeSubModule(p, mods, key)
  );
};

const opens = (p, path) => isPathAllowed(path, getAccessibleModules(p), getAccessibleSubModulePaths(p), p);

describe('HR team: only ticked HR sections', () => {
  const recruitmentAndSite = user({
    allowed_sub_modules: [...toggleRecruitmentAccessKey([], 'hr.calling-master'), 'hr.site-attendance'],
  });

  it('Recruitment + Site Attendance ticked → only those two show', () => {
    expect(hasHrSectionScope(recruitmentAndSite)).toBe(true);
    expect(visibleSections(recruitmentAndSite)).toEqual(['hr.calling-master', 'hr.site-attendance']);
    const mods = getAccessibleModules(recruitmentAndSite);
    expect(mods.has('hr')).toBe(false);
    expect(getNavVisibleModuleKeys(recruitmentAndSite, mods).has('hr')).toBe(true);
  });

  it('routes follow the ticks', () => {
    const p = recruitmentAndSite;
    expect(opens(p, '/app/hr/site-attendance')).toBe(true);
    expect(opens(p, getRecruitmentLandingPath(p, getAccessibleModules(p)))).toBe(true);
    expect(opens(p, '/app/hr/employee-master')).toBe(false);
    expect(opens(p, '/app/attendance')).toBe(false);
    expect(opens(p, '/app/hr/payroll/salary')).toBe(false);
    expect(opens(p, '/app/people-management')).toBe(false);
    expect(opens(p, '/app/hr/dashboard')).toBe(false);
  });

  it('lands on the first ticked section', () => {
    const p = recruitmentAndSite;
    const mods = getAccessibleModules(p);
    expect(getLandingPathForUser(p, mods)).toBe(getRecruitmentLandingPath(p, mods));
    const siteOnly = user({ allowed_sub_modules: ['hr.site-attendance'] });
    expect(getLandingPathForUser(siteOnly, getAccessibleModules(siteOnly))).toBe('/app/hr/site-attendance');
  });

  it('only Recruitment pages ticked → only Recruitment', () => {
    const p = user({ allowed_sub_modules: ['hr.recruitment.candidates'] });
    expect(visibleSections(p)).toEqual(['hr.calling-master']);
    expect(opens(p, '/app/hr/employee-master')).toBe(false);
  });
});

describe('HR team: unchanged cases', () => {
  it('nothing ticked → all of HR', () => {
    const p = user();
    expect(hasHrSectionScope(p)).toBe(false);
    expect(visibleSections(p)).toEqual(HR_SECTIONS);
    expect(opens(p, '/app/hr/employee-master')).toBe(true);
  });

  it('HR ticked as a full module → all of HR even with sections ticked', () => {
    const p = user({ allowed_modules: ['hr'], allowed_sub_modules: ['hr.site-attendance'] });
    expect(hasHrSectionScope(p)).toBe(false);
    expect(visibleSections(p)).toEqual(HR_SECTIONS);
  });

  it('opt-in Add Referral alone does not limit HR', () => {
    const p = user({ allowed_sub_modules: ['hr.recruitment.referral'] });
    expect(hasHrSectionScope(p)).toBe(false);
    expect(visibleSections(p)).toEqual(HR_SECTIONS);
  });

  it('Fire / Safety and site attendance page options do not limit HR', () => {
    const p = user({ allowed_sub_modules: ['calling-scope.fire', 'site-attendance-page.daily'] });
    expect(hasHrSectionScope(p)).toBe(false);
    expect(visibleSections(p)).toEqual(HR_SECTIONS);
  });

  it('other team with HR sections → only those sections (as before)', () => {
    const p = user({ team: 'Sales', allowed_sub_modules: ['hr.site-attendance', 'hr.attendance'] });
    expect(hasHrSectionScope(p)).toBe(false);
    expect(visibleSections(p)).toEqual(['hr.attendance', 'hr.site-attendance']);
    expect(getAccessibleModules(p).has('sales')).toBe(true);
  });

  it('Super Admin is never limited', () => {
    const p = user({ role: ROLES.SUPER_ADMIN, allowed_sub_modules: ['hr.site-attendance'] });
    expect(visibleSections(p)).toEqual(HR_SECTIONS);
  });
});

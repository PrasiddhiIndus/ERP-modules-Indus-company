import { describe, it, expect } from 'vitest';
import {
  NAV_MODULE_TREE,
  ROLES,
  getAccessibleModules,
  getAccessibleSubModulePaths,
  canSeeSubModule,
  isPathAllowed,
  getNavPageKeyForPath,
  canSeeNavPath,
} from '../src/config/roles.js';

const ctx = (profile) => ({
  profile,
  accessibleModules: getAccessibleModules(profile),
  subModulePaths: getAccessibleSubModulePaths(profile),
  userMetadata: { email: 'someone@indusfire.com' },
});
const exec = (subs, extra = {}) => ({
  role: ROLES.EXECUTIVE,
  team: '',
  email: 'someone@indusfire.com',
  allowed_modules: [],
  allowed_sub_modules: subs,
  ...extra,
});

const NAV_PAGES = NAV_MODULE_TREE.flatMap((m) => (m.subModules || []).filter((s) => s.pathPrefix));

describe('getNavPageKeyForPath', () => {
  it('picks the most specific navigation page', () => {
    expect(getNavPageKeyForPath('/app/billing')).toBe('billing.dashboard');
    expect(getNavPageKeyForPath('/app/billing/create-invoice/123')).toBe('billing.create');
    expect(getNavPageKeyForPath('/app/admin/employee/master')).toBe('admin.employee-master');
    expect(getNavPageKeyForPath('/app/admin/employee/onboarding')).toBe('admin.employee');
    expect(getNavPageKeyForPath('/app/amc/contracts?x=1')).toBe('amc.contracts');
    expect(getNavPageKeyForPath('/app/settings')).toBeNull();
  });
});

describe('canSeeNavPath — only pages the user holds', () => {
  it('AMC: a single page grant shows that page only', () => {
    const c = ctx(exec(['amc.customers']));
    expect(canSeeNavPath('/app/amc/customers', c)).toBe(true);
    expect(canSeeNavPath('/app/amc/contracts', c)).toBe(false);
    expect(canSeeNavPath('/app/amc', c)).toBe(false);
  });

  it('dashboard-only grants do not list sibling pages (route guard is left as it is)', () => {
    const c = ctx(exec(['marketing.dashboard']));
    expect(canSeeNavPath('/app/marketing', c)).toBe(true);
    expect(canSeeNavPath('/app/marketing/lead-master', c)).toBe(false);
    // Existing direct-URL behaviour is unchanged: the guard still decides deep links.
    expect(isPathAllowed('/app/marketing/lead-master', c.accessibleModules, c.subModulePaths)).toBe(true);
  });

  it('IT/IS: API Health alone does not show Software Subscriptions', () => {
    const c = ctx(exec(['itIs.api-health']));
    expect(canSeeNavPath('/app/api-health', c)).toBe(true);
    expect(canSeeNavPath('/app/software-subscriptions-reminders', c)).toBe(false);
  });

  it('Site Operations: Fleet alone does not show Manpower Operations', () => {
    const c = ctx(exec(['operations.fleet']));
    expect(canSeeNavPath('/app/fire-tender-vehicle-management', c)).toBe(true);
    expect(canSeeNavPath('/app/operations', c)).toBe(false);
  });

  it('full module access still shows every page of that module', () => {
    const c = ctx(exec([], { allowed_modules: ['billing'] }));
    for (const page of NAV_PAGES.filter((p) => p.value.startsWith('billing.'))) {
      expect(canSeeNavPath(page.pathPrefix, c)).toBe(true);
    }
  });

  it('Super Admin sees every navigation page that is not hard-gated', () => {
    const c = ctx({ role: ROLES.SUPER_ADMIN, team: '', email: 'someone@indusfire.com', allowed_modules: [], allowed_sub_modules: [] });
    for (const page of NAV_PAGES.filter((p) => !p.value.startsWith('compliance.') && p.value !== 'admin.salary-admin')) {
      expect(canSeeNavPath(page.pathPrefix, c), page.value).toBe(true);
    }
  });

  it('never shows a page the route guard blocks, or one the user does not hold (every single-page grant)', () => {
    for (const role of [ROLES.EXECUTIVE, ROLES.MANAGER, ROLES.ADMIN]) {
      for (const grant of NAV_PAGES) {
        const profile = exec([grant.value], { role });
        const c = ctx(profile);
        for (const page of NAV_PAGES) {
          if (!canSeeNavPath(page.pathPrefix, c)) continue;
          expect(isPathAllowed(page.pathPrefix, c.accessibleModules, c.subModulePaths, profile), `${grant.value} → ${page.value}`).toBe(true);
          // Pages sharing one URL (Client / In-House Mail Outreach): holding either one shows the link.
          const owners = NAV_PAGES.filter((p) => p.pathPrefix === page.pathPrefix);
          expect(
            owners.some((o) => canSeeSubModule(profile, c.accessibleModules, o.value, c.userMetadata)),
            `${grant.value} → ${page.value}`
          ).toBe(true);
        }
        // The granted page itself stays visible whenever the route guard opens it.
        if (isPathAllowed(grant.pathPrefix, c.accessibleModules, c.subModulePaths, profile)) {
          expect(canSeeNavPath(grant.pathPrefix, c), grant.value).toBe(true);
        }
      }
    }
  });

  it('is read-only: access sets are identical before and after the checks', () => {
    const profile = exec(['amc.customers', 'hr.recruitment.candidates']);
    const before = [[...getAccessibleModules(profile)].sort(), [...getAccessibleSubModulePaths(profile)].sort()];
    const c = ctx(profile);
    NAV_PAGES.forEach((p) => canSeeNavPath(p.pathPrefix, c));
    expect([[...getAccessibleModules(profile)].sort(), [...getAccessibleSubModulePaths(profile)].sort()]).toEqual(before);
    expect(profile.allowed_sub_modules).toEqual(['amc.customers', 'hr.recruitment.candidates']);
  });
});

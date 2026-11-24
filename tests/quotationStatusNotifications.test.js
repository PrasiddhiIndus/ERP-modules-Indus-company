import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/config/roles.js';
import {
  canReceiveQuotationStatusNotifications,
  isProjectsDepartment,
  isProjectsL1AuthorityDesignation,
} from '../src/pages/projects/quotation/quotationNotificationRoles.js';

describe('canReceiveQuotationStatusNotifications', () => {
  const projects = new Set(['projects']);

  it('allows Manager and Executive with Projects access', () => {
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.MANAGER }, projects)).toBe(true);
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.EXECUTIVE }, projects)).toBe(true);
    expect(canReceiveQuotationStatusNotifications({ role: 'Manager' }, projects)).toBe(true);
  });

  it('excludes Admin and Super Admin even with Projects access (L1 checked via RPC)', () => {
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.ADMIN }, projects)).toBe(false);
    expect(canReceiveQuotationStatusNotifications({ role: 'hod' }, projects)).toBe(false);
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.SUPER_ADMIN }, projects)).toBe(false);
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.SUPER_ADMIN_PRO }, projects)).toBe(false);
  });

  it('requires Projects module access', () => {
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.MANAGER }, new Set(['hr']))).toBe(false);
    expect(
      canReceiveQuotationStatusNotifications(
        { role: ROLES.MANAGER, allowed_sub_modules: ['projects.quotation'] },
        new Set()
      )
    ).toBe(true);
  });
});

describe('Projects Department L1 mapping (no hardcoded people)', () => {
  it('recognises Projects department aliases', () => {
    expect(isProjectsDepartment('Projects')).toBe(true);
    expect(isProjectsDepartment('project')).toBe(true);
    expect(isProjectsDepartment('Projects-FTC')).toBe(false);
    expect(isProjectsDepartment('HR')).toBe(false);
  });

  it('recognises Manager / Senior Manager authority designations', () => {
    expect(isProjectsL1AuthorityDesignation('Manager')).toBe(true);
    expect(isProjectsL1AuthorityDesignation('Senior Manager')).toBe(true);
    expect(isProjectsL1AuthorityDesignation('Manager - Projects')).toBe(true);
    expect(isProjectsL1AuthorityDesignation('Senior Manager / Projects')).toBe(true);
  });

  it('excludes Assistant Manager and non-authority titles', () => {
    expect(isProjectsL1AuthorityDesignation('Assistant Manager')).toBe(false);
    expect(isProjectsL1AuthorityDesignation('Asst. Manager')).toBe(false);
    expect(isProjectsL1AuthorityDesignation('Asst Manager - Projects')).toBe(false);
    expect(isProjectsL1AuthorityDesignation('Executive')).toBe(false);
    expect(isProjectsL1AuthorityDesignation('Team Lead')).toBe(false);
    expect(isProjectsL1AuthorityDesignation('')).toBe(false);
  });
});

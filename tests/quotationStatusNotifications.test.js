import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/config/roles.js';
import { canReceiveQuotationStatusNotifications } from '../src/pages/projects/quotation/quotationNotificationRoles.js';

describe('canReceiveQuotationStatusNotifications', () => {
  const projects = new Set(['projects']);

  it('allows Manager and Executive with Projects access', () => {
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.MANAGER }, projects)).toBe(true);
    expect(canReceiveQuotationStatusNotifications({ role: ROLES.EXECUTIVE }, projects)).toBe(true);
    expect(canReceiveQuotationStatusNotifications({ role: 'Manager' }, projects)).toBe(true);
  });

  it('excludes Admin and Super Admin even with Projects access', () => {
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

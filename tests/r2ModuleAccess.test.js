import { describe, it, expect } from 'vitest';
import {
  hasSoftwareSubscriptionsR2Access,
  hasFleetR2Access,
  hasHrCallingR2Access,
} from '../server/authMiddleware.js';

function ctx(profile) {
  return { profile };
}

describe('R2 module gates — login is not permission', () => {
  const billingOnly = {
    role: 'executive',
    team: 'billing',
    allowed_modules: ['billing'],
    allowed_sub_modules: [],
  };

  const hrUser = {
    role: 'executive',
    team: 'hr',
    allowed_modules: ['hr'],
    allowed_sub_modules: [],
  };

  const hrRecruitmentOnly = {
    role: 'executive',
    team: null,
    allowed_modules: [],
    allowed_sub_modules: ['hr.calling-master'],
  };

  const operationsUser = {
    role: 'manager',
    team: 'operations',
    allowed_modules: ['operations'],
    allowed_sub_modules: [],
  };

  const itIsUser = {
    role: 'executive',
    team: 'itIs',
    allowed_modules: ['itIs'],
    allowed_sub_modules: [],
  };

  const superAdmin = {
    role: 'super_admin',
    team: null,
    allowed_modules: [],
    allowed_sub_modules: [],
  };

  it('billing-only cannot download HR CVs, fleet papers, or IT invoices', () => {
    expect(hasHrCallingR2Access(ctx(billingOnly))).toBe(false);
    expect(hasFleetR2Access(ctx(billingOnly))).toBe(false);
    expect(hasSoftwareSubscriptionsR2Access(ctx(billingOnly))).toBe(false);
  });

  it('HR user (and recruitment sub-module) can open candidate files, not IT invoices', () => {
    expect(hasHrCallingR2Access(ctx(hrUser))).toBe(true);
    expect(hasHrCallingR2Access(ctx(hrRecruitmentOnly))).toBe(true);
    expect(hasSoftwareSubscriptionsR2Access(ctx(hrUser))).toBe(false);
    expect(hasFleetR2Access(ctx(hrUser))).toBe(false);
  });

  it('operations can open fleet papers for the shared board', () => {
    expect(hasFleetR2Access(ctx(operationsUser))).toBe(true);
    expect(hasHrCallingR2Access(ctx(operationsUser))).toBe(false);
    expect(hasSoftwareSubscriptionsR2Access(ctx(operationsUser))).toBe(false);
  });

  it('IT/IS and Super Admin can open subscription invoices', () => {
    expect(hasSoftwareSubscriptionsR2Access(ctx(itIsUser))).toBe(true);
    expect(hasSoftwareSubscriptionsR2Access(ctx(superAdmin))).toBe(true);
    expect(hasHrCallingR2Access(ctx(superAdmin))).toBe(true);
    expect(hasFleetR2Access(ctx(superAdmin))).toBe(true);
  });
});

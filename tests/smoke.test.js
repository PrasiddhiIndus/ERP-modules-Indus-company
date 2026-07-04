import { describe, it, expect } from 'vitest';
import { computePF } from '../src/modules/payroll/calc/statutory.js';
import {
  canPunchSyncOverwriteExisting,
  isLeaveMarkSource,
} from '../shared/attendanceRegisterSync.mjs';
import { createAuthMiddleware } from '../server/authMiddleware.js';

describe('computePF', () => {
  it('splits employer contribution into EPF 3.67% within 12% cap', () => {
    const result = computePF({ pfWages: 15000, applicable: true });
    expect(result.employeeContribution).toBe(1800);
    expect(result.epsContribution).toBe(1249.5);
    expect(result.employerContribution).toBe(550.5);
    expect(result.employerContribution + result.epsContribution).toBeCloseTo(1800, 1);
  });
});

describe('canPunchSyncOverwriteExisting', () => {
  it('does not overwrite approved leave marks', () => {
    const existing = { mark: 'PL', mark_source: 'leave', leave_request_id: 'abc' };
    expect(canPunchSyncOverwriteExisting(existing)).toBe(false);
  });

  it('allows overwrite on empty cell', () => {
    expect(canPunchSyncOverwriteExisting(null)).toBe(true);
  });
});

describe('isLeaveMarkSource', () => {
  it('detects leave linkage', () => {
    expect(isLeaveMarkSource('punch', 'req-1')).toBe(true);
    expect(isLeaveMarkSource('leave', null)).toBe(true);
  });
});

describe('createAuthMiddleware', () => {
  it('exports required guards', () => {
    const guards = createAuthMiddleware({
      getSupabaseUrl: () => 'https://example.supabase.co',
      getServiceRoleKey: () => 'svc',
      getAnonKey: () => 'anon',
      HttpError: class extends Error {
        constructor(status, message) {
          super(message);
          this.status = status;
        }
      },
    });
    expect(typeof guards.requireAuth).toBe('function');
    expect(typeof guards.requireAdmin).toBe('function');
    expect(typeof guards.requireBillingAccess).toBe('function');
    expect(typeof guards.requireHrOrAdmin).toBe('function');
  });
});

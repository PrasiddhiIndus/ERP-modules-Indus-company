import { describe, it, expect } from 'vitest';
import { computePF } from '../src/modules/payroll/calc/statutory.js';
import {
  canPunchSyncOverwriteExisting,
  isLeaveMarkSource,
  punchesToPresentRegisterRows,
  registerMarkFromPunchWindow,
} from '../shared/attendanceRegisterSync.mjs';
import { createAuthMiddleware } from '../server/authMiddleware.js';
import { mergeApprovedLeaveMarksIntoManualMarks } from '../src/lib/attendanceDaily.js';

describe('registerMarkFromPunchWindow', () => {
  it('marks half day when out is on cutoff', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '08:30', punchOut: '13:00' })).toBe('HD');
  });

  it('marks present for full day window', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '08:30', punchOut: '18:00' })).toBe('P');
  });

  it('marks half day when in is after cutoff', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '13:15', punchOut: '18:00' })).toBe('HD');
    expect(registerMarkFromPunchWindow({ punchIn: '13:15', punchOut: '' })).toBe('HD');
  });

  it('keeps single morning punch as present', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '09:00', punchOut: '' })).toBe('P');
  });
});

describe('punchesToPresentRegisterRows', () => {
  it('derives HD or P from grouped punch times', () => {
    const rows = punchesToPresentRegisterRows([
      { empCode: '101', punchDate: '2026-07-10', punchTime: '08:30' },
      { empCode: '101', punchDate: '2026-07-10', punchTime: '13:00' },
      { empCode: '102', punchDate: '2026-07-10', punchTime: '08:30' },
      { empCode: '102', punchDate: '2026-07-10', punchTime: '18:00' },
      { empCode: '103', punchDate: '2026-07-10', punchTime: '09:00' },
    ]);
    const byCode = Object.fromEntries(rows.map((r) => [r.employee_code, r.mark]));
    expect(byCode['101']).toBe('HD');
    expect(byCode['102']).toBe('P');
    expect(byCode['103']).toBe('P');
    expect(rows.every((r) => r.mark_source === 'punch')).toBe(true);
  });
});

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

  it('does not overwrite composite half-day leave marks', () => {
    expect(canPunchSyncOverwriteExisting({ mark: 'P/SL', mark_source: 'leave', leave_request_id: 'x' })).toBe(
      false
    );
    expect(canPunchSyncOverwriteExisting({ mark: 'P/CL', mark_source: 'punch' })).toBe(false);
  });

  it('allows punch-derived P and HD to update each other', () => {
    expect(canPunchSyncOverwriteExisting({ mark: 'P', mark_source: 'punch' })).toBe(true);
    expect(canPunchSyncOverwriteExisting({ mark: 'HD', mark_source: 'punch' })).toBe(true);
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

describe('mergeApprovedLeaveMarksIntoManualMarks', () => {
  const monthKey = '2026-07';

  it('adds approved leave marks for display', () => {
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      {},
      { '101': { 10: 'PL' } },
      { monthKey }
    );
    expect(merged['101'][10]).toBe('PL');
  });

  it('strips leave-sourced register marks that are no longer approved', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'PL',
        mark_source: 'leave',
        leave_request_id: 'req-rejected',
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'PL' } },
      {},
      { monthKey, registerRows }
    );
    expect(merged['101']).toBeUndefined();
  });

  it('restores non-leave marks from fresh register rows after rejection', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'P',
        mark_source: 'punch',
        leave_request_id: null,
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'P' } },
      {},
      { monthKey, registerRows }
    );
    expect(merged['101'][10]).toBe('P');
  });

  it('does not strip manual PL marks without leave linkage', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'PL',
        mark_source: 'manual',
        leave_request_id: null,
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'PL' } },
      {},
      { monthKey, registerRows }
    );
    expect(merged['101'][10]).toBe('PL');
  });

  it('machine punch wins over approved leave', () => {
    const punches = [{ empCode: '101', punchDate: '2026-07-10' }];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'P' } },
      { '101': { 10: 'PL' } },
      { monthKey, punches }
    );
    expect(merged['101'][10]).toBe('P');
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

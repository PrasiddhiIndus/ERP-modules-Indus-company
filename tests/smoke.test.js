import { describe, it, expect } from 'vitest';
import { computePF } from '../src/modules/payroll/calc/statutory.js';
import {
  canPunchSyncOverwriteExisting,
  isLeaveMarkSource,
  punchesToPresentRegisterRows,
  registerMarkFromPunchWindow,
} from '../shared/attendanceRegisterSync.mjs';
import { createAuthMiddleware } from '../server/authMiddleware.js';
import { mergeApprovedLeaveMarksIntoManualMarks, normalizeRegisterMarkForDb, registerMarkCompositeDisplayParts } from '../src/lib/attendanceDaily.js';

describe('registerMarkFromPunchWindow', () => {
  it('marks half day when out is on cutoff', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '08:30', punchOut: '13:00' })).toBe('HD');
  });

  it('marks present for full day window', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '08:30', punchOut: '18:00' })).toBe('P');
  });

  it('keeps late punch-in as present when out is after cutoff', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '13:15', punchOut: '18:00' })).toBe('P');
    expect(registerMarkFromPunchWindow({ punchIn: '13:15', punchOut: '' })).toBe('P');
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

  it('allows punch sync to replace auto WO and auto holiday', () => {
    expect(canPunchSyncOverwriteExisting({ mark: 'WO', mark_source: 'auto_wo' })).toBe(true);
    expect(canPunchSyncOverwriteExisting({ mark: 'NH/PH', mark_source: 'auto_holiday' })).toBe(true);
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

  it('keeps leave marks from admin_attendance_register for display', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'PL',
        mark_source: 'leave',
        leave_request_id: 'req-1',
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'PL' } },
      {},
      { monthKey, registerRows }
    );
    expect(merged['101'][10]).toBe('PL');
  });

  it('does not overwrite register leave with approved leave overlay', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'CL',
        mark_source: 'leave',
        leave_request_id: 'req-1',
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'CL' } },
      { '101': { 10: 'PL' } },
      { monthKey, registerRows }
    );
    expect(merged['101'][10]).toBe('CL');
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

  it('keeps punch-derived HD from register even with stale leave_request_id', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'HD',
        mark_source: 'punch',
        leave_request_id: 'req-rejected',
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'HD' } },
      {},
      { monthKey, registerRows, punches: [{ empCode: '101', punchDate: '2026-07-10' }] }
    );
    expect(merged['101'][10]).toBe('HD');
  });

  it('does not overwrite manual HD with approved leave', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'HD',
        mark_source: 'manual',
        leave_request_id: null,
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'HD' } },
      { '101': { 10: 'PL' } },
      { monthKey, registerRows }
    );
    expect(merged['101'][10]).toBe('HD');
  });

  it('normalizes composite register marks case-insensitively', () => {
    expect(normalizeRegisterMarkForDb('P/Cl')).toBe('P/CL');
    expect(normalizeRegisterMarkForDb('p/pl')).toBe('P/PL');
  });

  it('keeps leave-sourced P/CL from register for display', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-10',
        mark: 'P/Cl',
        mark_source: 'leave',
        leave_request_id: 'req-1',
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 10: 'P/CL' } },
      { '101': { 10: 'CL' } },
      { monthKey, registerRows, punches: [{ empCode: '101', punchDate: '2026-07-10' }] }
    );
    expect(merged['101'][10]).toBe('P/CL');
  });

  it('splits composite marks into present and leave display parts', () => {
    expect(registerMarkCompositeDisplayParts('P/Cl')).toEqual({
      present: 'P',
      leave: 'CL',
      combined: 'P/CL',
    });
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

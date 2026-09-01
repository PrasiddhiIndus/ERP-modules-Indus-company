import { describe, it, expect } from 'vitest';
import { computePF } from '../src/modules/payroll/calc/statutory.js';
import {
  canPunchSyncOverwriteExisting,
  filterChangedRegisterUpserts,
  filterUpsertsRespectingManualPriority,
  isLeaveMarkSource,
  isPurplePresentPunch,
  isRegisterUpsertNoop,
  punchesToPresentRegisterRows,
  registerMarkFromPunchWindow,
} from '../shared/attendanceRegisterSync.mjs';
import { createAuthMiddleware } from '../server/authMiddleware.js';
import {
  applyManualRegisterRowsToMarks,
  buildMonthlyRegisterGrid,
  buildRegisterEmployeeList,
  computeEmployeeRegisterSummary,
  isEmployeeRelevantForRegisterMonth,
  isInactiveEmployeeRelevantForRegisterMonth,
  mergeApprovedLeaveMarksIntoManualMarks,
  mergeApprovedTourIntoRegisterView,
  normalizeRegisterMarkForDb,
  registerMarkCompositeDisplayParts,
  registerSummaryLeaveCredit,
} from '../src/lib/attendanceDaily.js';
import {
  leaveDayFraction,
  validatePlClSlConsecutiveMark,
  validatePlClSlMarksForUpserts,
} from '../src/lib/attendanceLeaveLimits.js';

describe('registerMarkFromPunchWindow', () => {
  it('marks half day when out is on cutoff', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '08:30', punchOut: '13:00' })).toBe('HD');
  });

  it('marks purple present when last punch is before noon', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '08:30', punchOut: '11:45' })).toBe('P');
  });

  it('marks present for full day window', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '08:30', punchOut: '18:00' })).toBe('P');
  });

  it('keeps late punch-in as present when out is after cutoff', () => {
    expect(registerMarkFromPunchWindow({ punchIn: '13:15', punchOut: '18:00' })).toBe('P');
    expect(registerMarkFromPunchWindow({ punchIn: '13:15', punchOut: '' })).toBe('P');
  });

  it('flags purple present for afternoon first punch or early last punch', () => {
    expect(isPurplePresentPunch({ punchIn: '12:00', punchOut: '18:00' })).toBe(true);
    expect(isPurplePresentPunch({ punchIn: '14:30', punchOut: '18:00' })).toBe(true);
    expect(isPurplePresentPunch({ punchIn: '15:00', punchOut: '18:00' })).toBe(true);
    expect(isPurplePresentPunch({ punchIn: '08:30', punchOut: '11:30' })).toBe(true);
    expect(isPurplePresentPunch({ punchIn: '08:30', punchOut: '18:00' })).toBe(false);
    expect(isPurplePresentPunch({ punchIn: '09:00', punchOut: '' })).toBe(false);
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

  it('does not overwrite manual HR marks', () => {
    expect(canPunchSyncOverwriteExisting({ mark: 'CL', mark_source: 'manual' })).toBe(false);
    expect(canPunchSyncOverwriteExisting({ mark: 'WO', mark_source: 'manual' })).toBe(false);
    expect(canPunchSyncOverwriteExisting({ mark: 'P', mark_source: 'manual' })).toBe(false);
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

describe('filterChangedRegisterUpserts', () => {
  it('skips identical auto_wo rows and keeps real changes', () => {
    const existing = [
      {
        employee_code: '101',
        register_date: '2026-08-02',
        mark: 'WO',
        mark_source: 'auto_wo',
        mark_remark: null,
        leave_request_id: null,
        tour_request_id: null,
      },
    ];
    const incoming = [
      {
        employee_code: '101',
        register_date: '2026-08-02',
        mark: 'WO',
        mark_source: 'auto_wo',
        leave_request_id: null,
        updated_at: '2026-08-06T12:00:00.000Z',
      },
      {
        employee_code: '102',
        register_date: '2026-08-02',
        mark: 'WO',
        mark_source: 'auto_wo',
        leave_request_id: null,
        updated_at: '2026-08-06T12:00:00.000Z',
      },
      {
        employee_code: '101',
        register_date: '2026-08-03',
        mark: 'P',
        mark_source: 'punch',
        leave_request_id: null,
        updated_at: '2026-08-06T12:00:00.000Z',
      },
    ];
    expect(isRegisterUpsertNoop(incoming[0], existing[0])).toBe(true);
    const changed = filterChangedRegisterUpserts(incoming, existing);
    expect(changed).toHaveLength(2);
    expect(changed.map((r) => r.employee_code)).toEqual(['102', '101']);
  });
});

describe('filterUpsertsRespectingManualPriority', () => {
  it('blocks punch/tour/auto writes over a saved manual cell', () => {
    const existing = [
      {
        employee_code: '101',
        register_date: '2026-08-03',
        mark: 'CL',
        mark_source: 'manual',
      },
    ];
    const incoming = [
      {
        employee_code: '101',
        register_date: '2026-08-03',
        mark: 'P',
        mark_source: 'punch',
      },
      {
        employee_code: '101',
        register_date: '2026-08-03',
        mark: 'T',
        mark_source: 'tour',
      },
      {
        employee_code: '101',
        register_date: '2026-08-03',
        mark: 'WO',
        mark_source: 'auto_wo',
      },
    ];
    expect(filterUpsertsRespectingManualPriority(incoming, existing)).toEqual([]);
  });

  it('allows a later manual edit to replace a previous manual mark', () => {
    const existing = [
      {
        employee_code: '101',
        register_date: '2026-08-03',
        mark: 'CL',
        mark_source: 'manual',
      },
    ];
    const incoming = [
      {
        employee_code: '101',
        register_date: '2026-08-03',
        mark: 'P',
        mark_source: 'manual',
      },
    ];
    expect(filterUpsertsRespectingManualPriority(incoming, existing)).toHaveLength(1);
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

  it('approved leave replaces blank and auto weekoff cells', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-12',
        mark: 'WO',
        mark_source: 'auto_wo',
        leave_request_id: null,
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 12: 'WO' } },
      { '101': { 4: 'CL', 12: 'SL' } },
      { monthKey, registerRows }
    );
    expect(merged['101'][4]).toBe('CL');
    expect(merged['101'][12]).toBe('SL');
  });

  it('does not replace a manual weekoff with approved leave', () => {
    const registerRows = [
      {
        employee_code: '101',
        register_date: '2026-07-12',
        mark: 'WO',
        mark_source: 'manual',
        leave_request_id: null,
      },
    ];
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { '101': { 12: 'WO' } },
      { '101': { 12: 'SL' } },
      { monthKey, registerRows }
    );
    expect(merged['101'][12]).toBe('WO');
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

  it('counts P/PL, P/CL, and P/SL as 1 in register summary but 0.5 for balance/limits', () => {
    for (const mark of ['P/PL', 'P/CL', 'P/SL', 'p/pl', 'P / CL']) {
      expect(registerSummaryLeaveCredit(mark)).toBe(1);
      expect(leaveDayFraction(mark)).toBe(0.5);
    }
    expect(registerSummaryLeaveCredit('PL')).toBe(1);
    expect(leaveDayFraction('PL')).toBe(1);
    expect(registerSummaryLeaveCredit('LWP/PL')).toBe(0.5);
    expect(leaveDayFraction('LWP/PL')).toBe(0.5);
  });

  it('register row summary counts each P/PL as 1 leave day (not 0.5)', () => {
    const dayMarks = {};
    for (let day = 1; day <= 31; day += 1) {
      if (day === 5 || day === 12) dayMarks[day] = 'P/PL';
      else if (day <= 24) dayMarks[day] = 'P';
      else if (day <= 29) dayMarks[day] = 'WO';
      else dayMarks[day] = 'NH/PH';
    }
    const summary = computeEmployeeRegisterSummary(
      { empCode: '101', dayMarks },
      {},
      31,
      { year: 2026, month: 8 }
    );
    expect(summary.leave).toBe(2);
    expect(summary.weekoff).toBe(5);
    expect(summary.nhph).toBe(2);
    expect(summary.totalPresent).toBe(26); // 22 P + 2×1 P/PL + 2 NH/PH (summary display)
  });
});

describe('manual register mark priority', () => {
  it('keeps a manual WO in the grid even when a punch exists that day', () => {
    const { rows } = buildMonthlyRegisterGrid(
      [{ empCode: '101', punchDate: '2026-08-02' }],
      [{ empCode: '101', employeeName: 'Test' }],
      { year: 2026, month: 8, manualMarks: { '101': { 2: 'WO' } } }
    );
    expect(rows[0].dayMarks[2]).toBe('WO');
  });

  it('does not overlay tour T on a saved manual mark', () => {
    const merged = mergeApprovedTourIntoRegisterView(
      { '101': { 3: 'CL' } },
      {},
      { marks: { '101': { 3: 'T' } }, remarks: { '101': { 3: 'Site visit' } } },
      {
        monthKey: '2026-08',
        registerRows: [{ employee_code: '101', register_date: '2026-08-03', mark: 'CL', mark_source: 'manual' }],
      }
    );
    expect(merged.marks['101'][3]).toBe('CL');
  });

  it('stamps manual register rows on top of overlay marks', () => {
    const marks = applyManualRegisterRowsToMarks(
      { '101': { 3: 'T' } },
      [{ employee_code: '101', register_date: '2026-08-03', mark: 'P', mark_source: 'manual' }]
    );
    expect(marks['101'][3]).toBe('P');
  });
});

describe('validatePlClSlConsecutiveMark', () => {
  const emp = '101';
  const rows = [
    { employee_code: emp, register_date: '2026-08-04', mark: 'SL' },
    { employee_code: emp, register_date: '2026-08-05', mark: 'SL' },
    { employee_code: emp, register_date: '2026-08-06', mark: 'WO' },
    { employee_code: emp, register_date: '2026-08-07', mark: 'WO' },
  ];

  it('blocks PL or CL after SL bridged through WO', () => {
    for (const mark of ['PL', 'CL', 'P/PL', 'LWP/CL']) {
      const check = validatePlClSlConsecutiveMark(rows, '2026-08-08', mark, { employeeCode: emp });
      expect(check.ok).toBe(false);
      expect(check.message).toMatch(/SL/);
    }
  });

  it('allows SL continuation and CO after SL bridged through WO', () => {
    expect(
      validatePlClSlConsecutiveMark(rows, '2026-08-08', 'SL', { employeeCode: emp }).ok
    ).toBe(true);
    expect(
      validatePlClSlConsecutiveMark(rows, '2026-08-08', 'CO', { employeeCode: emp }).ok
    ).toBe(true);
  });

  it('bridges NH/PH and NHPH between leave types', () => {
    const nhRows = [
      { employee_code: emp, register_date: '2026-08-04', mark: 'PL' },
      { employee_code: emp, register_date: '2026-08-05', mark: 'NH/PH' },
    ];
    expect(
      validatePlClSlConsecutiveMark(nhRows, '2026-08-06', 'PL', { employeeCode: emp }).ok
    ).toBe(true);
    expect(
      validatePlClSlConsecutiveMark(
        [{ employee_code: emp, register_date: '2026-08-04', mark: 'CL' }, { employee_code: emp, register_date: '2026-08-05', mark: 'NHPH' }],
        '2026-08-06',
        'SL',
        { employeeCode: emp }
      ).ok
    ).toBe(false);
  });

  it('validates bulk upserts in staged date order', () => {
    const failures = validatePlClSlMarksForUpserts(rows, [
      { employee_code: emp, register_date: '2026-08-08', mark: 'PL' },
    ]);
    expect(failures).toHaveLength(1);
  });
});

describe('register employee month visibility (DOL)', () => {
  const march = { fromDate: '2026-03-01', toDate: '2026-03-31' };
  const april = { fromDate: '2026-04-01', toDate: '2026-04-30' };

  it('includes employees with no DOL in any month', () => {
    expect(isEmployeeRelevantForRegisterMonth(null, march.fromDate, march.toDate)).toBe(true);
    expect(isEmployeeRelevantForRegisterMonth('', march.fromDate, march.toDate)).toBe(true);
  });

  it('includes through DOL month and months before leaving', () => {
    expect(isEmployeeRelevantForRegisterMonth('2026-03-15', march.fromDate, march.toDate)).toBe(true);
    expect(isEmployeeRelevantForRegisterMonth('2026-03-31', march.fromDate, march.toDate)).toBe(true);
    expect(isEmployeeRelevantForRegisterMonth('2026-03-15', '2026-02-01', '2026-02-28')).toBe(true);
  });

  it('excludes months after the leaving month', () => {
    expect(isEmployeeRelevantForRegisterMonth('2026-03-15', april.fromDate, april.toDate)).toBe(false);
    expect(isEmployeeRelevantForRegisterMonth('2026-03-31', april.fromDate, april.toDate)).toBe(false);
  });

  it('requires DOL for inactive employee path', () => {
    expect(isInactiveEmployeeRelevantForRegisterMonth('2026-03-15', march.fromDate, march.toDate)).toBe(true);
    expect(isInactiveEmployeeRelevantForRegisterMonth(null, march.fromDate, march.toDate)).toBe(false);
    expect(isInactiveEmployeeRelevantForRegisterMonth('2026-03-15', april.fromDate, april.toDate)).toBe(false);
  });

  it('includes inactive DOL-month employees without register activity', () => {
    const list = buildRegisterEmployeeList(
      [],
      [{ empCode: 'E99', employeeName: 'Left', dateOfLeaving: '2026-03-15' }],
      { fromDate: march.fromDate, toDate: march.toDate }
    );
    expect(list).toHaveLength(1);
    expect(list[0].empCode).toBe('E99');
  });

  it('excludes active employees who left before the viewed month', () => {
    const list = buildRegisterEmployeeList(
      [{ empCode: 'E01', employeeName: 'Former', dateOfLeaving: '2026-03-15' }],
      [],
      { fromDate: april.fromDate, toDate: april.toDate }
    );
    expect(list).toHaveLength(0);
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

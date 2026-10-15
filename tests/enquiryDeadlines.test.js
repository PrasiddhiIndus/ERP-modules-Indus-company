import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => { throw new Error('Real Supabase client blocked in tests'); } }));

const {
  addWorkingDays,
  daysLeftBadge,
  dashboardBucket,
  getDaysLeft,
  isCompletedAfterTarget,
  isDueSoon,
  isOverdueOpen,
  orderAssignmentFields,
  withAutoTargetDate,
} = await import('../src/pages/projects/enquiry/enquiryDeadlines.js');

describe('assignment fields', () => {
  it('orders assigned on date, target date, assigned to person first; others keep place', () => {
    const keys = ['target_date', 'assigned_to_person', 'assigned_on_date', 'priority', 'completed_on'];
    const out = orderAssignmentFields(keys.map((field_key) => ({ field_key }))).map((f) => f.field_key);
    expect(out).toEqual(['assigned_on_date', 'target_date', 'assigned_to_person', 'priority', 'completed_on']);
  });

  it('keeps fields before the group in place', () => {
    const keys = ['client_name', 'target_date', 'remarks', 'assigned_on_date'];
    const out = orderAssignmentFields(keys.map((field_key) => ({ field_key }))).map((f) => f.field_key);
    expect(out).toEqual(['client_name', 'assigned_on_date', 'target_date', 'remarks']);
  });

  it('target date is 7 working days after the assigned on date', () => {
    const form = { enquiry_receipt_date: '2026-10-01', assigned_on_date: '2026-10-12', target_date: '' };
    expect(withAutoTargetDate(form).target_date).toBe('2026-10-20');
    expect(withAutoTargetDate({ assigned_on_date: '', target_date: '2026-11-01' }).target_date).toBe('2026-11-01');
  });
});

const row = (data, extra = {}) => ({ id: 'x', data, ...extra });

describe('addWorkingDays', () => {
  it('adds 7 working days skipping Sundays', () => {
    // Mon 2026-10-12 -> Tue..Sat (5), skip Sun 18, Mon 19, Tue 20
    expect(addWorkingDays('2026-10-12')).toBe('2026-10-20');
  });

  it('starting on Saturday skips the following Sunday', () => {
    // Sat 2026-10-17 -> Mon 19 .. Sat 24 (6), skip Sun 25, Mon 26
    expect(addWorkingDays('2026-10-17')).toBe('2026-10-26');
  });

  it('accepts dd/mm/yyyy and returns empty for invalid input', () => {
    expect(addWorkingDays('12/10/2026')).toBe('2026-10-20');
    expect(addWorkingDays('')).toBe('');
  });
});

describe('days left', () => {
  const today = new Date(2026, 9, 12);

  it('counts calendar days to target (negative when overdue)', () => {
    expect(getDaysLeft(row({ target_date: '2026-10-15' }), today)).toBe(3);
    expect(getDaysLeft(row({ target_date: '2026-10-10' }), today)).toBe(-2);
    expect(getDaysLeft(row({}), today)).toBeNull();
  });

  it('due soon means open and 0-3 days to target', () => {
    expect(isDueSoon(row({ target_date: '2026-10-12' }), today)).toBe(true);
    expect(isDueSoon(row({ target_date: '2026-10-15' }), today)).toBe(true);
    expect(isDueSoon(row({ target_date: '2026-10-16' }), today)).toBe(false);
    expect(isDueSoon(row({ target_date: '2026-10-11' }), today)).toBe(false);
    expect(isDueSoon(row({ target_date: '2026-10-13', current_status: 'Completed' }), today)).toBe(false);
  });

  it('colours by urgency and marks closed enquiries', () => {
    expect(daysLeftBadge(row({ target_date: '2026-10-10' }), today).label).toBe('2 days overdue');
    expect(daysLeftBadge(row({ target_date: '2026-10-12' }), today).label).toBe('Due today');
    expect(daysLeftBadge(row({ target_date: '2026-10-13' }), today).className).toContain('orange');
    expect(daysLeftBadge(row({ target_date: '2026-10-16' }), today).className).toContain('amber');
    expect(daysLeftBadge(row({ target_date: '2026-10-30' }), today).className).toContain('emerald');
    expect(daysLeftBadge(row({ target_date: '2026-10-01', current_status: 'Completed' }), today).label).toBe('Completed');
    expect(daysLeftBadge(row({ target_date: '2026-10-01', current_status: 'Regret' }), today).label).toBe('Closed');
  });

  it('a Completed Date stops the overdue count, whatever the status', () => {
    const late = row({ target_date: '2026-10-05', current_status: 'Work in Progress', completed_on: '2026-10-08' });
    expect(daysLeftBadge(late, today).label).toBe('Completed 3 days late');
    expect(isOverdueOpen(late, today)).toBe(false);
    expect(isCompletedAfterTarget(late)).toBe(true);
    expect(dashboardBucket(late, today)).toBe('completedLate');

    const onTime = row({ target_date: '2026-10-13', current_status: 'Not Started', completed_on: '12/10/2026' });
    expect(daysLeftBadge(onTime, today).label).toBe('Completed on time');
    expect(isDueSoon(onTime, today)).toBe(false);
    expect(dashboardBucket(onTime, today)).toBe('completed');

    const regret = row({ target_date: '2026-10-05', current_status: 'Regret', completed_on: '2026-10-08' });
    expect(daysLeftBadge(regret, today).label).toBe('Closed');
    expect(dashboardBucket(regret, today)).toBe('regret');
  });
});

describe('isCompletedAfterTarget', () => {
  it('uses the recorded completion date', () => {
    expect(isCompletedAfterTarget(row({ current_status: 'Completed', target_date: '2026-10-05', completed_on: '2026-10-08' }))).toBe(true);
    expect(isCompletedAfterTarget(row({ current_status: 'Completed', target_date: '2026-10-05', completed_on: '2026-10-05' }))).toBe(false);
  });

  it('falls back to last edit only when the row was edited after creation', () => {
    const data = { current_status: 'Completed', target_date: '2026-10-05' };
    expect(isCompletedAfterTarget(row(data, { created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-09T10:00:00Z' }))).toBe(true);
    expect(isCompletedAfterTarget(row(data, { created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:05Z' }))).toBe(false);
  });

  it('ignores enquiries that are not completed', () => {
    expect(isCompletedAfterTarget(row({ current_status: 'Regret', target_date: '2026-10-05', completed_on: '2026-10-08' }))).toBe(false);
  });
});

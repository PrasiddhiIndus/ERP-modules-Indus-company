import { describe, it, expect } from 'vitest';
import { dashboardBucket } from '../src/pages/projects/enquiry/enquiryDeadlines.js';

const today = new Date(2026, 9, 13);
const row = (data, extra = {}) => ({
  id: Math.random(),
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  data: { assigned_to_person: 'Dhaval Shisode', ...data },
  ...extra,
});

describe('Enquiry dashboard boxes count each enquiry once', () => {
  it('completed after target is only in Overdue & Completed, not Completed', () => {
    const late = row({ current_status: 'Completed', target_date: '2026-10-01', completed_on: '2026-10-05' });
    expect(dashboardBucket(late, today)).toBe('completedLate');
  });

  it('completed on time is only in Completed', () => {
    const onTime = row({ current_status: 'Completed', target_date: '2026-10-10', completed_on: '2026-10-10' });
    expect(dashboardBucket(onTime, today)).toBe('completed');
  });

  it('overdue open enquiries are only in Overdue, not Not Started / In Progress', () => {
    expect(dashboardBucket(row({ current_status: 'Not Started', target_date: '2026-10-01' }), today)).toBe('overdue');
    expect(dashboardBucket(row({ current_status: 'Work in Progress', target_date: '2026-10-12' }), today)).toBe('overdue');
  });

  it('enquiries due soon are only in Due soon', () => {
    expect(dashboardBucket(row({ current_status: 'Work in Progress', target_date: '2026-10-15' }), today)).toBe('dueSoon');
    expect(dashboardBucket(row({ current_status: 'Not Started', target_date: '2026-10-13' }), today)).toBe('dueSoon');
  });

  it('open, not yet due enquiries without assignee are only in Unassigned', () => {
    expect(dashboardBucket(row({ assigned_to_person: '', target_date: '2026-11-30' }), today)).toBe('unassigned');
  });

  it('assigned, not yet due enquiries go by status', () => {
    expect(dashboardBucket(row({ current_status: 'Not Started', target_date: '2026-11-30' }), today)).toBe('notStarted');
    expect(dashboardBucket(row({ target_date: '2026-11-30' }), today)).toBe('notStarted');
    expect(dashboardBucket(row({ current_status: 'Work in Progress' }), today)).toBe('wip');
  });

  it('regret is only in Regret, even when past target', () => {
    expect(dashboardBucket(row({ current_status: 'Regret', target_date: '2026-10-01' }), today)).toBe('regret');
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => { throw new Error('Real Supabase client blocked in tests'); } }));

const { buildAssigneeKpis, getDaysToComplete } = await import('../src/pages/projects/enquiry/enquiryKpiMetrics.js');

const today = new Date(2026, 9, 13);
let n = 0;
const enq = (data) => ({ id: `e${(n += 1)}`, data });

const rows = [
  // Ravi: 4 received — 2 completed (1 on time in 3 days, 1 late in 10 days), 1 overdue open, 1 open on track
  enq({ assigned_to_person: 'Ravi', current_status: 'Completed', assigned_on_date: '2026-10-01', target_date: '2026-10-08', completed_on: '2026-10-04' }),
  enq({ assigned_to_person: 'Ravi', current_status: 'Completed', assigned_on_date: '2026-09-20', target_date: '2026-09-28', completed_on: '2026-09-30' }),
  enq({ assigned_to_person: 'Ravi', current_status: 'Work in Progress', assigned_on_date: '2026-10-01', target_date: '2026-10-09' }),
  enq({ assigned_to_person: 'Ravi', current_status: 'Not Started', assigned_on_date: '2026-10-12', target_date: '2026-10-20' }),
  // Meena: 1 completed, start falls back to receipt date
  enq({ assigned_to_person: 'Meena', current_status: 'Completed', enquiry_receipt_date: '2026-10-02', target_date: '2026-10-10', completed_on: '2026-10-07' }),
  // Unassigned regret
  enq({ current_status: 'Regret', target_date: '2026-10-01' }),
];

describe('getDaysToComplete', () => {
  it('counts days from assigned on date (or receipt date) to completion', () => {
    expect(getDaysToComplete(rows[0])).toBe(3);
    expect(getDaysToComplete(rows[1])).toBe(10);
    expect(getDaysToComplete(rows[4])).toBe(5);
    expect(getDaysToComplete(rows[2])).toBeNull();
  });
});

describe('buildAssigneeKpis', () => {
  const { people, total } = buildAssigneeKpis(rows, today);
  const ravi = people.find((p) => p.name === 'Ravi');

  it('per-person counts', () => {
    expect(ravi.received).toBe(4);
    expect(ravi.completed).toBe(2);
    expect(ravi.overdue).toBe(1);
    expect(ravi.completedLate).toBe(1);
    expect(ravi.avgDaysToComplete).toBe(6.5);
    expect(ravi.onTimeRate).toBe(0.5);
  });

  it('orders by received with Unassigned last; totals add up', () => {
    expect(people.map((p) => p.name)).toEqual(['Ravi', 'Meena', 'Unassigned']);
    expect(total.received).toBe(6);
    expect(total.completed).toBe(3);
    expect(total.overdue).toBe(1);
    expect(total.completedLate).toBe(1);
    expect(total.avgDaysToComplete).toBe(6);
  });

  it('regret enquiries are not overdue', () => {
    expect(people.find((p) => p.name === 'Unassigned').overdue).toBe(0);
  });
});

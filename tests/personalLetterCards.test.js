import { describe, expect, it, vi } from 'vitest';
import { fitFontSize, loadOccasionEmployees } from '../server/personalLetterCards.js';

describe('personal letter card helpers', () => {
  it('keeps short names at max font size', () => {
    expect(fitFontSize('Rahul,', 1680, 84, 44)).toBe(84);
  });

  it('shrinks long names to fit the cover band', () => {
    const long = 'Venkata Subramanian Krishnamurthy Padmanabhan,';
    const size = fitFontSize(long, 900, 84, 44);
    expect(size).toBeLessThan(84);
    expect(size).toBeGreaterThanOrEqual(44);
  });
});

describe('loadOccasionEmployees', () => {
  it('pages past the PostgREST 1000-row cap and keeps non-inactive statuses', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      status: i === 0 ? null : 'Active',
      full_name: `Emp ${i + 1}`,
    }));
    const page2 = [
      { id: 1001, status: 'Active', full_name: 'Birthday beyond cap' },
      { id: 1002, status: 'Inactive', full_name: 'Should drop' },
      { id: 1003, status: '', full_name: 'Empty status kept' },
    ];
    const range = vi.fn(async (from) => {
      if (from === 0) return { data: page1, error: null };
      if (from === 1000) return { data: page2, error: null };
      return { data: [], error: null };
    });
    const order = vi.fn(() => ({ range }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    const svc = { from };

    const rows = await loadOccasionEmployees(svc);

    expect(from).toHaveBeenCalledWith('admin_ifsp_employee_master');
    expect(range).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1002); // 1000 page1 (null status kept) + 2 from page2
    expect(rows.some((r) => r.id === 1001)).toBe(true);
    expect(rows.some((r) => r.id === 1003)).toBe(true);
    expect(rows.some((r) => r.id === 1002)).toBe(false);
  });
});

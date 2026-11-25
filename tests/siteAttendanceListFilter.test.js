import { describe, expect, it } from 'vitest';
import { getRange } from '../src/lib/siteAttendance/salaryCycle.js';

/**
 * Documents why Daily grid must load by att_date window, not cycle month alone:
 * August ending cycle 21–20 includes Jul 21–31, which overlap calendar July (month=7) rows.
 */
describe('site attendance cycle date window vs calendar month', () => {
  it('August 21–20 roster overlaps calendar July days', () => {
    const aug = getRange(2026, 8, 21, 20);
    expect(aug.startDateString).toBe('2026-07-21');
    expect(aug.endDateString).toBe('2026-08-20');

    const julyCalendarDaysInAugCycle = [];
    const cursor = new Date(aug.startDate);
    while (cursor <= aug.endDate) {
      if (cursor.getMonth() === 6) {
        julyCalendarDaysInAugCycle.push(
          `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
        );
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    expect(julyCalendarDaysInAugCycle[0]).toBe('2026-07-21');
    expect(julyCalendarDaysInAugCycle.at(-1)).toBe('2026-07-31');
    expect(julyCalendarDaysInAugCycle.length).toBe(11);
  });

  it('July 21–20 cycle does not include Jul 21–31 (those belong to August cycle)', () => {
    const july = getRange(2026, 7, 21, 20);
    expect(july.startDateString).toBe('2026-06-21');
    expect(july.endDateString).toBe('2026-07-20');
    expect(july.endDateString < '2026-07-21').toBe(true);
  });
});

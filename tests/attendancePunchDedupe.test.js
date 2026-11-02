import { describe, it, expect } from 'vitest';
import {
  dedupeApiPunchRecords,
  dedupePunchDbRows,
  mapApiPunchToDbRow,
  preferApiPunchRecord,
} from '../shared/attendancePunchSync.mjs';
import { normalizeEtimePunchRows } from '../server/attendanceEtime.js';

describe('normalizeEtimePunchRows', () => {
  it('does not emit the same punch time twice from one InOut row', () => {
    const rows = normalizeEtimePunchRows({
      InOutPunchData: [
        {
          Empcode: '9750',
          Name: 'Test Emp',
          DateString: '02/11/2026',
          INTime: '09:15',
          OUTTime: '18:30',
          PunchDateTime: '02/11/2026 09:15:00',
          Status: 'Present',
        },
      ],
    });

    const times = rows.map((r) => r.punchTime.slice(0, 5)).sort();
    expect(times).toEqual(['09:15', '18:30']);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.punchTime.startsWith('09:15'))?.direction).toBe('IN');
    expect(rows.find((r) => r.punchTime.startsWith('18:30'))?.direction).toBe('OUT');
  });
});

describe('dedupeApiPunchRecords', () => {
  it('collapses merged InOut summary + granular punches at the same time', () => {
    const { records, collisionCount } = dedupeApiPunchRecords([
      {
        empCode: '9750',
        punchDate: '02/11/2026',
        punchTime: '09:15:00',
        direction: 'IN',
        punchSlot: 'in',
        deviceName: 'eTimeOffice',
      },
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '09:15',
        direction: 'IN',
        deviceName: 'Gate-1',
        sourcePayload: { PunchId: 'A1' },
      },
      {
        empCode: '9750',
        punchDate: '02/11/2026',
        punchTime: '18:30:00',
        direction: 'OUT',
        punchSlot: 'out',
      },
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '12:05:00',
        direction: 'OUT',
        deviceName: 'Gate-1',
        sourcePayload: { PunchId: 'A2' },
      },
    ]);

    expect(collisionCount).toBe(1);
    expect(records).toHaveLength(3);
    const times = records.map((r) => String(r.punchTime).slice(0, 5)).sort();
    expect(times).toEqual(['09:15', '12:05', '18:30']);
    const nine = records.find((r) => String(r.punchTime).startsWith('09:15'));
    expect(nine.punchSlot).toBeFalsy();
    expect(nine.sourcePayload?.PunchId).toBe('A1');
  });

  it('prefers granular over in/out slot summaries', () => {
    expect(
      preferApiPunchRecord(
        { punchSlot: '', direction: 'IN', sourcePayload: { PunchId: '1' } },
        { punchSlot: 'in', direction: 'IN' }
      )
    ).toBe(true);
    expect(
      preferApiPunchRecord(
        { punchSlot: 'out', direction: 'OUT' },
        { punchSlot: '', direction: 'OUT', sourcePayload: { PunchId: '2' } }
      )
    ).toBe(false);
  });
});

describe('dedupePunchDbRows', () => {
  it('drops slot-key duplicates that share emp/date/time with granular rows', () => {
    const slotIn = mapApiPunchToDbRow(
      {
        empCode: '9750',
        punchDate: '02/11/2026',
        punchTime: '09:15',
        direction: 'IN',
        punchSlot: 'in',
        deviceName: 'eTimeOffice',
      },
      0
    );
    const granularIn = mapApiPunchToDbRow(
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '09:15:00',
        direction: 'IN',
        deviceName: 'Gate-1',
        sourcePayload: { PunchId: 'pid-9' },
      },
      1
    );
    const midDay = mapApiPunchToDbRow(
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '13:00:00',
        direction: 'OUT',
        deviceName: 'Gate-1',
        sourcePayload: { PunchId: 'pid-13' },
      },
      2
    );

    expect(slotIn.punch_key).toMatch(/\|in$/);
    expect(granularIn.punch_key).not.toBe(slotIn.punch_key);

    const { rows, collisionCount } = dedupePunchDbRows([slotIn, granularIn, midDay]);
    expect(collisionCount).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.punch_key === slotIn.punch_key)).toBe(false);
    expect(rows.some((r) => r.punch_key === granularIn.punch_key)).toBe(true);
    expect(rows.some((r) => r.punch_key === midDay.punch_key)).toBe(true);
  });
});

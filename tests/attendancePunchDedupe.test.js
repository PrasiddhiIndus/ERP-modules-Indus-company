import { describe, it, expect } from 'vitest';
import {
  dedupeApiPunchRecords,
  dedupePunchDbRows,
  dropInOutSlotsWhenGranularExists,
  mapApiPunchToDbRow,
  preferApiPunchRecord,
} from '../shared/attendancePunchSync.mjs';
import { pairPunchesToDailyRows } from '../src/lib/attendanceDaily.js';
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
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '18:30:00',
        direction: 'OUT',
        deviceName: 'Gate-1',
        sourcePayload: { PunchId: 'A3' },
      },
    ]);

    expect(collisionCount).toBe(2);
    expect(records).toHaveLength(3);
    const times = records.map((r) => String(r.punchTime).slice(0, 5)).sort();
    expect(times).toEqual(['09:15', '12:05', '18:30']);
    expect(records.every((r) => !r.punchSlot)).toBe(true);
    const nine = records.find((r) => String(r.punchTime).startsWith('09:15'));
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

describe('dropInOutSlotsWhenGranularExists', () => {
  it('drops yesterday InOut OUT that is really today when granular punches exist', () => {
    // Case 1: yesterday in only; InOut wrongly stamps today's in as yesterday's out.
    const records = [
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '09:00',
        punchSlot: 'in',
        direction: 'IN',
      },
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '09:30',
        punchSlot: 'out',
        direction: 'OUT',
      },
      {
        empCode: '9750',
        punchDate: '2026-11-02',
        punchTime: '09:00:00',
        direction: 'IN',
        sourcePayload: { PunchId: 'y1' },
      },
      {
        empCode: '9750',
        punchDate: '2026-11-03',
        punchTime: '09:30:00',
        direction: 'IN',
        sourcePayload: { PunchId: 't1' },
      },
    ];
    const kept = dropInOutSlotsWhenGranularExists(records);
    expect(kept.filter((r) => r.punchSlot)).toHaveLength(0);
    const daily = pairPunchesToDailyRows(kept);
    const y = daily.find((r) => r.punchDate === '2026-11-02');
    const t = daily.find((r) => r.punchDate === '2026-11-03');
    expect(y.punchIn).toMatch(/^09:00/);
    expect(y.punchOut).toBe('');
    expect(t.punchIn).toMatch(/^09:30/);
    expect(t.punchOut).toBe('');
  });

  it('does not let today punch become yesterday in when slots are dropped', () => {
    // Case 2: InOut swaps times onto yesterday; granular has correct dates.
    const records = [
      {
        empCode: '8800',
        punchDate: '2026-11-02',
        punchTime: '08:45',
        punchSlot: 'in',
        punchKey: '8800|2026-11-02|in',
      },
      {
        empCode: '8800',
        punchDate: '2026-11-02',
        punchTime: '18:10',
        punchSlot: 'out',
        punchKey: '8800|2026-11-02|out',
      },
      {
        empCode: '8800',
        punchDate: '2026-11-02',
        punchTime: '18:10:00',
        punchKey: '8800|2026-11-02|18:10:00|gate|in',
        sourcePayload: { PunchId: 'y-only' },
      },
      {
        empCode: '8800',
        punchDate: '2026-11-03',
        punchTime: '08:45:00',
        punchKey: '8800|2026-11-03|08:45:00|gate|in',
        sourcePayload: { PunchId: 't-first' },
      },
    ];
    const kept = dropInOutSlotsWhenGranularExists(records);
    const daily = pairPunchesToDailyRows(kept);
    const y = daily.find((r) => r.punchDate === '2026-11-02');
    const t = daily.find((r) => r.punchDate === '2026-11-03');
    expect(y.punchIn).toMatch(/^18:10/);
    expect(y.punchOut).toBe('');
    expect(t.punchIn).toMatch(/^08:45/);
    expect(t.punchOut).toBe('');
  });

  it('keeps InOut slots when no granular punches exist for that day', () => {
    const records = [
      { empCode: '1', punchDate: '2026-11-02', punchTime: '09:00', punchSlot: 'in' },
      { empCode: '1', punchDate: '2026-11-02', punchTime: '18:00', punchSlot: 'out' },
    ];
    expect(dropInOutSlotsWhenGranularExists(records)).toHaveLength(2);
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

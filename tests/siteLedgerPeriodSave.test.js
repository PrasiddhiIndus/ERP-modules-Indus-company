import { describe, expect, it } from 'vitest';
import {
  coercePeriodAmount,
  formatPeriodFigureSaveError,
  mergePeriodEntry,
  preparePeriodRecordForSave,
} from '../src/pages/finance/api/siteLedgerStore.js';

describe('coercePeriodAmount / preparePeriodRecordForSave', () => {
  it('parses numeric strings and keeps real amounts (never wipe to 0)', () => {
    expect(coercePeriodAmount('1,250.50')).toBe(1250.5);
    expect(coercePeriodAmount(42)).toBe(42);
    expect(coercePeriodAmount('')).toBeNull();
    expect(coercePeriodAmount(null)).toBeNull();

    const prepared = preparePeriodRecordForSave(
      { labour: '1000', saleRevenue: '2,500', note: 'x' },
      ['labour', 'fuel'],
    );
    expect(prepared.labour).toBe(1000);
    expect(prepared.fuel).toBe(0);
    expect(prepared.saleRevenue).toBe(2500);
  });

  it('does not zero assigned expense when value is a valid numeric string', () => {
    const prepared = preparePeriodRecordForSave({ adminMisc: '75' }, ['adminMisc']);
    expect(prepared.adminMisc).toBe(75);
  });
});

describe('mergePeriodEntry', () => {
  it('coerces string amounts for expense heads', () => {
    const merged = mergePeriodEntry(
      { labour: 10 },
      { labour: '25', saleRevenue: '100' },
      ['labour'],
    );
    expect(merged.labour).toBe(25);
    expect(merged.saleRevenue).toBe(100);
  });

  it('keeps reimbursements when figures patch omits them', () => {
    const base = {
      labour: 5,
      reimbursements: [{ id: 'r1', type: 'pf', amount: 10 }],
    };
    const merged = mergePeriodEntry(base, { labour: 8 }, ['labour']);
    expect(merged.labour).toBe(8);
    expect(merged.reimbursements).toEqual(base.reimbursements);
  });
});

describe('formatPeriodFigureSaveError', () => {
  it('does not label every failure as database setup required', () => {
    expect(formatPeriodFigureSaveError({ message: 'row-level security policy' })).toMatch(/permission/i);
    expect(formatPeriodFigureSaveError({ message: 'Expense cost lines not saved — sync Site Setup first: x' })).toMatch(/Site Setup/i);
    expect(formatPeriodFigureSaveError({ message: 'Site "ABC" is not saved yet — retry in a moment' })).toMatch(/not saved yet/i);
    expect(formatPeriodFigureSaveError({ message: 'Could not find the function replace_period_entry_lines' })).toMatch(/RPC|migration/i);
    expect(formatPeriodFigureSaveError({ message: 'Failed to fetch' })).toMatch(/network/i);
    expect(formatPeriodFigureSaveError({ message: 'something else' })).toBe('something else');
  });

  it('uses schema hint only for true schema exposure errors', () => {
    const msg = formatPeriodFigureSaveError({ message: 'Invalid schema: schema must be one of...' });
    expect(msg).toMatch(/Exposed schemas|finance/i);
  });

  it('does not double-wrap an already formatted message', () => {
    const once = formatPeriodFigureSaveError({ message: 'Failed to fetch' });
    expect(formatPeriodFigureSaveError({ message: once })).toBe(once);
  });
});

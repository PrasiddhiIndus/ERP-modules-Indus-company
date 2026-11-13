import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  diffEnquiryFields,
  enquiryEditSaveMode,
  isPastCompletedDateChange,
  isProgressDirectChange,
  normalizeEnquiryCompareValue,
} from '../src/pages/projects/enquiry/enquiryEditApi.js';

describe('enquiry edit field diff', () => {
  const fields = [
    { field_key: 'client_name', label: 'Client Name' },
    { field_key: 'current_status', label: 'Current Status' },
    { field_key: 'completed_on', label: 'Completed Date' },
  ];

  it('normalizes blank values', () => {
    expect(normalizeEnquiryCompareValue(null)).toBe('');
    expect(normalizeEnquiryCompareValue('  x  ')).toBe('x');
  });

  it('lists only changed fields with labels', () => {
    const before = { client_name: 'A', current_status: 'Not Started', completed_on: '' };
    const after = { client_name: 'A', current_status: 'Completed', completed_on: '2026-10-23' };
    expect(diffEnquiryFields(before, after, fields)).toEqual([
      {
        field_key: 'current_status',
        label: 'Current Status',
        old_value: 'Not Started',
        new_value: 'Completed',
      },
      {
        field_key: 'completed_on',
        label: 'Completed Date',
        old_value: null,
        new_value: '2026-10-23',
      },
    ]);
  });

  it('skips meta keys', () => {
    expect(
      diffEnquiryFields(
        { id: '1', serial_number: 9, client_name: 'A' },
        { id: '1', serial_number: 9, client_name: 'B' },
        fields
      )
    ).toEqual([
      { field_key: 'client_name', label: 'Client Name', old_value: 'A', new_value: 'B' },
    ]);
  });
});

describe('enquiry edit save mode', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not require L1 for Not Started / Work in Progress', () => {
    expect(
      isProgressDirectChange(
        [{ field_key: 'current_status', new_value: 'Work in Progress' }],
        { current_status: 'Work in Progress' }
      )
    ).toBe(true);
    expect(
      enquiryEditSaveMode(
        [{ field_key: 'current_status', new_value: 'Not Started' }, { field_key: 'remarks', new_value: 'ok' }],
        { current_status: 'Not Started', remarks: 'ok' }
      )
    ).toBe('progress');
  });

  it('requires L1 when Completed Date is in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 13));
    const changes = [{ field_key: 'completed_on', old_value: '', new_value: '2026-11-01' }];
    expect(isPastCompletedDateChange(changes)).toBe(true);
    expect(
      enquiryEditSaveMode(
        [
          { field_key: 'current_status', new_value: 'Completed' },
          { field_key: 'completed_on', new_value: '2026-11-01' },
        ],
        { current_status: 'Completed', completed_on: '2026-11-01' }
      )
    ).toBe('l1');
  });

  it('applies Completed immediately when Completed Date is today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 13));
    expect(
      enquiryEditSaveMode(
        [
          { field_key: 'current_status', new_value: 'Completed' },
          { field_key: 'completed_on', new_value: '2026-11-13' },
        ],
        { current_status: 'Completed', completed_on: '2026-11-13' }
      )
    ).toBe('completed');
  });
});

import { describe, expect, it } from 'vitest';
import { diffEnquiryFields, normalizeEnquiryCompareValue } from '../src/pages/projects/enquiry/enquiryEditApi.js';

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

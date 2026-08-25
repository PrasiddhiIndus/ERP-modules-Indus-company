import { describe, it, expect } from 'vitest';
import {
  emptyLeadForm,
  formToPayload,
  formatLeadCost,
  leadMatchKey,
  mapLeadHeaders,
  parseLeadDate,
  parseLeadMatrix,
  rowFromCells,
} from '../src/pages/marketing/lib/leadMaster';

describe('leadMaster', () => {
  it('maps truncated sheet headers like Project T / Project C / Teleph', () => {
    const mapped = mapLeadHeaders([
      'S.No',
      'Company',
      'Project',
      'Project T',
      'Ownership',
      'Industry',
      'Project C',
      'Project Stage',
      'Location',
      'District',
      'Project State',
      'Addr. State',
      'Teleph',
      'Email',
      'Person',
      'Person',
      'Updated On',
      'REMARKS',
    ]);
    expect(mapped.company).toBe(1);
    expect(mapped.project_type).toBe(3);
    expect(mapped.project_cost).toBe(6);
    expect(mapped.telephone).toBe(12);
    expect(mapped.address_state).toBe(11);
    expect(mapped.contact_person).toBe(14);
    expect(mapped.contact_person_2).toBe(15);
    expect(mapped.sheet_updated_on).toBe(16);
  });

  it('parses a sheet row and treats NA as empty', () => {
    const headers = mapLeadHeaders(['Company', 'Project', 'Person', 'Person', 'Email', 'Addr. State']);
    const form = rowFromCells(
      ['ITC Hotels Ltd', 'New hotel', 'Mr. Sanjay', 'NA', 'NA', 'NA'],
      headers
    );
    expect(form.company).toBe('ITC Hotels Ltd');
    expect(form.contact_person).toBe('Mr. Sanjay');
    expect(form.contact_person_2).toBe('');
    expect(form.email).toBe('');
    expect(form.address_state).toBe('');
  });

  it('parses Updated On as 21-Aug-26', () => {
    expect(parseLeadDate('21-Aug-26')).toBe('2026-08-21');
  });

  it('requires company on save', () => {
    const empty = formToPayload(emptyLeadForm());
    expect(empty.error).toMatch(/company/i);
    const ok = formToPayload({ ...emptyLeadForm(), company: 'Wyndham Hotels' });
    expect(ok.error).toBeNull();
    expect(ok.payload.company).toBe('Wyndham Hotels');
  });

  it('matches re-uploads on company + project', () => {
    expect(leadMatchKey({ company: 'ITC Hotels Ltd', project: 'New hotel' })).toBe(
      leadMatchKey({ company: 'itc hotels ltd', project: 'New Hotel' })
    );
  });

  it('skips blank rows and rows without a company', () => {
    const parsed = parseLeadMatrix([
      ['Company', 'Project', 'Project Stage'],
      ['', '', ''],
      ['NA', 'Something', 'Announcement Stage'],
      ['Bengaluru Smart Infrastructure Ltd', 'Phase I', 'Pre Project Stage'],
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].company).toBe('Bengaluru Smart Infrastructure Ltd');
    expect(parsed.skipped).toBe(1);
  });

  it('formats project cost without forcing currency', () => {
    expect(formatLeadCost(180.428)).toBe('180.428');
  });
});

import { describe, it, expect } from 'vitest';
import {
  UNSPECIFIED,
  activeFilterEntries,
  bucketLeadsByMonth,
  emptyLeadFilters,
  filterLeads,
  groupLeadsBy,
  summarizeLeads,
  topSlices,
} from '../src/pages/marketing/lib/leadInsights';

const LEADS = [
  {
    id: '1',
    company: 'ITC Hotels Ltd',
    industry: 'Hospitality and Healthcare',
    project_state: 'Karnataka',
    project_stage: 'Announcement Stage',
    project_type: 'New',
    sheet_updated_on: '2026-08-21',
  },
  {
    id: '2',
    company: 'ITC Hotels Ltd',
    industry: 'Hospitality and Healthcare',
    project_state: 'Goa',
    project_stage: 'Pre Project Stage',
    project_type: 'Expansion',
    sheet_updated_on: '2026-07-02',
  },
  {
    id: '3',
    company: 'Stalwart Advance',
    industry: 'Chemicals',
    project_state: 'Gujarat',
    project_stage: 'Announcement Stage',
    project_type: 'New',
    sheet_updated_on: '2026-08-05',
  },
  {
    id: '4',
    company: 'Bengaluru Infra Ltd',
    industry: '',
    project_state: 'Karnataka',
    project_stage: '',
    sheet_updated_on: null,
    created_at: '2026-08-11T10:00:00Z',
  },
];

describe('leadInsights', () => {
  it('groups by a dimension with counts and share, blanks bucketed', () => {
    const rows = groupLeadsBy(LEADS, 'industry');
    expect(rows[0]).toMatchObject({ name: 'Hospitality and Healthcare', value: 2, share: 50 });
    expect(rows.map((r) => r.name)).toContain(UNSPECIFIED);
  });

  it('filters leads on every active dimension', () => {
    const filters = { ...emptyLeadFilters(), project_state: 'Karnataka' };
    expect(filterLeads(LEADS, filters).map((l) => l.id)).toEqual(['1', '4']);

    const both = { ...filters, project_stage: 'Announcement Stage' };
    expect(filterLeads(LEADS, both).map((l) => l.id)).toEqual(['1']);
  });

  it('ignores one dimension so its own chart keeps every option', () => {
    const filters = { ...emptyLeadFilters(), project_stage: 'Announcement Stage' };
    const forStageChart = filterLeads(LEADS, filters, 'project_stage');
    expect(forStageChart).toHaveLength(4);
    expect(groupLeadsBy(forStageChart, 'project_stage').map((r) => r.name)).toEqual([
      'Announcement Stage',
      UNSPECIFIED,
      'Pre Project Stage',
    ]);
  });

  it('rolls small slices into one bucket', () => {
    const rows = topSlices(groupLeadsBy(LEADS, 'project_state'), 1);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ name: 'Other', value: 2, __rest: true });
  });

  it('buckets activity by month, falling back to created date', () => {
    const months = bucketLeadsByMonth(LEADS, 3, new Date(2026, 7, 25));
    expect(months.map((m) => m.name)).toEqual(['Jun 26', 'Jul 26', 'Aug 26']);
    expect(months[1].value).toBe(1);
    expect(months[2].value).toBe(3);
  });

  it('summarises distinct companies, states and industries', () => {
    expect(summarizeLeads(LEADS)).toMatchObject({
      leads: 4,
      companies: 3,
      states: 3,
      industries: 2,
      stages: 2,
    });
  });

  it('lists only the filters a user has switched on', () => {
    const entries = activeFilterEntries({ ...emptyLeadFilters(), industry: 'Chemicals' });
    expect(entries).toEqual([{ key: 'industry', label: 'Industry', value: 'Chemicals' }]);
  });
});

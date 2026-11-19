import { describe, it, expect } from 'vitest';
import { getStatusRank } from '../src/pages/projects/enquiry/enquiryStatusStyles.js';

describe('Enquiry Database status order', () => {
  it('lists Not Started, Work in Progress, Regret / Order Lost, then Completed', () => {
    const statuses = ['Completed', 'Order Lost', 'Regret', 'Work in Progress', 'Not Started'];
    const sorted = [...statuses].sort((a, b) => getStatusRank(a) - getStatusRank(b));
    expect(sorted).toEqual(['Not Started', 'Work in Progress', 'Order Lost', 'Regret', 'Completed']);
  });

  it('ranks Order Lost with Regret', () => {
    expect(getStatusRank('Order Lost')).toBe(getStatusRank('Regret'));
  });

  it('treats a blank status as Not Started and ignores case and spacing', () => {
    expect(getStatusRank('')).toBe(getStatusRank('Not Started'));
    expect(getStatusRank('  completed ')).toBe(getStatusRank('Completed'));
    expect(getStatusRank('WIP')).toBe(getStatusRank('Work in Progress'));
  });

  it('puts unknown statuses with Work in Progress', () => {
    expect(getStatusRank('On Hold')).toBe(getStatusRank('Work in Progress'));
  });
});

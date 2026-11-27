import { describe, expect, it } from 'vitest';
import {
  getCostingRowFillHighlightClass,
  getCostingRowFillStatus,
} from '../src/pages/projects/fireTenderCostingConfig.js';

const blankTree = {};

describe('getCostingRowFillStatus — newly added (extra) rows', () => {
  it('is red by default until Qty, Unit Cost, and Main Component are filled', () => {
    expect(
      getCostingRowFillStatus(
        { component: '', unitCost: 0, qty: 1, weight: 0, labour: 0 },
        [],
        blankTree,
        false
      )
    ).toBe('incomplete');
    expect(getCostingRowFillHighlightClass('incomplete')).toBe('bg-red-100');

    expect(
      getCostingRowFillStatus(
        { component: 'Pump', unitCost: 0, qty: 2, weight: 0, labour: 0 },
        [],
        blankTree,
        false
      )
    ).toBe('incomplete');
  });

  it('turns green when Main Component, Unit Cost, and Qty are all filled', () => {
    expect(
      getCostingRowFillStatus(
        { component: 'Pump', unitCost: 100, qty: 2, weight: 0, labour: 0 },
        [],
        blankTree,
        false
      )
    ).toBe('complete');
    expect(getCostingRowFillHighlightClass('complete')).toBe('bg-green-100');
  });

  it('does not require Manual Sub for newly added row green highlight', () => {
    expect(
      getCostingRowFillStatus(
        { component: 'Custom Part', unitCost: 50, qty: 1, weight: 0, labour: 0, manualSub: '' },
        [],
        blankTree,
        false
      )
    ).toBe('complete');
  });
});

describe('getCostingRowFillStatus — catalog / fixed rows', () => {
  it('marks incomplete catalog lines red until required fields are filled', () => {
    expect(
      getCostingRowFillStatus(
        { component: 'Pump', unitCost: 0, qty: 2, weight: 0, labour: 0, manualSub: 'Brand X' },
        [],
        blankTree,
        true
      )
    ).toBe('incomplete');
    expect(getCostingRowFillHighlightClass('incomplete')).toBe('bg-red-100');
  });

  it('marks catalog lines green when unit cost and qty are > 0', () => {
    expect(
      getCostingRowFillStatus(
        { component: 'Pump', unitCost: 100, qty: 2, weight: 0, labour: 0, manualSub: 'Brand X' },
        [],
        blankTree,
        true
      )
    ).toBe('complete');
  });

  it('keeps tank completion rules (needs weight + unit cost + qty)', () => {
    expect(
      getCostingRowFillStatus(
        { component: 'Water Tank', unitCost: 50, qty: 1, weight: 0, labour: 0, manualSub: 'MS' },
        [],
        blankTree,
        true
      )
    ).toBe('incomplete');
    expect(
      getCostingRowFillStatus(
        { component: 'Water Tank', unitCost: 50, qty: 1, weight: 10, labour: 0, manualSub: 'MS' },
        [],
        blankTree,
        true
      )
    ).toBe('complete');
  });
});

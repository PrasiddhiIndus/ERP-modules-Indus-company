import { describe, expect, it } from 'vitest';
import {
  getCostingRowFillHighlightClass,
  getCostingRowFillStatus,
} from '../src/pages/projects/fireTenderCostingConfig.js';

const blankTree = {};

describe('getCostingRowFillStatus', () => {
  it('marks newly added blank lines incomplete (red)', () => {
    expect(
      getCostingRowFillStatus(
        { component: '', unitCost: 0, qty: 1, weight: 0, labour: 0 },
        [],
        blankTree,
        false
      )
    ).toBe('incomplete');
    expect(getCostingRowFillHighlightClass('incomplete')).toBe('bg-red-100');
  });

  it('marks default lines complete (green) when unit cost and qty are > 0', () => {
    // Extra lines require Manual Sub when the catalog has no subcategory path.
    expect(
      getCostingRowFillStatus(
        { component: 'Pump', unitCost: 100, qty: 2, weight: 0, labour: 0, manualSub: 'Brand X' },
        [],
        blankTree,
        false
      )
    ).toBe('complete');
    expect(getCostingRowFillHighlightClass('complete')).toBe('bg-green-100');
  });

  it('stays incomplete when unit cost is cleared', () => {
    expect(
      getCostingRowFillStatus(
        { component: 'Pump', unitCost: 0, qty: 2, weight: 0, labour: 0, manualSub: 'Brand X' },
        [],
        blankTree,
        false
      )
    ).toBe('incomplete');
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

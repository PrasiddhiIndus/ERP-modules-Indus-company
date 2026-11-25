import { describe, expect, it } from 'vitest';
import {
  INTERNATIONAL_COST_COLUMNS,
  computeWorkingCostRow,
  getManualInputIds,
  internationalSheetBands,
} from '../src/pages/marketing/utils/workingCostSheets.js';

/** Sample row from Cost_Sheet_Columns_and_Formulas.pdf */
const sampleInputs = {
  qty: 10,
  item_cost_dollar: 100,
  discount_from_vendor: 5,
  currency_rate: 96,
  duty_pct: 10,
  sws_pct: 1,
  aidc_pct: 1,
  igst_pct: 1,
  penalty_amount: 1,
  warehouse_charge: 1,
  bonded_storage: 1,
  clearance_charge: 1,
  disbursement_fee: 1,
  transportation_dhl: 1,
  logistic_pct: 1,
  transit_insurance_pct: 1,
  packing_forwarding_pct: 1,
  margin_pct: 1,
  incentive_pct: 1,
  gst_pct: 18,
};

describe('International Procurement cost sheet (PDF)', () => {
  it('keeps IMPORT COST then SUPPLY COST column bands', () => {
    const bands = internationalSheetBands();
    expect(bands.map((b) => b.label)).toEqual(['IMPORT COST', 'SUPPLY COST']);
    expect(bands[0].columns.at(-1).id).toBe('total_import_cost');
    expect(bands[1].columns[0].id).toBe('logistic_pct');
    expect(bands[1].columns.at(-1).id).toBe('total_with_gst');
  });

  it('does not expose calculated fields as manual inputs', () => {
    const manual = new Set(getManualInputIds('international'));
    expect(manual.has('total_import_cost')).toBe(false);
    expect(manual.has('rate_to_quote')).toBe(false);
    expect(manual.has('item_cost_dollar')).toBe(true);
    expect(manual.has('duty_pct')).toBe(true);
  });

  it('matches PDF sample formulas (AM = rate × qty)', () => {
    const out = computeWorkingCostRow('international', (id) => sampleInputs[id] ?? 0);
    expect(out.discounted_item_cost).toBe('95.00');
    expect(out.per_item_cost_inr).toBe('9120.00');
    expect(out.total_consignment_cost).toBe('91200.00');
    expect(out.duty_amount).toBe('9120.00');
    expect(out.sws_amount).toBe('912.00');
    expect(out.aidc_amount).toBe('912.00');
    expect(out.igst_amount).toBe('912.00');
    expect(out.total_import_cost).toBe('103062.00');
    expect(out.logistic_amount).toBe('1030.62');
    expect(out.transit_insurance_amount).toBe('1030.62');
    expect(out.packing_forwarding_amount).toBe('1030.62');
    expect(out.base_price).toBe('106153.86');
    expect(out.margin_amount).toBe('1061.54');
    expect(out.per_unit_rate).toBe('10721.54');
    expect(out.incentive_amount).toBe('107.22');
    expect(out.rate_to_quote).toBe('10828.76');
    expect(out.total_without_gst).toBe('108287.60'); // AL × qty (10), not clearance
    expect(out.gst_amount).toBe('19491.77');
    expect(out.total_with_gst).toBe('127779.37');
  });

  it('lists every Rate Workout column in sheet order', () => {
    const ids = INTERNATIONAL_COST_COLUMNS.map((c) => c.id);
    expect(ids[0]).toBe('hsn_code');
    expect(ids).toContain('transportation_dhl');
    expect(ids).toContain('per_unit_rate');
    expect(ids.at(-1)).toBe('total_with_gst');
  });
});

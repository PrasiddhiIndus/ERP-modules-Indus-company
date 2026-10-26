import { describe, it, expect } from 'vitest';
import { detectBoqColumns, rankBoqSheets } from '../src/pages/projects/quotation/maker/boqImportDetect.js';
import { classifyBoqRows } from '../src/pages/projects/quotation/maker/boqImportClassify.js';
import {
  makerHasLineItems,
  reviewRowsToMakerRows,
} from '../src/pages/projects/quotation/maker/boqImportToMakerRows.js';
import {
  computeTotals,
  createEmptyRow,
  isGroup,
  partsOf,
} from '../src/pages/projects/quotation/maker/quotationMakerModel.js';
import { workbookFromGrids } from '../src/pages/projects/quotation/maker/boqImportParse.js';

/** Dual-rate multi-row header + A / 1 / a hierarchy (FPS-like). */
function buildFpsLikeGrid() {
  return [
    ['', '', '', '', '', '', '', '', ''],
    ['MECHANICAL PART', '', '', '', '', '', '', '', ''],
    ['', '', '', '', 'SUPPLY In Rs', '', 'INSTALLATION In Rs', '', 'Make'],
    ['Sr. No.', 'DESCRIPTION', 'UNIT', 'Qty.', 'Rate', 'Total', 'Rate', 'Total', ''],
    ['', 'TYPE OF JOB: (DESIGN, SUPPLY, INSTALLATION)', '', '', '', '', '', '', ''],
    ['A', 'PUMP HOUSE EQUIPMENT', '', '', '', '', '', '', ''],
    [
      '1',
      'SITC of main fire pump',
      'Set',
      '2',
      '339200',
      '678400',
      '27500',
      '55000',
      'Kirloskar',
    ],
    ['', '1. Capacity : 171 m3/hr.', '', '', '', '', '', '', ''],
    ['', '2. Head : 88 Mtr.', '', '', '', '', '', '', ''],
    [
      '2',
      'SITC of jockey pump',
      'Set',
      '2',
      '143272',
      '286544',
      '16500',
      '33000',
      'Kirloskar',
    ],
    ['4', 'Supply and fixing of aboveground MS piping', '', '', '', '', '', '', ''],
    ['a', '100 mm dia.', 'Rmt.', '12', '8477', '101724', '2214', '26568', ''],
    ['b', '80 mm dia.', 'Rmt.', '12', '6553', '78636', '1890', '22680', ''],
    ['', 'Total', '', '', '', '1000000', '', '100000', ''],
    ['B', 'HYDRANT NETWORK', '', '', '', '', '', '', ''],
    ['1', 'Hydrant valve', 'Nos.', '4', '5000', '20000', '500', '2000', 'ABC'],
  ];
}

function buildSingleRateGrid() {
  return [
    ['Sr', 'Item Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Remarks'],
    ['1', 'Fire extinguisher 6kg', 'Nos', '10', '1500', '15000', 'Site store'],
    ['2', 'Hose reel', 'Nos', '5', '8000', '40000', ''],
  ];
}

describe('boqImportDetect', () => {
  it('detects dual SUPPLY/INSTALLATION headers and Make', () => {
    const det = detectBoqColumns(buildFpsLikeGrid());
    expect(det.headerRowIndex).toBe(3);
    expect(det.ambiguousRate).toBe(false);
    const fields = Object.values(det.columnMap);
    expect(fields).toContain('description');
    expect(fields).toContain('qty');
    expect(fields).toContain('supply_rate');
    expect(fields).toContain('install_rate');
    expect(fields).toContain('make');
  });

  it('flags a single Rate column as ambiguous', () => {
    const det = detectBoqColumns(buildSingleRateGrid());
    expect(det.headerRowIndex).toBe(0);
    expect(det.ambiguousRate).toBe(true);
    expect(Object.values(det.columnMap)).toContain('rate');
  });

  it('ranks BOQ sheets above empty cover sheets', () => {
    const wb = workbookFromGrids([
      { name: 'SUMMARY', grid: [['QUOTATION'], ['Dear Sir'], ['We are thankful']] },
      { name: 'MECHANICAL', grid: buildFpsLikeGrid() },
    ]);
    const ranked = rankBoqSheets(wb.sheets);
    expect(ranked[0].name).toBe('MECHANICAL');
    expect(ranked[0].recommended).toBe(true);
  });
});

describe('boqImportClassify + toMakerRows', () => {
  it('builds heading / item / part tree and keeps supply+install rates', () => {
    const grid = buildFpsLikeGrid();
    const det = detectBoqColumns(grid);
    const { rows: review } = classifyBoqRows({
      grid,
      headerRowIndex: det.headerRowIndex,
      columnMap: det.columnMap,
      sheetName: 'MECHANICAL',
    });

    const headings = review.filter((r) => r.rowType === 'heading' && !r.excluded);
    const parts = review.filter((r) => r.rowType === 'part' && !r.excluded);
    const totals = review.filter((r) => r.rowType === 'total');
    expect(headings.some((h) => /PUMP HOUSE/i.test(h.description))).toBe(true);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(totals.length).toBeGreaterThanOrEqual(1);
    expect(totals.every((t) => t.excluded)).toBe(true);

    const pump = review.find((r) => /main fire pump/i.test(r.description));
    expect(pump).toBeTruthy();
    expect(pump.supply_rate).toBe(339200);
    expect(pump.install_rate).toBe(27500);
    expect(pump.make).toMatch(/Kirloskar/i);

    // Notes append into parent description
    const { rows: makerRows } = reviewRowsToMakerRows(review, { mode: 'replace' });
    const pumpMaker = makerRows.find((r) => /main fire pump/i.test(r.description));
    expect(pumpMaker.description).toMatch(/Capacity/i);
    expect(pumpMaker.supply_rate).toBe(339200);
    expect(pumpMaker.install_rate).toBe(27500);
    expect(pumpMaker.rate).toBe(0);

    const pipeParent = makerRows.find((r) => /aboveground MS piping/i.test(r.description));
    expect(pipeParent).toBeTruthy();
    expect(isGroup(makerRows, pipeParent)).toBe(true);
    expect(partsOf(makerRows, pipeParent.id).length).toBe(2);

    // Switching type must not erase stored rates (model already holds both)
    const asSupply = computeTotals(makerRows, 'supply');
    const asSi = computeTotals(makerRows, 'supply_installation');
    expect(asSupply.grand_total).toBeGreaterThan(0);
    expect(asSi.supply_total).toBeGreaterThan(0);
    expect(asSi.install_total).toBeGreaterThan(0);
    expect(pipeParent.supply_rate).toBe(0); // parent group not priced
  });

  it('maps ambiguous rate to supply when user confirms', () => {
    const grid = buildSingleRateGrid();
    const det = detectBoqColumns(grid);
    const { rows: review } = classifyBoqRows({
      grid,
      headerRowIndex: det.headerRowIndex,
      columnMap: det.columnMap,
      ambiguousRateTarget: 'supply',
    });
    const item = review.find((r) => /extinguisher/i.test(r.description));
    expect(item.supply_rate).toBe(1500);
    expect(item.service_rate).toBe(0);
    expect(item.install_rate).toBe(0);

    const { rows: makerRows, showRemarks } = reviewRowsToMakerRows(review);
    expect(makerRows[0].supply_rate).toBe(1500);
    expect(makerRows[0].rate).toBe(0);
    expect(showRemarks).toBe(true);
  });

  it('warns on amount mismatch', () => {
    const grid = [
      ['Sr', 'Description', 'Unit', 'Qty', 'Rate', 'Amount'],
      ['1', 'Widget', 'Nos', '2', '100', '999'],
    ];
    const det = detectBoqColumns(grid);
    const { rows } = classifyBoqRows({
      grid,
      headerRowIndex: det.headerRowIndex,
      columnMap: det.columnMap,
      ambiguousRateTarget: 'service',
    });
    expect(rows[0].warnings.some((w) => /Amount mismatch/i.test(w))).toBe(true);
  });

  it('append keeps existing rows', () => {
    const existing = [createEmptyRow('heading')];
    existing[0].description = 'Existing';
    const grid = buildSingleRateGrid();
    const det = detectBoqColumns(grid);
    const { rows: review } = classifyBoqRows({
      grid,
      headerRowIndex: det.headerRowIndex,
      columnMap: det.columnMap,
      ambiguousRateTarget: 'service',
    });
    const { rows } = reviewRowsToMakerRows(review, { mode: 'append', existingRows: existing });
    expect(rows[0].description).toBe('Existing');
    expect(rows.length).toBeGreaterThan(1);
  });

  it('makerHasLineItems detects content', () => {
    expect(makerHasLineItems([])).toBe(false);
    const h = createEmptyRow('heading');
    h.description = 'Sec';
    expect(makerHasLineItems([h])).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  QUOTATION_TYPES,
  applyRowAction,
  buildColumnKeys,
  buildPumpHouseExample,
  columnTotal,
  computeTotals,
  createEmptyRow,
  dropRow,
  expandDisplayRows,
  formatMoneyIn,
  headingColumnTotal,
  lineAmount,
  numberOf,
  normalizeType,
  rowTotal,
  round2,
} from '../src/pages/projects/quotation/maker/quotationMakerModel.js';

/** Build the three-level Sr No. fixture from the spec. */
function buildNumberingFixture() {
  const h1 = createEmptyRow('heading');
  h1.description = 'main heading';
  const i1 = createEmptyRow('item', h1.id);
  const a = createEmptyRow('item', i1.id);
  const a1 = createEmptyRow('item', a.id);
  const i2 = createEmptyRow('item', h1.id);
  const i3 = createEmptyRow('item', h1.id);
  const p3a = createEmptyRow('item', i3.id);
  const p3b = createEmptyRow('item', i3.id);
  const b1 = createEmptyRow('item', p3b.id);
  const b2 = createEmptyRow('item', p3b.id);
  const h2 = createEmptyRow('heading');
  h2.description = 'main heading';
  const j1 = createEmptyRow('item', h2.id);
  const j2 = createEmptyRow('item', h2.id);
  const j3 = createEmptyRow('item', h2.id);
  const j4 = createEmptyRow('item', h2.id);
  const j4a = createEmptyRow('item', j4.id);
  return {
    rows: [h1, i1, a, a1, i2, i3, p3a, p3b, b1, b2, h2, j1, j2, j3, j4, j4a],
    h1,
    i1,
    a,
    a1,
    i2,
    i3,
    p3a,
    p3b,
    b1,
    b2,
    h2,
    j1,
    j2,
    j3,
    j4,
    j4a,
  };
}

describe('quotationMakerModel pricing', () => {
  it('rounds per line then sums (supply + installation example)', () => {
    const rows = buildPumpHouseExample();
    const supply = columnTotal(rows, 'supply');
    const install = columnTotal(rows, 'inst');
    const totals = computeTotals(rows, 'supply_installation');

    // Manual: pumps + pipe lines + air vessel
    const expectedSupply = round2(
      492195 + 145836 + 12 * 8477 + 12 * 6553 + 12 * 3356 + 82033
    );
    const expectedInstall = round2(
      33750 + 20250 + 12 * 2214 + 12 * 1890 + 12 * 1134 + 3375
    );

    expect(supply).toBe(expectedSupply);
    expect(install).toBe(expectedInstall);
    expect(totals.grand_total).toBe(round2(expectedSupply + expectedInstall));
    expect(totals.supply_total).toBe(expectedSupply);
    expect(totals.install_total).toBe(expectedInstall);
  });

  it('matches Bajaj Healthcare PDF totals when those rates are entered', () => {
    // Acceptance reference: supply ₹30,60,324.00 + install ₹3,32,286.00 = ₹33,92,610.00
    const h = createEmptyRow('heading');
    h.description = 'FIRE WATER PUMP HOUSE';
    const leaf = createEmptyRow('item');
    Object.assign(leaf, {
      description: 'Aggregated Bajaj package (fixture)',
      unit: 'Lot',
      qty: 1,
      supply_rate: 3060324,
      install_rate: 332286,
    });
    const rows = [h, leaf];
    // nest leaf under heading
    leaf.parent_row_id = h.id;
    const totals = computeTotals(rows, 'supply_installation');
    expect(totals.supply_total).toBe(3060324);
    expect(totals.install_total).toBe(332286);
    expect(totals.grand_total).toBe(3392610);
    expect(formatMoneyIn(totals.grand_total)).toBe('33,92,610.00');
  });

  it('keeps all rate fields when switching type; columns only change which total is shown', () => {
    const item = createEmptyRow('item');
    Object.assign(item, { qty: 2, rate: 100, supply_rate: 80, install_rate: 20 });
    const rows = [item];

    expect(computeTotals(rows, 'normal').grand_total).toBe(200);
    expect(computeTotals(rows, 'supply').grand_total).toBe(160);
    expect(computeTotals(rows, 'installation').grand_total).toBe(40);
    expect(computeTotals(rows, 'supply_installation').grand_total).toBe(200);
    // stored rates untouched
    expect(item.rate).toBe(100);
    expect(item.supply_rate).toBe(80);
    expect(item.install_rate).toBe(20);
  });

  it('numbers items 1,2,3 under each heading; parts a,b,c; sub-parts a.1', () => {
    const rows = buildPumpHouseExample();
    const heading = rows[0];
    const items = rows.filter((r) => r.parent_row_id === heading.id);
    expect(numberOf(rows, heading)).toBe('');
    expect(numberOf(rows, items[0])).toBe('1');
    expect(numberOf(rows, items[1])).toBe('2');
    expect(numberOf(rows, items[2])).toBe('3');
    expect(numberOf(rows, items[3])).toBe('4');
    const pipe = rows.find((r) => r.description.startsWith('ERW'));
    const parts = rows.filter((r) => r.parent_row_id === pipe.id);
    expect(numberOf(rows, parts[0])).toBe('a');
    expect(numberOf(rows, parts[1])).toBe('b');
    expect(numberOf(rows, parts[2])).toBe('c');
  });

  it('restarts Sr No. per heading and supports three nest levels', () => {
    const f = buildNumberingFixture();
    const { rows } = f;
    expect(numberOf(rows, f.h1)).toBe('');
    expect(numberOf(rows, f.i1)).toBe('1');
    expect(numberOf(rows, f.a)).toBe('a');
    expect(numberOf(rows, f.a1)).toBe('a.1');
    expect(numberOf(rows, f.i2)).toBe('2');
    expect(numberOf(rows, f.i3)).toBe('3');
    expect(numberOf(rows, f.p3a)).toBe('a');
    expect(numberOf(rows, f.p3b)).toBe('b');
    expect(numberOf(rows, f.b1)).toBe('b.1');
    expect(numberOf(rows, f.b2)).toBe('b.2');
    expect(numberOf(rows, f.h2)).toBe('');
    expect(numberOf(rows, f.j1)).toBe('1');
    expect(numberOf(rows, f.j2)).toBe('2');
    expect(numberOf(rows, f.j3)).toBe('3');
    expect(numberOf(rows, f.j4)).toBe('4');
    expect(numberOf(rows, f.j4a)).toBe('a');
  });

  it('counts top-level items separately from headings', () => {
    const top = createEmptyRow('item');
    const h = createEmptyRow('heading');
    const under = createEmptyRow('item', h.id);
    const top2 = createEmptyRow('item');
    const rows = [top, h, under, top2];
    expect(numberOf(rows, top)).toBe('1');
    expect(numberOf(rows, under)).toBe('1');
    expect(numberOf(rows, top2)).toBe('2');
  });

  it('recalculates Sr No. after drag-and-drop reorder', () => {
    const f = buildNumberingFixture();
    // Move item 3 (with parts) before item 1 under first heading
    let next = dropRow(f.rows, f.i3.id, f.i1.id, false);
    expect(numberOf(next, next.find((r) => r.id === f.i3.id))).toBe('1');
    expect(numberOf(next, next.find((r) => r.id === f.i1.id))).toBe('2');
    expect(numberOf(next, next.find((r) => r.id === f.i2.id))).toBe('3');
    expect(numberOf(next, next.find((r) => r.id === f.p3a.id))).toBe('a');
    expect(numberOf(next, next.find((r) => r.id === f.p3b.id))).toBe('b');
    expect(numberOf(next, next.find((r) => r.id === f.b1.id))).toBe('b.1');
    expect(numberOf(next, next.find((r) => r.id === f.b2.id))).toBe('b.2');

    // Swap parts a and b under item 3 → letters flip; sub-parts follow new parent label
    next = dropRow(next, f.p3b.id, f.p3a.id, false);
    expect(numberOf(next, next.find((r) => r.id === f.p3b.id))).toBe('a');
    expect(numberOf(next, next.find((r) => r.id === f.p3a.id))).toBe('b');
    expect(numberOf(next, next.find((r) => r.id === f.b1.id))).toBe('a.1');
    expect(numberOf(next, next.find((r) => r.id === f.b2.id))).toBe('a.2');

    // Second heading numbering unchanged by first-heading reorder
    expect(numberOf(next, next.find((r) => r.id === f.j1.id))).toBe('1');
    expect(numberOf(next, next.find((r) => r.id === f.j4a.id))).toBe('a');
  });

  it('addsub nests part under part as a.1 and deletes whole subtree', () => {
    const h = createEmptyRow('heading');
    const item = createEmptyRow('item', h.id);
    let rows = [h, item];
    rows = applyRowAction(rows, item.id, 'addsub');
    const part = rows.find((r) => r.parent_row_id === item.id);
    expect(numberOf(rows, part)).toBe('a');
    rows = applyRowAction(rows, part.id, 'addsub');
    const sub = rows.find((r) => r.parent_row_id === part.id);
    expect(numberOf(rows, sub)).toBe('a.1');
    rows = applyRowAction(rows, part.id, 'del');
    expect(rows.some((r) => r.id === part.id)).toBe(false);
    expect(rows.some((r) => r.id === sub.id)).toBe(false);
    expect(rows.some((r) => r.id === item.id)).toBe(true);
  });

  it('places heading total after the last sub-row (not on the heading row)', () => {
    const rows = buildPumpHouseExample();
    const display = expandDisplayRows(rows);
    expect(display[0].row_type).toBe('heading');
    expect(display[0].row_type).not.toBe('heading_total');
    const ht = display.find((r) => r.row_type === 'heading_total');
    expect(ht).toBeTruthy();
    expect(display.indexOf(ht)).toBe(display.length - 1);
    expect(headingColumnTotal(rows, rows[0].id, 'supply')).toBe(columnTotal(rows, 'supply'));
    expect(buildColumnKeys('supply_installation', {})).not.toContain('row_total');
  });

  it('dragging a part to another item updates parent; totals unchanged', () => {
    const rows = buildPumpHouseExample();
    const before = computeTotals(rows, 'supply_installation');
    const pipe = rows.find((r) => r.description.startsWith('ERW'));
    const partA = rows.find((r) => r.description.startsWith('300 mm'));
    const partB = rows.find((r) => r.description.startsWith('250 mm'));
    // Drop part A beside part B (same parent) — parent stays the pipe group; totals identical
    const next = dropRow(rows, partA.id, partB.id, true);
    const after = computeTotals(next, 'supply_installation');
    expect(after.grand_total).toBe(before.grand_total);
    expect(next.find((r) => r.id === partA.id).parent_row_id).toBe(pipe.id);
    expect(numberOf(next, next.find((r) => r.id === partA.id))).toMatch(/^[abc]$/);
  });

  it('lineAmount rounds to 2 decimals', () => {
    const r = createEmptyRow('item');
    Object.assign(r, { qty: 3, supply_rate: 10.333 });
    expect(lineAmount(r, 'supply')).toBe(31); // 30.999 → 31.00? 3*10.333=30.999 → round2 = 31
    expect(round2(3 * 10.333)).toBe(31);
  });

  it('normalizeType accepts si alias and service → normal', () => {
    expect(normalizeType('si')).toBe('supply_installation');
    expect(normalizeType('service')).toBe('normal');
    expect(QUOTATION_TYPES.normal.name).toBe('Service');
  });

  it('buildColumnKeys inserts Make/Remarks only when enabled and relocates Make', () => {
    const base = buildColumnKeys('supply_installation', {});
    expect(base).not.toContain('make');
    expect(base).not.toContain('remarks');

    const withBoth = buildColumnKeys('supply_installation', {
      showMake: true,
      showRemarks: true,
      makeBefore: 'unit',
    });
    expect(withBoth.indexOf('make')).toBe(withBoth.indexOf('description') + 1);
    expect(withBoth.indexOf('remarks')).toBe(withBoth.indexOf('actions') - 1);

    const moved = buildColumnKeys('supply_installation', {
      showMake: true,
      showRemarks: false,
      makeBefore: 'qty',
    });
    expect(moved[moved.indexOf('make') + 1]).toBe('qty');
  });

  it('group item total equals sum of parts', () => {
    const rows = buildPumpHouseExample();
    const pipe = rows.find((r) => r.description.startsWith('ERW'));
    const partsSum = rows
      .filter((r) => r.parent_row_id === pipe.id)
      .reduce((s, p) => s + rowTotal(rows, p, 'supply_installation'), 0);
    expect(rowTotal(rows, pipe, 'supply_installation')).toBe(round2(partsSum));
  });
});

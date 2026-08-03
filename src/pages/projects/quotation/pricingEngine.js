/**
 * Offer Format pricing engine — mirrors Excel formulas (N, P, T, X, AB).
 * Percentages are entered as whole numbers (e.g. 25.45 = 25.45%).
 */

export function pctToFraction(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

export function emptyLineItem(defaults = {}) {
  return {
    id: defaults.id || `tmp-${Math.random().toString(36).slice(2, 10)}`,
    sort_order: defaults.sort_order ?? 0,
    row_type: defaults.row_type || 'line',
    section_no: defaults.section_no ?? 1,
    sub_letter: defaults.sub_letter || 'A',
    section_label: defaults.section_label || '',
    description: defaults.description || '',
    hsn_sac: defaults.hsn_sac || '',
    qty: defaults.qty ?? 1,
    unit: defaults.unit || 'Nos',
    basic_unit_rate: defaults.basic_unit_rate ?? 0,
    accessories_pct: defaults.accessories_pct ?? 0,
    transport_pct: defaults.transport_pct ?? 0,
    inflation_pct: defaults.inflation_pct ?? 0,
    margin_pct: defaults.margin_pct ?? 25.45,
    remarks: defaults.remarks || '',
    make: defaults.make || '',
    unit_rate: 0,
    line_amount: 0,
    accessories_amount: 0,
    transport_amount: 0,
    inflation_amount: 0,
    margin_amount: 0,
    basic_total: 0,
    // Session-only tags from "Fetch from Summary" (not persisted by replaceLineItems)
    sourceChildHeadId: defaults.sourceChildHeadId,
    sourceItemId: defaults.sourceItemId,
    sourceKind: defaults.sourceKind,
    fetchedSnapshot: defaults.fetchedSnapshot,
  };
}

export function emptySectionRow(sectionNo = 1, label = '') {
  return emptyLineItem({
    row_type: 'section',
    section_no: sectionNo,
    sub_letter: null,
    section_label: label || `${sectionNo}. New section`,
    qty: 0,
    basic_unit_rate: 0,
    margin_pct: 0,
  });
}

/** Compute all derived amounts for a single line (section rows stay zero). */
export function calculateLineItem(raw, { advancedPricing = false } = {}) {
  if (!raw || raw.row_type === 'section') {
    return {
      ...raw,
      qty: 0,
      basic_unit_rate: 0,
      unit_rate: 0,
      line_amount: 0,
      accessories_amount: 0,
      transport_amount: 0,
      inflation_amount: 0,
      margin_amount: 0,
      basic_total: 0,
    };
  }

  const qty = Number(raw.qty) || 0;
  const N = Number(raw.basic_unit_rate) || 0;
  const P = advancedPricing ? pctToFraction(raw.accessories_pct) : 0;
  const T = advancedPricing ? pctToFraction(raw.transport_pct) : 0;
  const X = advancedPricing ? pctToFraction(raw.inflation_pct) : 0;
  const AB = pctToFraction(raw.margin_pct);

  const basicTotal = N * qty;
  const accessoriesAmount = N * P * qty;
  const rateWithAcc = N + N * P;
  const transportAmount = rateWithAcc * T * qty;
  const transportRate = rateWithAcc * T;
  const totalAfterTransport = rateWithAcc + transportRate;
  const inflationAmount = totalAfterTransport * X * qty;
  const inflationRate = totalAfterTransport * X;
  const totalAfterInflation = totalAfterTransport + inflationRate;
  const marginAmountPerUnit = N * AB;
  const marginAmount = marginAmountPerUnit * qty;
  const unitRate = Math.round(totalAfterInflation + marginAmountPerUnit);
  const lineAmount = unitRate * qty;

  return {
    ...raw,
    accessories_pct: advancedPricing ? Number(raw.accessories_pct) || 0 : 0,
    transport_pct: advancedPricing ? Number(raw.transport_pct) || 0 : 0,
    inflation_pct: advancedPricing ? Number(raw.inflation_pct) || 0 : 0,
    basic_total: round2(basicTotal),
    accessories_amount: round2(accessoriesAmount),
    transport_amount: round2(transportAmount),
    inflation_amount: round2(inflationAmount),
    margin_amount: round2(marginAmount),
    unit_rate: unitRate,
    line_amount: round2(lineAmount),
  };
}

export function calculateAllLines(lines, opts) {
  return (lines || []).map((l) => calculateLineItem(l, opts));
}

export function summarizeLines(lines) {
  const list = (lines || []).filter((l) => l.row_type !== 'section');
  return {
    basic_total: round2(list.reduce((s, l) => s + (Number(l.basic_total) || 0), 0)),
    accessories_total: round2(list.reduce((s, l) => s + (Number(l.accessories_amount) || 0), 0)),
    transport_total: round2(list.reduce((s, l) => s + (Number(l.transport_amount) || 0), 0)),
    inflation_total: round2(list.reduce((s, l) => s + (Number(l.inflation_amount) || 0), 0)),
    margin_total: round2(list.reduce((s, l) => s + (Number(l.margin_amount) || 0), 0)),
    grand_total: round2(list.reduce((s, l) => s + (Number(l.line_amount) || 0), 0)),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function displayDescription(line) {
  if (line.row_type === 'section') return line.section_label || '';
  const base = line.description || '';
  if (line.hsn_sac) {
    const code = String(line.hsn_sac).trim();
    if (/sac/i.test(code) || /hsn/i.test(code)) return `${base} ${code}`.trim();
    return `${base} HSN/SAC Code: ${code}`.trim();
  }
  return base;
}

export function displaySrNo(line) {
  if (line.row_type === 'section') return String(line.section_no ?? '');
  const sn = line.section_no ?? '';
  const letter = line.sub_letter || '';
  return letter ? `${sn}.${letter}` : String(sn);
}

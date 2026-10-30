/** Working cost sheet layouts: Domestic Procurement and International Procurement. */

export const WORKING_COST_SHEET_OPTIONS = [
  { id: 'domestic', label: 'Domestic Procurement' },
  { id: 'international', label: 'International Procurement' },
];

export function normalizeWorkingCostSheetType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'domestic' || v === 'international') return v;
  if (v.includes('international')) return 'international';
  if (v.includes('domestic')) return v.includes('procurement') || v === 'domestic' ? 'domestic' : null;
  return null;
}

export function workingCostSheetLabel(type) {
  const id = normalizeWorkingCostSheetType(type);
  return WORKING_COST_SHEET_OPTIONS.find((option) => option.id === id)?.label || '';
}

/** Excel-matching fills. Blue = entry, yellow / green / grey = formula. */
export const WORKING_COST_TONES = {
  blue: '#BDD7EE',
  yellow: '#FFE699',
  green: '#C6EFCE',
  grey: '#D9D9D9',
  purple: '#D5A6BD',
};

export const WORKING_COST_HEADER_TONES = {
  domestic: '#9DC3E6',
  international: '#FFE699',
  importGroup: '#C00000',
  green: '#548235',
  orange: '#F4B183',
};

const col = (partial) => ({
  isEditable: !partial.isCalculated,
  inputType: 'number',
  money: null,
  sumTotal: false,
  group: null,
  ...partial,
});

export const DOMESTIC_COST_COLUMNS = [
  col({ id: 'qty', label: 'QTY', tone: 'blue', sumTotal: true }),
  col({ id: 'vendor_unit_rate', label: 'VENDOR UNIT RATE', tone: 'blue', money: 'inr' }),
  col({ id: 'discount', label: 'DISCOUNT', tone: 'blue', money: 'inr', sumTotal: true }),
  col({ id: 'vendor_discounted_rate', label: "VENDOR'S DISCOUNTED RATE", tone: 'yellow', isCalculated: true, money: 'inr' }),
  col({ id: 'logistic_pct', label: 'LOGISTIC %', tone: 'blue' }),
  col({ id: 'logistic_amount', label: 'LOGISTIC AMOUNT', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'transit_insurance_pct', label: 'TRANSIT INSURANCE %', tone: 'blue' }),
  col({ id: 'transit_insurance_amount', label: 'TRANSIT INSURANCE AMOUNT', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'packing_forwarding_pct', label: 'PACKING & FORWARDING %', tone: 'blue' }),
  col({ id: 'packing_forwarding_amount', label: 'PACKING & FORWARDING AMOUNT', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'landing_price', label: 'LANDING PRICE', tone: 'grey', isCalculated: true, money: 'inr' }),
  col({ id: 'margin_pct', label: 'MARGIN %', tone: 'blue' }),
  col({ id: 'margin_amount', label: 'MARGIN AMOUNT', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'per_unit_rate', label: 'PER UNIT RATE', tone: 'yellow', isCalculated: true, money: 'inr' }),
  col({ id: 'incentive_pct', label: 'INCENTIVE PERCENTAGE %', tone: 'blue' }),
  col({ id: 'incentive_amount', label: 'INCENTIVE AMOUNT', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'rate_to_quote', label: 'RATE TO BE QUOTED', tone: 'green', isCalculated: true, money: 'inr' }),
  col({ id: 'total_without_gst', label: 'TOTAL AMOUNT WITHOUT GST', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'gst_pct', label: 'GST %', tone: 'blue' }),
  col({ id: 'gst_amount', label: 'GST AMOUNT', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'total_with_gst', label: 'TOTAL AMOUNT WITH GST', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
];

export const INTERNATIONAL_COST_COLUMNS = [
  col({ id: 'hsn_code', label: 'HSN Code', tone: 'blue', inputType: 'text' }),
  col({ id: 'qty', label: 'Item Qty', tone: 'blue', sumTotal: true }),
  col({ id: 'item_cost_dollar', label: 'Item Cost (DOLLAR)', tone: 'blue', money: 'usd', sumTotal: true }),
  col({ id: 'discount_from_vendor', label: 'Discount From Vendor', tone: 'blue', money: 'usd', sumTotal: true }),
  col({ id: 'discounted_item_cost', label: 'Discounted Item Cost', tone: 'yellow', isCalculated: true, money: 'usd', sumTotal: true }),
  col({ id: 'currency_rate', label: 'Currency Rate (INR)', tone: 'blue', money: 'inr' }),
  col({ id: 'per_item_cost_inr', label: 'Per Item Cost (INR)', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'total_consignment_cost', label: 'Total Consignment Cost (INR)', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'duty_pct', label: 'Duty %', tone: 'blue', group: 'import' }),
  col({ id: 'duty_amount', label: 'Duty Amount', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'sws_pct', label: 'SWS %', tone: 'blue', group: 'import' }),
  col({ id: 'sws_amount', label: 'SWS Amount', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'aidc_pct', label: 'AIDC %', tone: 'blue', group: 'import' }),
  col({ id: 'aidc_amount', label: 'AIDC Amount', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'igst_pct', label: 'IGST %', tone: 'blue', group: 'import' }),
  col({ id: 'igst_amount', label: 'IGST Amount', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'penalty_amount', label: 'Penalty Amount', tone: 'blue', money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'warehouse_charge', label: 'Warehouse Charge', tone: 'blue', money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'bonded_storage', label: 'Bonded Storage', tone: 'blue', money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'clearance_charge', label: 'Clearance Charge', tone: 'blue', money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'disbursement_fee', label: 'Disbursement Fee', tone: 'blue', money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'transportation_dhl', label: 'Transportation - DHL', tone: 'blue', money: 'inr', sumTotal: true, group: 'import' }),
  col({ id: 'total_import_cost', label: 'Total Import Cost', tone: 'green', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'logistic_pct', label: 'LOGISTIC %', tone: 'blue', headerTone: 'green' }),
  col({ id: 'logistic_amount', label: 'LOGISTIC AMOUNT', tone: 'green', isCalculated: true, money: 'inr', sumTotal: true }),
  col({ id: 'transit_insurance_pct', label: 'TRANSIT INSURANCE %', tone: 'blue' }),
  col({ id: 'transit_insurance_amount', label: 'TRANSIT INSURANCE AMOUNT', tone: 'yellow', isCalculated: true, money: 'inr', sumTotal: true }),
];

export function getWorkingCostColumns(type) {
  if (type === 'international') return INTERNATIONAL_COST_COLUMNS;
  if (type === 'domestic') return DOMESTIC_COST_COLUMNS;
  return [];
}

export function getManualInputIds(type) {
  return getWorkingCostColumns(type).filter((column) => column.isEditable).map((column) => column.id);
}

export function allWorkingCostManualIds() {
  const ids = new Set([
    ...getManualInputIds('domestic'),
    ...getManualInputIds('international'),
  ]);
  return [...ids];
}

export function itemColumnLabel(type) {
  return type === 'domestic' ? 'ITEM DETAILS' : 'Item';
}

export function totalRowLabel(type) {
  return type === 'domestic' ? 'Total Cost' : 'Total';
}

const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
};

const pctOf = (base, percent) => (Number(base) || 0) * ((Number(percent) || 0) / 100);

/**
 * Domestic, per unit until the total columns:
 * discounted = vendor unit rate − discount
 * landing = discounted + logistic + transit insurance + packing & forwarding
 * per unit = landing + margin
 * rate to quote = per unit + incentive
 * line total = rate to quote × qty, then GST
 */
function computeDomestic(getVal) {
  const qty = Math.max(0, getVal('qty'));
  const vendorUnitRate = getVal('vendor_unit_rate');
  const discount = getVal('discount');
  const discounted = Math.max(0, vendorUnitRate - discount);
  const logisticAmount = pctOf(discounted, getVal('logistic_pct'));
  const transitAmount = pctOf(discounted, getVal('transit_insurance_pct'));
  const packingAmount = pctOf(discounted, getVal('packing_forwarding_pct'));
  const landing = discounted + logisticAmount + transitAmount + packingAmount;
  const marginAmount = pctOf(landing, getVal('margin_pct'));
  const perUnit = landing + marginAmount;
  const incentiveAmount = pctOf(perUnit, getVal('incentive_pct'));
  const rateToQuote = perUnit + incentiveAmount;
  const totalWithoutGst = rateToQuote * qty;
  const gstAmount = pctOf(totalWithoutGst, getVal('gst_pct'));
  const totalWithGst = totalWithoutGst + gstAmount;

  return {
    vendor_discounted_rate: money(discounted),
    logistic_amount: money(logisticAmount),
    transit_insurance_amount: money(transitAmount),
    packing_forwarding_amount: money(packingAmount),
    landing_price: money(landing),
    margin_amount: money(marginAmount),
    per_unit_rate: money(perUnit),
    incentive_amount: money(incentiveAmount),
    rate_to_quote: money(rateToQuote),
    total_without_gst: money(totalWithoutGst),
    gst_amount: money(gstAmount),
    total_with_gst: money(totalWithGst),
    grand_total_supply_cost_excl_gst: money(totalWithoutGst),
    grand_total_supply_cost_with_gst: money(totalWithGst),
  };
}

/**
 * International:
 * discounted $ = item cost − vendor discount
 * per item INR = discounted $ × currency rate
 * consignment = per item INR × qty
 * duty / SWS / AIDC / IGST amounts are each a percent of consignment cost
 * total import = consignment + those duties + penalty, warehouse, bonded storage,
 * clearance, disbursement, and transportation
 * logistic and transit insurance amounts are a percent of total import cost
 */
function computeInternational(getVal) {
  const qty = Math.max(0, getVal('qty'));
  const itemCost = getVal('item_cost_dollar');
  const discount = getVal('discount_from_vendor');
  const discounted = Math.max(0, itemCost - discount);
  const currencyRate = getVal('currency_rate');
  const perItemInr = discounted * currencyRate;
  const consignment = perItemInr * qty;
  const dutyAmount = pctOf(consignment, getVal('duty_pct'));
  const swsAmount = pctOf(consignment, getVal('sws_pct'));
  const aidcAmount = pctOf(consignment, getVal('aidc_pct'));
  const igstAmount = pctOf(consignment, getVal('igst_pct'));
  const penalty = getVal('penalty_amount');
  const warehouse = getVal('warehouse_charge');
  const bonded = getVal('bonded_storage');
  const clearance = getVal('clearance_charge');
  const disbursement = getVal('disbursement_fee');
  const transportation = getVal('transportation_dhl');
  const totalImport = consignment
    + dutyAmount
    + swsAmount
    + aidcAmount
    + igstAmount
    + penalty
    + warehouse
    + bonded
    + clearance
    + disbursement
    + transportation;
  const logisticAmount = pctOf(totalImport, getVal('logistic_pct'));
  const transitAmount = pctOf(totalImport, getVal('transit_insurance_pct'));
  const lineTotal = totalImport + logisticAmount + transitAmount;
  const beforeIgst = Math.max(0, lineTotal - igstAmount);

  return {
    discounted_item_cost: money(discounted),
    per_item_cost_inr: money(perItemInr),
    total_consignment_cost: money(consignment),
    duty_amount: money(dutyAmount),
    sws_amount: money(swsAmount),
    aidc_amount: money(aidcAmount),
    igst_amount: money(igstAmount),
    total_import_cost: money(totalImport),
    logistic_amount: money(logisticAmount),
    transit_insurance_amount: money(transitAmount),
    grand_total_supply_cost_excl_gst: money(beforeIgst),
    grand_total_supply_cost_with_gst: money(lineTotal),
  };
}

export function computeWorkingCostRow(type, getVal) {
  if (type === 'international') return computeInternational(getVal);
  if (type === 'domestic') return computeDomestic(getVal);
  return {};
}

export function costingDataLooksLegacy(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.sheetType === 'domestic' || parsed.sheetType === 'international') return false;
  if (Array.isArray(parsed.costHeads) && parsed.costHeads.some((head) => head?.id === 'import_base_cost')) {
    return true;
  }
  return Object.keys(parsed).some((key) => (
    key.endsWith('_import_base_cost')
    && parsed[key] !== ''
    && parsed[key] != null
  ));
}

export function headerBands(columns) {
  const bands = [];
  columns.forEach((column) => {
    const group = column.group || null;
    const last = bands[bands.length - 1];
    if (last && last.group && last.group === group) last.columns.push(column);
    else bands.push({ group, columns: [column] });
  });
  return bands;
}

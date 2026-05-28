/** Canonical formula variable tokens (case-insensitive lookup). */
export const FORMULA_VARIABLES = [
  { key: 'Gross', label: 'Gross (monthly)', source: 'profile' },
  { key: 'CTC', label: 'CTC (annual)', source: 'profile' },
  { key: 'Basic', label: 'Basic (computed)', source: 'component' },
  { key: 'PresentDays', label: 'Present Days', source: 'attendance' },
  { key: 'MonthDays', label: 'Month Days', source: 'attendance' },
  { key: 'PaidDays', label: 'Paid Days', source: 'attendance' },
  { key: 'FixedAmount', label: 'Fixed Amount', source: 'constant' },
];

export const FORMULA_FUNCTIONS = [
  { name: 'round', arity: 2, description: 'round(value, decimals)' },
  { name: 'min', arity: 2, description: 'min(a, b)' },
  { name: 'max', arity: 2, description: 'max(a, b)' },
  { name: 'prorate', arity: 3, description: 'prorate(monthly, monthDays, presentDays)' },
  { name: 'if', arity: 3, description: 'if(condition, then, else)' },
];

export function normalizeVarKey(name) {
  return String(name || '').trim();
}

export function buildVariableMap(ctx = {}, componentValues = {}) {
  const map = {
    Gross: Number(ctx.gross ?? ctx.Gross ?? 0),
    CTC: Number(ctx.ctc ?? ctx.CTC ?? 0),
    PresentDays: Number(ctx.presentDays ?? ctx.PresentDays ?? 0),
    MonthDays: Number(ctx.monthDays ?? ctx.MonthDays ?? 0),
    PaidDays: Number(ctx.paidDays ?? ctx.PaidDays ?? ctx.presentDays ?? 0),
    FixedAmount: Number(ctx.fixedAmount ?? ctx.FixedAmount ?? 0),
    ...Object.fromEntries(
      Object.entries(componentValues).map(([k, v]) => [normalizeVarKey(k), Number(v) || 0])
    ),
  };
  map.Basic = Number(componentValues.Basic ?? componentValues.BASIC ?? componentValues.basic ?? map.Basic ?? 0);
  return map;
}

/** Bump when default formula groups change so stored data resets. */
export const FORMULA_GROUPS_VERSION = 2;

/** Canonical payroll formulas for Formula Library. */
export const FORMULA_GROUPS = [
  {
    key: 'earnings',
    title: 'Earning Formulas',
    dot: '#059669',
    accent: '#059669',
    items: [
      { id: 'e1', name: 'Working Days', expression: 'Monthly days − week off' },
      { id: 'e2', name: 'Earned Basic', expression: 'Minimum wages × Present days' },
      { id: 'e3', name: 'Earned Basic', expression: 'Minimum monthly wages ÷ working days × Present days' },
      { id: 'e4', name: 'Leave Wages', expression: 'Earned basic ÷ 20' },
      { id: 'e5', name: 'Earned House Rent', expression: 'Earned Basic × 40 ÷ 100' },
      { id: 'e6', name: 'Earned Washing Allowance', expression: 'Washing Allowance ÷ working days × Present days' },
      { id: 'e7', name: 'Earned Transportation Allowance', expression: 'Transportation Allowance ÷ working days × Present days' },
      { id: 'e8', name: 'Earned Bonus', expression: 'Earned Basic × 8.33 ÷ 100' },
      { id: 'e9', name: 'Earned Gratuity', expression: 'Earned basic × 4.81 ÷ 100' },
      { id: 'e10', name: 'Earned Food Allowance', expression: 'Food Allowance ÷ working days × Present days' },
      { id: 'e11', name: 'Earned Medical Allowance', expression: 'Medical Allowance ÷ working days × Present days' },
      { id: 'e12', name: 'Earned NH/PH', expression: 'Minimum wages × NH/PH days' },
      { id: 'e13', name: 'Earned NH/PH Monthly', expression: 'Minimum wages × Yearly NH/PH days ÷ 12 × Present days ÷ working days' },
      { id: 'e14', name: 'PF Wages', expression: 'Earned minimum wages + Other Allowance' },
      { id: 'e15', name: 'Other Allowance', expression: 'Formulas may vary as per site-specific requirements' },
      { id: 'e16', name: 'Retention Allowance', expression: 'Minimum wages ÷ 2 × Present days' },
      { id: 'e17', name: 'Earned OT', expression: 'Minimum wages × 2 × OT days' },
      { id: 'e18', name: 'Earned OT', expression: 'Salary rate ÷ working days × OT days × 2' },
      { id: 'e19', name: 'Earned Salary', expression: 'Salary rate per day × Present days' },
      { id: 'e20', name: 'Earned Salary', expression: 'Monthly salary rate ÷ working days × Present days' },
      { id: 'e21', name: 'Gross Earning', expression: 'Formulas may vary as per site-specific requirements' },
      { id: 'e22', name: 'Total Earning', expression: 'Gross Earning + Earned NH/PH' },
      { id: 'e23', name: 'Total Deduction', expression: 'Formulas may vary as per site-specific requirements' },
      { id: 'e24', name: 'Net Earning', expression: 'Total Earning − Total Deduction' },
    ],
  },
  {
    key: 'deductions',
    title: 'Deduction Formulas',
    dot: '#dc2626',
    accent: '#dc2626',
    items: [
      { id: 'd1', name: 'PF', expression: 'Earned Basic × 12 ÷ 100' },
      { id: 'd2', name: 'PF', expression: '(Earned Basic + Other Allowance) × 12 ÷ 100' },
      { id: 'd3', name: 'Loan', expression: 'Amount' },
      { id: 'd4', name: 'Salary Advance', expression: 'Amount' },
      { id: 'd5', name: 'Held', expression: 'Amount ÷ full held' },
      { id: 'd6', name: 'Penalty', expression: 'Amount' },
      { id: 'd7', name: 'Professional Tax', expression: 'State wise' },
    ],
  },
];

export const FORMULAS = FORMULA_GROUPS.flatMap((group) =>
  (group.items || []).map((item) => ({
    ...item,
    type: group.key === 'earnings' ? 'e' : 'd',
  }))
);

export const TYPE_META = {
  e: { label: 'Earning', badge: 'bg-emerald-100 text-emerald-800', dot: '#059669', accent: '#059669' },
  s: { label: 'Statutory', badge: 'bg-amber-100 text-amber-800', dot: '#d97706', accent: '#d97706' },
  d: { label: 'Deduction', badge: 'bg-red-100 text-red-800', dot: '#dc2626', accent: '#dc2626' },
};

export const TYPE_GROUP_ORDER = [
  { key: 'e', title: 'Earnings' },
  { key: 's', title: 'Statutory' },
  { key: 'd', title: 'Deductions' },
];

export function formulaGroupItemCount(groups) {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

export function allFormulaGroupItemCount() {
  return formulaGroupItemCount(FORMULA_GROUPS);
}

export const SYSTEM_COMPONENT_NAMES = FORMULA_GROUPS.flatMap((g) => g.items.map((i) => i.name));

export const INITIAL_PACKAGES = [
  {
    id: 'pkg-north',
    name: 'North region',
    sites: ['Delhi NCR', 'Chandigarh', 'Lucknow', 'Jaipur'],
    formulaIds: ['e1', 'e2', 'e4', 'e5', 'e6', 'e7', 'e8', 'e21', 'e22', 'e24', 'd1', 'd7'],
  },
  {
    id: 'pkg-south',
    name: 'South region',
    sites: ['Chennai', 'Bengaluru', 'Hyderabad'],
    formulaIds: ['e1', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e21', 'e22', 'e24', 'd1', 'd2', 'd7'],
  },
  {
    id: 'pkg-west',
    name: 'West region',
    sites: ['Mumbai', 'Pune'],
    formulaIds: ['e1', 'e2', 'e4', 'e5', 'e17', 'e21', 'e22', 'e24', 'd1', 'd3', 'd7'],
  },
  {
    id: 'pkg-mfg',
    name: 'Manufacturing',
    sites: ['Jamnagar', 'Hazira', 'Mundra'],
    formulaIds: FORMULAS.map((f) => f.id),
  },
];

export function packageFormulaCount(pkg) {
  return pkg.formulaIds?.length ?? 0;
}

export function packageSiteCount(pkg) {
  return pkg.sites?.length ?? 0;
}

export function packagesUsingFormula(packages, formulaId) {
  return packages.filter((p) => p.formulaIds.includes(formulaId)).map((p) => p.name);
}

export function buildDefaultAliases() {
  return SYSTEM_COMPONENT_NAMES.map((systemName) => ({ systemName, alias: systemName }));
}

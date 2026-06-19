/** Canonical payroll formulas for Formula Library. */
export const FORMULAS = [
  { id: 'f1', name: 'Basic salary', expression: 'Fixed amount per grade', type: 'e' },
  { id: 'f2', name: 'HRA', expression: 'IF(metro, Basic×0.50, Basic×0.40)', type: 'e' },
  { id: 'f3', name: 'Conveyance allowance', expression: 'Fixed ₹1,600/month', type: 'e' },
  { id: 'f4', name: 'Special allowance', expression: 'CTC – (Basic+HRA+Conv+PF)', type: 'e' },
  { id: 'f5', name: 'LTA', expression: 'Basic × 1/12', type: 'e' },
  { id: 'f6', name: 'Medical allowance', expression: 'Fixed ₹1,250/month', type: 'e' },
  { id: 'f7', name: 'PF deduction', expression: 'MIN(Basic,15000)×0.12', type: 's' },
  { id: 'f8', name: 'ESI deduction', expression: 'IF(Gross≤21000, Gross×0.0075, 0)', type: 's' },
  { id: 'f9', name: 'Professional tax', expression: 'Slab-based by state', type: 's' },
  { id: 'f10', name: 'TDS', expression: 'Annual liability / 12', type: 's' },
  { id: 'f11', name: 'LOP deduction', expression: '(Gross/Working_days)×LOP_days', type: 'd' },
  { id: 'f12', name: 'Night shift allowance', expression: 'Basic×0.15×Night_days/Wdays', type: 'e' },
  { id: 'f13', name: 'Gratuity', expression: '(Basic+DA)/26×15×Years', type: 'e' },
  { id: 'f14', name: 'Advance recovery', expression: 'Fixed installment per agreement', type: 'd' },
];

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

/** Site Setup–aligned groups for the All formulas tab (name-only rows). */
export const FORMULA_GROUPS = [
  {
    key: 'salaryCost',
    title: 'Salary Cost',
    dot: '#64748b',
    accent: '#64748b',
    items: [
      { id: 'salaries', name: 'Gross Salary' },
      { id: 'salariesOT', name: 'Overtime Payment' },
      { id: 'voucher', name: 'Voucher Payment' },
      { id: 'bonus', name: 'Bonus' },
      { id: 'gratuity', name: 'Gratuity' },
    ],
  },
  {
    key: 'empBenefit',
    title: 'Employee Benefit',
    dot: '#2F7D9E',
    accent: '#2F7D9E',
    items: [
      { id: 'pf', name: 'Provident Fund (PF)' },
      { id: 'esicEmp', name: 'ESI / WC' },
      { id: 'insurance', name: 'Insurance / Mediclaim' },
      { id: 'uniform', name: 'Uniform / PPE' },
    ],
  },
  {
    key: 'accommodation',
    title: 'Accomodation and Transportation',
    dot: '#C97A12',
    accent: '#C97A12',
    items: [
      { id: 'houseRent', name: 'House Rent' },
      { id: 'cook', name: 'Cook Salary' },
      { id: 'housekeeping', name: 'Housekeeping salary & material' },
      { id: 'vehicleRent', name: 'Vehicle Rent' },
    ],
  },
  {
    key: 'admin',
    title: 'Admin, Statutory & Other',
    dot: '#9A4A3A',
    accent: '#9A4A3A',
    items: [
      { id: 'labourLicence', name: 'Labour Licence fees' },
      { id: 'indirect', name: 'Indirect expenses' },
      { id: 'bankCharges', name: 'Bank charges / BG' },
      { id: 'medical', name: 'Medical Expense' },
      { id: 'bizPromo', name: 'Business Promotion' },
    ],
  },
  {
    key: 'misc',
    title: 'Miscellaneous Expenses',
    dot: '#B08D2E',
    accent: '#B08D2E',
    items: [
      { id: 'equipment', name: 'Equipment / Tools purchase' },
      { id: 'miscCost', name: 'Miscellaneous cost' },
    ],
  },
];

export function formulaGroupItemCount(groups) {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

export function allFormulaGroupItemCount() {
  return formulaGroupItemCount(FORMULA_GROUPS);
}

export const SYSTEM_COMPONENT_NAMES = [
  'Basic salary',
  'HRA',
  'Conveyance allowance',
  'Special allowance',
  'LTA',
  'Medical allowance',
  'Night shift allowance',
];

export const INITIAL_PACKAGES = [
  {
    id: 'pkg-north',
    name: 'North region',
    sites: ['Delhi NCR', 'Chandigarh', 'Lucknow', 'Jaipur'],
    formulaIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'],
  },
  {
    id: 'pkg-south',
    name: 'South region',
    sites: ['Chennai', 'Bengaluru', 'Hyderabad'],
    formulaIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11'],
  },
  {
    id: 'pkg-west',
    name: 'West region',
    sites: ['Mumbai', 'Pune'],
    formulaIds: ['f1', 'f2', 'f3', 'f4', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f14'],
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

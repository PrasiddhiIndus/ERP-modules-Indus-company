import { PAYROLL_ENTRY_COLUMNS } from "./attendanceSheetExcel";

export const PAYROLL_PACKAGES_STORAGE_KEY = "indus-payroll-formula-packages";
export const PAYROLL_ENTRY_SELECTED_PACKAGE_KEY = "indus-payroll-entry-selected-package-id";

/** Shown on every salary sheet regardless of package */
export const PAYROLL_ALWAYS_COLUMN_KEYS = [
  "srNo",
  "employeeCode",
  "pfNo",
  "uanNo",
  "esicNo",
  "name",
  "accountNumber",
  "ifscCode",
  "designation",
  "dateOfJoining",
  "presentDays",
];

/** Earning line items that roll into gross (earned), in column order */
export const PAYROLL_EARNING_COMPONENT_KEYS = [
  "basicEarned",
  "hra",
  "conveyanceAllowance",
  "medicalAllowance",
  "attendanceBonus",
  "journalPeriodicals",
  "childrenEduAllowance",
  "telephoneInternet",
  "performanceIncentive",
  "specialAllowance",
  "uniformAllowance",
];

/** Keys the admin can toggle when building a package (after always block) */
export const PAYROLL_PACKAGE_TOGGLE_KEYS = PAYROLL_ENTRY_COLUMNS.map((c) => c.key).filter((k) => !PAYROLL_ALWAYS_COLUMN_KEYS.includes(k));

/** Human-readable formula text (for Formula tab + tooltips) */
export const PAYROLL_FORMULA_LABEL_BY_KEY = {
  pfBasicEarned: "PF Basic ÷ Month days × P. Days",
  basicEarned: "Basic ÷ Month days × P. Days",
  hra: "HRA (monthly) ÷ Month days × P. Days",
  conveyanceAllowance: "Conveyance ÷ Month days × P. Days",
  medicalAllowance: "Medical ÷ Month days × P. Days",
  attendanceBonus: "Attendance bonus ÷ Month days × P. Days",
  journalPeriodicals: "Journal allowance ÷ Month days × P. Days",
  childrenEduAllowance: "Children Edu ÷ Month days × P. Days",
  telephoneInternet: "Telephone / Internet ÷ Month days × P. Days",
  performanceIncentive: "Performance incentive ÷ Month days × P. Days",
  specialAllowance: "Special allowance ÷ Month days × P. Days",
  uniformAllowance: "Uniform allowance ÷ Month days × P. Days",
  grossWages: "Gross wages (master / editable)",
  grossWagesEarned: "Sum of selected earning components (Basic earned through Uniform)",
  pfBasic: "PF basic (monthly basis)",
  basic: "Basic (monthly basis)",
  pfAmount: "PF Basic Earned × 12%",
  esic: "Gross wages earned × 0.75% if gross ≤ 21,000 (else 0)",
  professionalTax: "Professional tax (fixed / slab — manual entry)",
  loan: "Loan (manual)",
  salaryAdvance: "Salary advance (manual)",
  held: "Held (manual)",
  totalDeduction: "PF + ESIC + P Tax + Loan + Salary advance + Held",
  netSalary: "Gross wages earned − Total deduction",
  bank: "ROUND(Net salary, 0)",
  paid: "Paid (manual)",
  diff: "Bank − Paid",
  remarks: "Remarks",
};

/** If key is selected, these column keys must appear on the sheet (prerequisites). */
const KEY_REQUIRES = {
  pfBasicEarned: ["pfBasic"],
  basicEarned: ["basic"],
  pfAmount: ["pfBasicEarned"],
  grossWagesEarned: ["basicEarned", "basic", ...PAYROLL_EARNING_COMPONENT_KEYS],
  esic: ["grossWagesEarned"],
  totalDeduction: ["pfAmount", "esic", "professionalTax", "loan", "salaryAdvance", "held"],
  netSalary: ["grossWagesEarned", "totalDeduction"],
  bank: ["netSalary"],
  diff: ["bank", "paid"],
};

function mergeRequired(keysSet) {
  const next = new Set(keysSet);
  let changed = true;
  while (changed) {
    changed = false;
    next.forEach((k) => {
      const req = KEY_REQUIRES[k];
      if (!req) return;
      req.forEach((dep) => {
        if (!next.has(dep)) {
          next.add(dep);
          changed = true;
        }
      });
    });
  }
  return next;
}

/**
 * Ordered column keys for UI / Excel: always block first, then remaining keys in PAYROLL_ENTRY order.
 * @param {string[]} selectedKeys keys the admin chose for the package (may omit always block)
 */
export function resolvePayrollPackageColumnKeys(selectedKeys) {
  const selected = new Set((selectedKeys || []).filter(Boolean));
  PAYROLL_ALWAYS_COLUMN_KEYS.forEach((k) => selected.add(k));
  const merged = mergeRequired(selected);
  const ordered = [];
  PAYROLL_ENTRY_COLUMNS.forEach((c) => {
    if (merged.has(c.key)) ordered.push(c.key);
  });
  return ordered;
}

export function loadPayrollPackages() {
  try {
    const raw = window.localStorage.getItem(PAYROLL_PACKAGES_STORAGE_KEY);
    if (!raw) return getDefaultPayrollPackages();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.packages)) return getDefaultPayrollPackages();
    return {
      packages: data.packages.map((p) => ({
        id: String(p.id || crypto.randomUUID()),
        name: String(p.name || "Package"),
        selectedKeys: Array.isArray(p.selectedKeys) ? p.selectedKeys.filter(Boolean) : [],
      })),
    };
  } catch {
    return getDefaultPayrollPackages();
  }
}

export function savePayrollPackages(state) {
  window.localStorage.setItem(
    PAYROLL_PACKAGES_STORAGE_KEY,
    JSON.stringify({ version: 1, packages: state.packages })
  );
}

export function getDefaultPayrollPackages() {
  const full = PAYROLL_PACKAGE_TOGGLE_KEYS;
  return {
    packages: [
      {
        id: "standard-full",
        name: "Standard (all columns)",
        selectedKeys: [...full],
      },
    ],
  };
}

export function getPackageById(packagesState, id) {
  return packagesState.packages.find((p) => String(p.id) === String(id)) || packagesState.packages[0];
}

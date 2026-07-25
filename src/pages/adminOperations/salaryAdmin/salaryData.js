/**
 * Salary Admin — UI-only helpers (no salary DB yet).
 * Employee list comes from Employee Master; CTC inputs persist in localStorage.
 *
 * Statutory rates (from compensation scheme sheet — refine when final formulas arrive):
 * - Employee PF 12% of Basic (wages capped ₹15,000)
 * - Employer PF 13% of Basic (same cap)
 * - ESIC 0.75% / 3.25% while Gross ≤ ₹21,000
 * - P.Tax ₹200 slab (when Gross > ₹12,000)
 * - Gratuity 4.81% of Basic
 * - Leave encashment 2.25% of Basic
 * - Bonus 8.33% of Gross
 * - HRA: pending formula — kept at 0 until you provide the rate
 */

const STORAGE_KEY = "admin_salary_ctc_ui_v1";

export const PF_WAGE_CAP = 15000;
export const EMP_PF_RATE = 0.12;
export const ER_PF_RATE = 0.13;
export const ESIC_GROSS_THRESHOLD = 21000;
export const EMP_ESIC_RATE = 0.0075;
export const ER_ESIC_RATE = 0.0325;
export const PT_AMOUNT = 200;
export const PT_GROSS_MIN = 12000;
export const GRATUITY_RATE = 0.0481;
export const LEAVE_ENCASH_RATE = 0.0225;
export const BONUS_RATE = 0.0833;

function round0(n) {
  return Math.round(Number(n) || 0);
}

export function formatINR(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return `₹${Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

export function paFromMonthly(monthly) {
  if (monthly == null || monthly === "") return null;
  return round0(Number(monthly) * 12);
}

/** Indian FY label e.g. 2026-2027 (Apr–Mar). */
export function currentCompensationYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${start}-${start + 1}`;
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("Salary Admin: could not persist CTC draft", err);
  }
}

/**
 * @returns {Map<string, object>} employeeMasterId → saved structure
 */
export function fetchSalaryStructureMap() {
  const store = readStore();
  const map = new Map();
  for (const [id, row] of Object.entries(store)) {
    if (row && typeof row === "object") map.set(String(id), row);
  }
  return map;
}

export function getSalaryStructure(employeeMasterId) {
  if (employeeMasterId == null) return null;
  const store = readStore();
  return store[String(employeeMasterId)] || null;
}

export function saveSalaryStructure(employeeMasterId, payload) {
  const id = String(employeeMasterId);
  const store = readStore();
  store[id] = {
    ...payload,
    employee_master_id: id,
    updated_at: new Date().toISOString(),
  };
  writeStore(store);
  return store[id];
}

/**
 * Compute full Part A / Part B / CTC from editable Basic + Special Allowance.
 * HRA stays 0 until the company HRA formula is provided.
 */
export function computeCtcStructure({
  basicMonthly = 0,
  specialAllowanceMonthly = 0,
  hraMonthly = 0,
} = {}) {
  const basic = round0(basicMonthly);
  const special = round0(specialAllowanceMonthly);
  const hra = round0(hraMonthly);

  const hasSalary = basic > 0 || special > 0 || hra > 0;

  if (!hasSalary) {
    return emptyCtcStructure();
  }

  const gross = basic + hra + special;
  const pfBase = Math.min(basic, PF_WAGE_CAP);
  const empPf = round0(pfBase * EMP_PF_RATE);
  const erPf = round0(pfBase * ER_PF_RATE);

  const esicApplicable = gross > 0 && gross <= ESIC_GROSS_THRESHOLD;
  const empEsic = esicApplicable ? round0(gross * EMP_ESIC_RATE) : 0;
  const erEsic = esicApplicable ? round0(gross * ER_ESIC_RATE) : 0;

  const pt = gross > PT_GROSS_MIN ? PT_AMOUNT : 0;

  const takeHome = gross - empPf - pt - empEsic;

  const gratuity = round0(basic * GRATUITY_RATE);
  const leaveEncash = round0(basic * LEAVE_ENCASH_RATE);
  const bonus = round0(gross * BONUS_RATE);

  const totalB = erPf + erEsic + gratuity + leaveEncash + bonus;
  const ctcMonthly = gross + totalB;
  const ctcAnnual = paFromMonthly(ctcMonthly);

  return {
    basic_monthly: basic,
    hra_monthly: hra,
    special_allowance_monthly: special,
    gross_monthly: gross,
    emp_pf_monthly: empPf,
    pt_monthly: pt,
    emp_esic_monthly: empEsic,
    emp_esic_applicable: esicApplicable,
    take_home_monthly: takeHome,
    er_pf_monthly: erPf,
    er_esic_monthly: erEsic,
    gratuity_monthly: gratuity,
    leave_encash_monthly: leaveEncash,
    bonus_monthly: bonus,
    total_b_monthly: totalB,
    ctc_monthly: ctcMonthly,
    ctc_annual: ctcAnnual,
    declared: true,
  };
}

export function emptyCtcStructure() {
  return {
    basic_monthly: null,
    hra_monthly: null,
    special_allowance_monthly: null,
    gross_monthly: null,
    emp_pf_monthly: null,
    pt_monthly: null,
    emp_esic_monthly: null,
    emp_esic_applicable: false,
    take_home_monthly: null,
    er_pf_monthly: null,
    er_esic_monthly: null,
    gratuity_monthly: null,
    leave_encash_monthly: null,
    bonus_monthly: null,
    total_b_monthly: null,
    ctc_monthly: null,
    ctc_annual: null,
    declared: false,
  };
}

export function statutoryHelpText() {
  return (
    `Statutory rates applied: Employee PF ${EMP_PF_RATE * 100}% (Basic capped ₹${PF_WAGE_CAP.toLocaleString("en-IN")})` +
    ` · Employer PF ${ER_PF_RATE * 100}%` +
    ` · ESIC ${(EMP_ESIC_RATE * 100).toFixed(2)}% / ${(ER_ESIC_RATE * 100).toFixed(2)}% (applies while Gross ≤ ₹${ESIC_GROSS_THRESHOLD.toLocaleString("en-IN")})` +
    ` · P.Tax ₹${PT_AMOUNT} slab` +
    ` · Gratuity ${(GRATUITY_RATE * 100).toFixed(2)}% of Basic` +
    ` · Leave Encashment ${(LEAVE_ENCASH_RATE * 100).toFixed(2)}% of Basic` +
    ` · Bonus ${(BONUS_RATE * 100).toFixed(2)}% of Gross` +
    `. HRA formula pending — enter HRA if needed. Edit Basic or Special Allowance and press Save to keep values on this device.`
  );
}

/** Default present-day base for monthly wage proration (matches processing sheet). */
export const DEFAULT_MONTH_DAYS = 26;

function prorate(amount, presentDays, monthDays = DEFAULT_MONTH_DAYS) {
  const base = Number(amount) || 0;
  const days = Number(presentDays);
  const denom = Number(monthDays) || DEFAULT_MONTH_DAYS;
  if (!Number.isFinite(days) || denom <= 0) return 0;
  return round0((base * days) / denom);
}

/**
 * Build one Salary Processing row from Salary Master CTC + attendance inputs.
 * Loan / Canteen / TDS / unpaid adjustments stay editable overrides (default 0).
 */
export function computeProcessingRow({
  structure,
  presentDays = DEFAULT_MONTH_DAYS,
  monthDays = DEFAULT_MONTH_DAYS,
  loan = 0,
  canteen = 0,
  unpaidPaid = 0,
  tds = 0,
} = {}) {
  const declared = Boolean(structure?.declared);
  const basic = declared ? round0(structure.basic_monthly) : 0;
  const hra = declared ? round0(structure.hra_monthly) : 0;
  const special = declared ? round0(structure.special_allowance_monthly) : 0;
  const grossRate = declared
    ? round0(structure.gross_monthly ?? basic + hra + special)
    : 0;

  if (!declared || grossRate <= 0) {
    return {
      declared: false,
      salary_rate: null,
      present_days: presentDays,
      pf_basic: null,
      pf_earned_basic: null,
      basic: null,
      basic_earned: null,
      hra: null,
      special_allowance: null,
      gross_wages: null,
      emp_pf: null,
      emp_esic: null,
      pt: null,
      loan: round0(loan),
      canteen: round0(canteen),
      unpaid_paid: round0(unpaidPaid),
      tds: round0(tds),
      total_ded: null,
      net_salary: null,
      bank: null,
    };
  }

  const pfBasic = Math.min(basic, PF_WAGE_CAP);
  const pfEarnedBasic = prorate(pfBasic, presentDays, monthDays);
  const basicEarned = prorate(basic, presentDays, monthDays);
  const hraEarned = prorate(hra, presentDays, monthDays);
  const specialEarned = prorate(special, presentDays, monthDays);
  const grossWages = basicEarned + hraEarned + specialEarned;

  const empPf = round0(Math.min(pfEarnedBasic, PF_WAGE_CAP) * EMP_PF_RATE);
  const esicApplicable = grossWages > 0 && grossWages <= ESIC_GROSS_THRESHOLD;
  const empEsic = esicApplicable ? round0(grossWages * EMP_ESIC_RATE) : 0;
  const pt = grossWages > PT_GROSS_MIN ? PT_AMOUNT : 0;

  const loanN = round0(loan);
  const canteenN = round0(canteen);
  const unpaidN = round0(unpaidPaid);
  const tdsN = round0(tds);
  const totalDed = empPf + empEsic + pt + loanN + canteenN + unpaidN + tdsN;
  const net = grossWages - totalDed;

  return {
    declared: true,
    salary_rate: grossRate,
    present_days: Number(presentDays) || 0,
    pf_basic: pfBasic,
    pf_earned_basic: pfEarnedBasic,
    basic,
    basic_earned: basicEarned,
    hra: hraEarned,
    special_allowance: specialEarned,
    gross_wages: grossWages,
    emp_pf: empPf,
    emp_esic: empEsic,
    pt,
    loan: loanN,
    canteen: canteenN,
    unpaid_paid: unpaidN,
    tds: tdsN,
    total_ded: totalDed,
    net_salary: net,
    bank: net,
  };
}

export function formatINRPlain(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

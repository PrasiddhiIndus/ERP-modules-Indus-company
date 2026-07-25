/**
 * Salary Admin — UI-only helpers (no salary DB yet).
 * Employee list comes from Employee Master; CTC inputs persist in localStorage.
 *
 * CTC / Part A–B rates:
 * - HRA = 40% of Basic
 * - Employee PF 12% (Basic capped ₹15,000) · Employer PF 13%
 * - ESIC 0.75% / 3.25% while Gross ≤ ₹21,000
 * - P.Tax ₹200 slab (when Gross > ₹12,000)
 * - Gratuity 4.81% · Leave 2.25% · Bonus 8.33%
 *
 * Salary Processing sheet (TotalDays = 26 fixed):
 * - M PF earned = L/TotalDays*K · O Basic earned = N/TotalDays*K
 * - P HRA = (N*0.40)/TotalDays*K · Q Special = (J-N-N*0.40)/TotalDays*K
 * - R = O+P+Q · S = M*0.12 · T = IF(R<=21000,R*0.0075,0)
 * - Z = SUM(S:Y) · AA = R-Z · AB = ROUND(AA,0)
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
export const HRA_OF_BASIC_RATE = 0.4;

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

/** HRA monthly from Basic (sheet: N * 0.40). */
export function hraFromBasic(basicMonthly) {
  return round0(Number(basicMonthly) * HRA_OF_BASIC_RATE);
}

/**
 * Compute full Part A / Part B / CTC from editable Basic + Special Allowance.
 * HRA = 40% of Basic (sheet formula). Optional hraMonthly overrides only if passed explicitly as non-null and autoHra is false.
 */
export function computeCtcStructure({
  basicMonthly = 0,
  specialAllowanceMonthly = 0,
  hraMonthly = null,
  autoHra = true,
} = {}) {
  const basic = round0(basicMonthly);
  const special = round0(specialAllowanceMonthly);
  const hra =
    autoHra || hraMonthly == null ? hraFromBasic(basic) : round0(hraMonthly);

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
    `HRA ${HRA_OF_BASIC_RATE * 100}% of Basic` +
    ` · Employee PF ${EMP_PF_RATE * 100}% (Basic capped ₹${PF_WAGE_CAP.toLocaleString("en-IN")})` +
    ` · Employer PF ${ER_PF_RATE * 100}%` +
    ` · ESIC ${(EMP_ESIC_RATE * 100).toFixed(2)}% / ${(ER_ESIC_RATE * 100).toFixed(2)}% (applies while Gross ≤ ₹${ESIC_GROSS_THRESHOLD.toLocaleString("en-IN")})` +
    ` · P.Tax ₹${PT_AMOUNT} slab` +
    ` · Gratuity ${(GRATUITY_RATE * 100).toFixed(2)}% of Basic` +
    ` · Leave Encashment ${(LEAVE_ENCASH_RATE * 100).toFixed(2)}% of Basic` +
    ` · Bonus ${(BONUS_RATE * 100).toFixed(2)}% of Gross` +
    `. Edit Basic or Special Allowance and press Save to keep values on this device.`
  );
}

/** Company paid-days base (not calendar days). */
export const DEFAULT_MONTH_DAYS = 26;

/** Sheet: amount / TotalDays * presentDays */
function sheetProrate(amount, presentDays, totalDays = DEFAULT_MONTH_DAYS) {
  const base = Number(amount) || 0;
  const k = Number(presentDays);
  const td = Number(totalDays) || DEFAULT_MONTH_DAYS;
  if (!Number.isFinite(k) || td <= 0) return 0;
  return round0((base / td) * k);
}

/** Default P.Tax from simple slab (state table can replace later). */
export function defaultPtForGross(grossWages) {
  return Number(grossWages) > PT_GROSS_MIN ? PT_AMOUNT : 0;
}

/**
 * Salary Processing row — formulas match the company sheet:
 * M=L/TotalDays*K, O=N/TotalDays*K, P=(N*0.40)/TotalDays*K,
 * Q=(J-N-N*0.40)/TotalDays*K, R=O+P+Q, S=M*0.12,
 * T=IF(R<=21000,R*0.0075,0), Z=SUM(S:Y), AA=R-Z, AB=ROUND(AA,0).
 */
export function computeProcessingRow({
  structure,
  presentDays = DEFAULT_MONTH_DAYS,
  totalDays = DEFAULT_MONTH_DAYS,
  pfBasicOverride = null,
  ptOverride = null,
  loan = 0,
  salAdv = 0,
  unpaidPaid = 0,
  tds = 0,
} = {}) {
  const declared = Boolean(structure?.declared);
  const basicN = declared ? round0(structure.basic_monthly) : 0;
  const specialStored = declared ? round0(structure.special_allowance_monthly) : 0;
  const hraRate = hraFromBasic(basicN);
  const salaryRateJ = declared
    ? round0(
        structure.gross_monthly ??
          basicN + hraRate + specialStored
      )
    : 0;

  const emptyExtras = {
    loan: round0(loan),
    sal_adv: round0(salAdv),
    unpaid_paid: round0(unpaidPaid),
    tds: round0(tds),
  };

  if (!declared || (salaryRateJ <= 0 && basicN <= 0)) {
    return {
      declared: false,
      salary_rate: null,
      present_days: presentDays,
      total_days: totalDays,
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
      ...emptyExtras,
      total_ded: null,
      net_salary: null,
      bank: null,
    };
  }

  const K = Number(presentDays);
  const TotalDays = Number(totalDays) || DEFAULT_MONTH_DAYS;

  // L — PF Basic (capped), overridable
  const pfBasicL =
    pfBasicOverride != null && pfBasicOverride !== ""
      ? round0(pfBasicOverride)
      : Math.min(basicN, PF_WAGE_CAP);

  // M = L / TotalDays * K
  const pfEarnedM = sheetProrate(pfBasicL, K, TotalDays);
  // O = N / TotalDays * K
  const basicEarnedO = sheetProrate(basicN, K, TotalDays);
  // P = (N * 0.40) / TotalDays * K
  const hraP = sheetProrate(basicN * HRA_OF_BASIC_RATE, K, TotalDays);
  // Q = (J - N - N*0.40) / TotalDays * K
  const specialQ = sheetProrate(salaryRateJ - basicN - basicN * HRA_OF_BASIC_RATE, K, TotalDays);
  // R = O + P + Q
  const grossWagesR = basicEarnedO + hraP + specialQ;
  // S = M * 0.12
  const empPfS = round0(pfEarnedM * EMP_PF_RATE);
  // T = IF(R <= 21000, R * 0.0075, 0)
  const empEsicT =
    grossWagesR > 0 && grossWagesR <= ESIC_GROSS_THRESHOLD
      ? round0(grossWagesR * EMP_ESIC_RATE)
      : 0;
  // U — P.Tax (slab default, overridable input)
  const ptU =
    ptOverride != null && ptOverride !== ""
      ? round0(ptOverride)
      : defaultPtForGross(grossWagesR);

  const loanV = round0(loan);
  const salAdvW = round0(salAdv);
  const unpaidX = round0(unpaidPaid);
  const tdsY = round0(tds);
  // Z = SUM(S:Y)
  const totalDedZ = empPfS + empEsicT + ptU + loanV + salAdvW + unpaidX + tdsY;
  // AA = R - Z
  const netAA = grossWagesR - totalDedZ;
  // AB = ROUND(AA, 0)
  const bankAB = round0(netAA);

  return {
    declared: true,
    salary_rate: salaryRateJ,
    present_days: Number.isFinite(K) ? K : 0,
    total_days: TotalDays,
    pf_basic: pfBasicL,
    pf_earned_basic: pfEarnedM,
    basic: basicN,
    basic_earned: basicEarnedO,
    hra: hraP,
    special_allowance: specialQ,
    gross_wages: grossWagesR,
    emp_pf: empPfS,
    emp_esic: empEsicT,
    pt: ptU,
    loan: loanV,
    sal_adv: salAdvW,
    unpaid_paid: unpaidX,
    tds: tdsY,
    total_ded: totalDedZ,
    net_salary: netAA,
    bank: bankAB,
  };
}

export function processingHelpText() {
  return (
    `TotalDays = ${DEFAULT_MONTH_DAYS} (company paid days). ` +
    `PF earned = PF Basic / TotalDays × P.Days · Basic earned = Basic / TotalDays × P.Days · ` +
    `HRA = (Basic × 40%) / TotalDays × P.Days · Special = (Gross − Basic − Basic×40%) / TotalDays × P.Days · ` +
    `Gross wages = Basic earned + HRA + Special · PF = PF earned × 12% · ` +
    `ESIC = Gross×0.75% if Gross ≤ ₹21,000 · Total ded. = PF+ESIC+P.Tax+Loan+Sal Adv+Unpaid/Paid+TDS · ` +
    `Net = Gross − Total ded. · Bank = ROUND(Net, 0).`
  );
}

export function formatINRPlain(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

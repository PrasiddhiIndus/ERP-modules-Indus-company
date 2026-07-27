/**
 * Salary Admin — UI-only helpers (no salary DB yet).
 * Compensation scheme matches Indus sheet Year 2026-2027.
 *
 * PART A (monthly; P.A. = monthly × 12):
 * - Basic — manual
 * - HRA = 1000 + 2120 + 16 − 62  (fixed sheet formula)
 * - Special Allowance — manual (balancing figure)
 * - GROSS = Basic + HRA + Special Allowance
 * - Employee PF — manual (suggest 12% of Basic, capped ₹15,000)
 * - P.Tax — manual (suggest ₹200 when Gross > ₹12,000)
 * - Employee ESIC = Gross × 0.75% if Gross ≤ ₹21,000 else 0
 * - TAKE HOME = Gross − Emp PF − P.Tax − Emp ESIC
 *
 * PART B:
 * - Employer PF — manual (suggest 13% of Basic, capped ₹15,000)
 * - Employer ESIC = Gross × 3.25% if Gross ≤ ₹21,000 else 0
 * - Gratuity = Basic × 4.81%
 * - Leave Encashment = (Basic / 26) × (7 / 12)
 * - Bonus — manual
 * - Total (B) = Er PF + Er ESIC + Gratuity + Leave Encashment + Bonus
 *
 * CTC (Monthly) = Gross + Total (B) · CTC (Annual) = CTC Monthly × 12
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
export const LEAVE_ENCASH_DAYS = 26;
export const LEAVE_ENCASH_MONTHS = 7 / 12;

/** Fixed HRA from compensation sheet: 1000 + 2120 + 16 − 62 = 3074. */
export const HRA_FIXED = Object.freeze({
  a: 1000,
  b: 2120,
  c: 16,
  d: 62,
});

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

/** HRA monthly from fixed sheet expression. */
export function hraFixedMonthly() {
  return round0(HRA_FIXED.a + HRA_FIXED.b + HRA_FIXED.c - HRA_FIXED.d);
}

/** @deprecated — sheet uses fixed HRA, not % of Basic. */
export function hraFromBasic(_basicMonthly) {
  return hraFixedMonthly();
}

export function suggestedEmpPf(basicMonthly) {
  const pfBase = Math.min(round0(basicMonthly), PF_WAGE_CAP);
  return round0(pfBase * EMP_PF_RATE);
}

export function suggestedErPf(basicMonthly) {
  const pfBase = Math.min(round0(basicMonthly), PF_WAGE_CAP);
  return round0(pfBase * ER_PF_RATE);
}

export function suggestedPfFromBasic(basicMonthly) {
  const basic = round0(basicMonthly);
  return {
    basic,
    empPf: suggestedEmpPf(basic),
    erPf: suggestedErPf(basic),
  };
}

export function leaveEncashFromBasic(basicMonthly) {
  const basic = Number(basicMonthly) || 0;
  if (basic <= 0) return 0;
  return round0((basic / LEAVE_ENCASH_DAYS) * LEAVE_ENCASH_MONTHS);
}

/**
 * Compute Part A / Part B / CTC per written compensation formulas.
 */
export function computeCtcStructure({
  basicMonthly = 0,
  specialAllowanceMonthly = 0,
  empPfMonthly = null,
  erPfMonthly = null,
  ptMonthly = null,
  bonusMonthly = null,
  hraMonthly = null,
} = {}) {
  const basic = round0(basicMonthly);
  const special = round0(specialAllowanceMonthly);
  const hra = hraMonthly == null ? hraFixedMonthly() : round0(hraMonthly);
  const gross = basic + hra + special;

  if (basic <= 0 && special <= 0 && hra <= 0) {
    return emptyCtcStructure();
  }

  const empPf =
    empPfMonthly != null && empPfMonthly !== ""
      ? round0(empPfMonthly)
      : suggestedEmpPf(basic);
  const erPf =
    erPfMonthly != null && erPfMonthly !== ""
      ? round0(erPfMonthly)
      : suggestedErPf(basic);

  const esicApplicable = gross > 0 && gross <= ESIC_GROSS_THRESHOLD;
  const empEsic = esicApplicable ? round0(gross * EMP_ESIC_RATE) : 0;
  const erEsic = esicApplicable ? round0(gross * ER_ESIC_RATE) : 0;

  const pt =
    ptMonthly != null && ptMonthly !== ""
      ? round0(ptMonthly)
      : gross > PT_GROSS_MIN
        ? PT_AMOUNT
        : 0;

  const takeHome = gross - empPf - pt - empEsic;

  const gratuity = round0(basic * GRATUITY_RATE);
  const leaveEncash = leaveEncashFromBasic(basic);
  const bonus =
    bonusMonthly != null && bonusMonthly !== "" ? round0(bonusMonthly) : 0;

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
    `HRA = ${HRA_FIXED.a} + ${HRA_FIXED.b} + ${HRA_FIXED.c} − ${HRA_FIXED.d}` +
    ` · Leave Encashment = (Basic ÷ ${LEAVE_ENCASH_DAYS}) × (7 ÷ 12)` +
    ` · Bonus — manual`
  );
}

export const DEFAULT_MONTH_DAYS = 26;

function sheetProrate(amount, presentDays, totalDays = DEFAULT_MONTH_DAYS) {
  const base = Number(amount) || 0;
  const k = Number(presentDays);
  const td = Number(totalDays) || DEFAULT_MONTH_DAYS;
  if (!Number.isFinite(k) || td <= 0) return 0;
  return round0((base / td) * k);
}

export function defaultPtForGross(grossWages) {
  return Number(grossWages) > PT_GROSS_MIN ? PT_AMOUNT : 0;
}

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
  const hraStored = declared
    ? round0(structure.hra_monthly ?? hraFixedMonthly())
    : 0;
  const salaryRateJ = declared
    ? round0(structure.gross_monthly ?? basicN + hraStored + specialStored)
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

  const pfBasicL =
    pfBasicOverride != null && pfBasicOverride !== ""
      ? round0(pfBasicOverride)
      : Math.min(basicN, PF_WAGE_CAP);

  const pfEarnedM = sheetProrate(pfBasicL, K, TotalDays);
  const basicEarnedO = sheetProrate(basicN, K, TotalDays);
  const hraP = sheetProrate(hraStored, K, TotalDays);
  const specialQ = sheetProrate(specialStored, K, TotalDays);
  const grossWagesR = basicEarnedO + hraP + specialQ;
  const empPfS = round0(pfEarnedM * EMP_PF_RATE);
  const empEsicT =
    grossWagesR > 0 && grossWagesR <= ESIC_GROSS_THRESHOLD
      ? round0(grossWagesR * EMP_ESIC_RATE)
      : 0;
  const ptU =
    ptOverride != null && ptOverride !== ""
      ? round0(ptOverride)
      : defaultPtForGross(grossWagesR);

  const loanV = round0(loan);
  const salAdvW = round0(salAdv);
  const unpaidX = round0(unpaidPaid);
  const tdsY = round0(tds);
  const totalDedZ = empPfS + empEsicT + ptU + loanV + salAdvW + unpaidX + tdsY;
  const netAA = grossWagesR - totalDedZ;
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
    `TotalDays = ${DEFAULT_MONTH_DAYS}. ` +
    `Prorate Basic / HRA / Special from saved master · PF = PF earned × 12% · ` +
    `ESIC if Gross ≤ ₹21,000 · Net = Gross − deductions.`
  );
}

export function formatINRPlain(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

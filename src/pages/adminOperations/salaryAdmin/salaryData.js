/**
 * Salary Admin — UI-only helpers (no salary DB yet).
 * Compensation scheme matches Indus sheet Year 2026-2027.
 *
 * PART A (monthly; P.A. = monthly × 12):
 * - Basic — manual
 * - HRA — 40% of Basic (default) or custom manual amount
 * - Special Allowance — manual (balancing figure)
 * - GROSS = Basic + HRA + Special Allowance
 * - Employee PF — manual (suggest 12% of Basic, capped ₹15,000)
 * - P.Tax — manual (suggest ₹200 when Gross > ₹12,000)
 * - Employee ESIC = Gross × 0.75% if Gross ≤ ₹42,000 else 0
 * - TAKE HOME = Gross − Emp PF − P.Tax − Emp ESIC
 *
 * PART B:
 * - Employer PF — manual (suggest 13% of Basic, capped ₹15,000)
 * - Employer ESIC = Gross × 3.25% if Gross ≤ ₹21,000 else 0
 * - Gratuity = Basic × 4.81%
 * - Leave Encashment = (Basic / 26) × (7 / 12)
 * - Mediclaim health policy — optional manual
 * - LIC policy — optional manual
 * - Bonus — manual
 * - Total (B) = Er PF + Er ESIC + Gratuity + Leave Encashment + Mediclaim + LIC + Bonus
 *
 * CTC (Monthly) = Gross + Total (B) · CTC (Annual) = CTC Monthly × 12
 * Annual (every row) = Monthly × 12
 */

const STORAGE_KEY = "admin_salary_ctc_ui_v1";

export const PF_WAGE_CAP = 15000;
export const EMP_PF_RATE = 0.12;
export const ER_PF_RATE = 0.13;
/** Employee ESIC applies only when Gross (Part A) ≤ this monthly ceiling. */
export const EMP_ESIC_GROSS_THRESHOLD = 42000;
/** Employer ESIC applies only when Gross (Part A) ≤ this monthly ceiling. */
export const ER_ESIC_GROSS_THRESHOLD = 21000;
/** @deprecated Use EMP_ESIC_GROSS_THRESHOLD — kept for older imports. */
export const ESIC_GROSS_THRESHOLD = EMP_ESIC_GROSS_THRESHOLD;
export const EMP_ESIC_RATE = 0.0075;
export const ER_ESIC_RATE = 0.0325;
export const PT_AMOUNT = 200;
export const PT_GROSS_MIN = 12000;
export const GRATUITY_RATE = 0.0481;
export const LEAVE_ENCASH_DAYS = 26;
export const LEAVE_ENCASH_MONTHS = 7 / 12;

/** @deprecated Legacy fixed HRA sheet expression (kept for old drafts). */
export const HRA_FIXED = Object.freeze({
  a: 1000,
  b: 2120,
  c: 16,
  d: 62,
});

/** HRA entry modes on Salary Master CTC. */
export const HRA_MODE_PERCENT = "percent_40";
export const HRA_MODE_CUSTOM = "custom";
export const HRA_PERCENT = 40;

/**
 * Round to whole rupees. Stabilizes float noise (e.g. 15999.999999 → 16000)
 * so entered amounts never display/store as off-by-one.
 */
function round0(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x === 0) return 0;
  const cleaned = Math.round(x * 1e6) / 1e6;
  return Math.round(cleaned);
}

/** Parse a money input to whole rupees (null if empty/invalid). */
export function parseRupeeInput(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return round0(n);
}

export function formatINR(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  const n = round0(value);
  return `₹${n.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

/**
 * Format dates for salary UI. Date-only (YYYY-MM-DD) uses local calendar day
 * so W.E.F. never shifts by one day in IST / other offsets.
 */
export function formatSalaryDate(isoOrDate) {
  if (isoOrDate == null || isoOrDate === "") return "—";
  const s = String(isoOrDate).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function paFromMonthly(monthly) {
  if (monthly == null || monthly === "") return null;
  return round0(Number(monthly)) * 12;
}

/** Today's date as YYYY-MM-DD for date inputs (W.E.F.). */
export function todayInputDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

/** Snapshot of a CTC structure suitable for revision history. */
function snapshotStructure(row) {
  if (!row || typeof row !== "object") return null;
  const {
    revisions: _revisions,
    employee_master_id: _eid,
    ...rest
  } = row;
  return { ...rest };
}

/**
 * First-time CTC save. Does not create a revision entry.
 * If a structure already exists, prefer reviseSalaryStructure.
 */
export function saveSalaryStructure(employeeMasterId, payload) {
  const id = String(employeeMasterId);
  const store = readStore();
  const prev = store[id];
  store[id] = {
    ...payload,
    employee_master_id: id,
    revisions: Array.isArray(prev?.revisions) ? prev.revisions : [],
    revision_count: Number(prev?.revision_count) || 0,
    updated_at: new Date().toISOString(),
  };
  writeStore(store);
  return store[id];
}

/**
 * Revise an existing CTC: archives the current structure, then saves the new one.
 * Archived entry keeps that version's own W.E.F. and reason (not the new revision's).
 * @param {string|number} employeeMasterId
 * @param {object} payload — new CTC fields
 * @param {{ reason?: string, wef_date?: string }} [meta]
 */
export function reviseSalaryStructure(employeeMasterId, payload, meta = {}) {
  const id = String(employeeMasterId);
  const store = readStore();
  const prev = store[id];
  if (!prev?.declared) {
    return saveSalaryStructure(employeeMasterId, {
      ...payload,
      wef_date: meta.wef_date ?? payload.wef_date ?? null,
      revision_reason: meta.reason?.trim() || payload.revision_reason || null,
    });
  }

  const history = Array.isArray(prev.revisions) ? [...prev.revisions] : [];
  const archived = snapshotStructure(prev);
  const nextCount = (Number(prev.revision_count) || 0) + 1;
  const archivedWef = prev.wef_date || archived?.wef_date || null;
  const archivedReason = prev.revision_reason || archived?.revision_reason || null;

  history.unshift({
    ...archived,
    revision_no: nextCount,
    revised_at: new Date().toISOString(),
    // Keep THIS version's W.E.F. and reason (as they were while current)
    wef_date: archivedWef,
    revision_reason: archivedReason,
    superseded_wef: archivedWef,
  });

  const newReason = meta.reason?.trim() || null;
  const newWef = meta.wef_date ?? payload.wef_date ?? null;

  store[id] = {
    ...payload,
    employee_master_id: id,
    wef_date: newWef,
    revision_reason: newReason,
    revisions: history,
    revision_count: nextCount,
    updated_at: new Date().toISOString(),
  };
  writeStore(store);
  return store[id];
}

/** Revision history newest-first (archived versions only). */
export function getSalaryRevisions(employeeMasterId) {
  const row = getSalaryStructure(employeeMasterId);
  if (!row) return [];
  return Array.isArray(row.revisions) ? row.revisions : [];
}

export function getRevisionCount(employeeMasterId) {
  const row = getSalaryStructure(employeeMasterId);
  if (!row) return 0;
  return Number(row.revision_count) || (Array.isArray(row.revisions) ? row.revisions.length : 0);
}

/** @deprecated Legacy fixed HRA monthly. Prefer hraFromBasic / resolveHraMonthly. */
export function hraFixedMonthly() {
  return round0(HRA_FIXED.a + HRA_FIXED.b + HRA_FIXED.c - HRA_FIXED.d);
}

/** HRA = 40% of Basic (whole rupees). */
export function hraFromBasic(basicMonthly) {
  const basic = round0(basicMonthly);
  if (basic <= 0) return 0;
  return round0((basic * HRA_PERCENT) / 100);
}

/**
 * Resolve HRA monthly from mode.
 * @param {{ hraMode?: string, basicMonthly?: number, hraMonthly?: number|null }} opts
 */
export function resolveHraMonthly({
  hraMode = HRA_MODE_PERCENT,
  basicMonthly = 0,
  hraMonthly = null,
} = {}) {
  if (hraMode === HRA_MODE_CUSTOM) {
    if (hraMonthly == null || hraMonthly === "") return 0;
    return round0(hraMonthly);
  }
  return hraFromBasic(basicMonthly);
}

/** Normalize saved / UI HRA mode. */
export function normalizeHraMode(mode) {
  return mode === HRA_MODE_CUSTOM ? HRA_MODE_CUSTOM : HRA_MODE_PERCENT;
}

export function suggestedEmpPf(basicMonthly) {
  const pfBase = Math.min(round0(basicMonthly), PF_WAGE_CAP);
  // 12% of PF base — same formula, integer-safe
  return round0((pfBase * 12) / 100);
}

export function suggestedErPf(basicMonthly) {
  const pfBase = Math.min(round0(basicMonthly), PF_WAGE_CAP);
  // 13% of PF base — same formula, integer-safe
  return round0((pfBase * 13) / 100);
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
  const basic = round0(basicMonthly);
  if (basic <= 0) return 0;
  // (Basic ÷ 26) × (7 ÷ 12) ≡ (Basic × 7) ÷ 312 — same formula, integer-safe
  return round0((basic * 7) / (LEAVE_ENCASH_DAYS * 12));
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
  mediclaimEnabled = false,
  mediclaimMonthly = null,
  licEnabled = false,
  licMonthly = null,
  hraMode = HRA_MODE_PERCENT,
  hraMonthly = null,
} = {}) {
  const basic = round0(basicMonthly);
  const special = round0(specialAllowanceMonthly);
  const mode = normalizeHraMode(hraMode);
  const hra = resolveHraMonthly({
    hraMode: mode,
    basicMonthly: basic,
    hraMonthly,
  });
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

  // Employee ESIC: Gross × 0.75% only if Gross ≤ ₹42,000
  const empEsicApplicable = gross > 0 && gross <= EMP_ESIC_GROSS_THRESHOLD;
  const empEsic = empEsicApplicable ? round0((gross * 75) / 10000) : 0;
  // Employer ESIC: Gross × 3.25% only if Gross ≤ ₹21,000
  const erEsicApplicable = gross > 0 && gross <= ER_ESIC_GROSS_THRESHOLD;
  const erEsic = erEsicApplicable ? round0((gross * 325) / 10000) : 0;

  const pt =
    ptMonthly != null && ptMonthly !== ""
      ? round0(ptMonthly)
      : gross > PT_GROSS_MIN
        ? PT_AMOUNT
        : 0;

  // TAKE HOME = GROSS_A − Employee_PF − P_Tax − Employee_ESIC
  const takeHome = gross - empPf - pt - empEsic;

  // Gratuity = Basic × 4.81%
  const gratuity = round0((basic * 481) / 10000);
  // Leave Encashment = (Basic / 26) × (7 / 12)
  const leaveEncash = leaveEncashFromBasic(basic);
  const bonus =
    bonusMonthly != null && bonusMonthly !== "" ? round0(bonusMonthly) : 0;
  const mediclaim =
    mediclaimEnabled && mediclaimMonthly != null && mediclaimMonthly !== ""
      ? round0(mediclaimMonthly)
      : 0;
  const lic =
    licEnabled && licMonthly != null && licMonthly !== ""
      ? round0(licMonthly)
      : 0;

  // Total (Part B) = Er PF + Er ESIC + Gratuity + Leave Encashment (+ optional Mediclaim / LIC / Bonus)
  const totalB =
    erPf + erEsic + gratuity + leaveEncash + mediclaim + lic + bonus;
  // CTC (Monthly) = GROSS_A + Total_B · CTC (Annual) = CTC_Monthly × 12
  const ctcMonthly = gross + totalB;
  const ctcAnnual = paFromMonthly(ctcMonthly);

  return {
    basic_monthly: basic,
    hra_mode: mode,
    hra_monthly: hra,
    special_allowance_monthly: special,
    gross_monthly: gross,
    emp_pf_monthly: empPf,
    pt_monthly: pt,
    emp_esic_monthly: empEsic,
    emp_esic_applicable: empEsicApplicable,
    take_home_monthly: takeHome,
    er_pf_monthly: erPf,
    er_esic_monthly: erEsic,
    er_esic_applicable: erEsicApplicable,
    gratuity_monthly: gratuity,
    leave_encash_monthly: leaveEncash,
    mediclaim_enabled: Boolean(mediclaimEnabled),
    mediclaim_monthly: mediclaimEnabled ? mediclaim : 0,
    lic_enabled: Boolean(licEnabled),
    lic_monthly: licEnabled ? lic : 0,
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
    hra_mode: HRA_MODE_PERCENT,
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
    er_esic_applicable: false,
    gratuity_monthly: null,
    leave_encash_monthly: null,
    mediclaim_enabled: false,
    mediclaim_monthly: null,
    lic_enabled: false,
    lic_monthly: null,
    bonus_monthly: null,
    total_b_monthly: null,
    ctc_monthly: null,
    ctc_annual: null,
    declared: false,
  };
}

export function statutoryHelpText() {
  return (
    `HRA = ${HRA_PERCENT}% of Basic (or custom)` +
    ` · Leave Encashment = (Basic ÷ ${LEAVE_ENCASH_DAYS}) × (7 ÷ 12)` +
    ` · Bonus — manual`
  );
}

export const DEFAULT_MONTH_DAYS = 26;

function sheetProrate(amount, presentDays, totalDays = DEFAULT_MONTH_DAYS) {
  const base = round0(amount);
  const k = Number(presentDays);
  const td = Number(totalDays) || DEFAULT_MONTH_DAYS;
  if (!Number.isFinite(k) || td <= 0 || base === 0) return 0;
  // (amount ÷ TotalDays) × presentDays — same formula, integer-safe order
  return round0((base * k) / td);
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
    ? round0(
        structure.hra_monthly ??
          resolveHraMonthly({
            hraMode: structure.hra_mode,
            basicMonthly: basicN,
            hraMonthly: structure.hra_monthly,
          })
      )
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
  const empPfS = round0((pfEarnedM * 12) / 100);
  const empEsicT =
    grossWagesR > 0 && grossWagesR <= ESIC_GROSS_THRESHOLD
      ? round0((grossWagesR * 75) / 10000)
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
    `ESIC if Gross ≤ ₹42,000 · Net = Gross − deductions.`
  );
}

export function formatINRPlain(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return round0(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

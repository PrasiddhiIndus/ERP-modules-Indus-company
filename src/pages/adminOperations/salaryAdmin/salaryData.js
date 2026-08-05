/**
 * Salary Admin — CTC formulas + persistence helpers.
 * Persist via public admin_salary_* tables (see salaryDb.js).
 *
 * PART A (monthly; P.A. = monthly × 12):
 * - Gross — master input; drives Auto Basic / HRA / Special
 * - Basic — Auto: MAX(50% of Gross, ₹15,000) · Custom: manual (helper / negotiated)
 * - HRA — Auto: 40% of Basic · Custom: fixed manual amount
 * - Special Allowance — system: Gross − Basic − HRA (floored at ₹0, never editable)
 * - Employee PF / P.Tax / Bonus / Mediclaim / LIC — editable placeholders (pending separate sign-off)
 * - Employee ESIC = Basic × emp% if Gross ≤ configurable ceiling (else 0)
 * - TAKE HOME = Gross − Emp PF − P.Tax − Emp ESIC
 *
 * PART B:
 * - Employer PF — manual placeholder
 * - Employer ESIC = Basic × er% if Gross ≤ same ceiling (else 0)
 * - Gratuity — Auto: Basic × 4.81% (Govt.) · Custom: manual
 * - Leave Encashment / Bonus / Mediclaim / LIC — placeholders
 * - Special Performance bonus (variable-annually) — optional checkbox + amount
 *
 * CTC (Monthly) = Gross + Total (B) · CTC (Annual) = CTC Monthly × 12
 *
 * Monthly Salary Processing reads saved Basic / HRA / Special / ESIC from the CTC
 * record (does not re-derive Part A). Earnings prorate by attendance; ESIC
 * eligibility still checks the full monthly Gross on the CTC record.
 */

import {
  dbFetchSalaryStructureMap,
  dbGetRevisionCount,
  dbGetSalaryRevisions,
  dbGetSalaryStructure,
  dbReviseSalaryStructure,
  dbSaveSalaryStructure,
} from "./salaryDb";

/** @deprecated Legacy browser key — kept only for one-time migration into admin_salary. */
const STORAGE_KEY = "admin_salary_ctc_ui_v1";

export const PF_WAGE_CAP = 15000;
export const EMP_PF_RATE = 0.12;
export const ER_PF_RATE = 0.13;

/** Office-level Basic floor (Auto mode). */
export const BASIC_SLAB_MIN = 15000;
/** Auto Basic share of Gross. */
export const BASIC_GROSS_PERCENT = 50;

/** Default ESIC eligibility ceiling on monthly Gross (configurable per CTC). */
export const DEFAULT_ESIC_CEILING = 41999;
/** @deprecated Prefer DEFAULT_ESIC_CEILING — same value family for older imports. */
export const EMP_ESIC_GROSS_THRESHOLD = DEFAULT_ESIC_CEILING;
/** @deprecated Single ceiling now applies to both parties. */
export const ER_ESIC_GROSS_THRESHOLD = DEFAULT_ESIC_CEILING;
/** @deprecated Use DEFAULT_ESIC_CEILING. */
export const ESIC_GROSS_THRESHOLD = DEFAULT_ESIC_CEILING;

export const DEFAULT_EMP_ESIC_RATE_PCT = 0.75;
export const DEFAULT_ER_ESIC_RATE_PCT = 3.25;
/** Decimal forms kept for older imports. */
export const EMP_ESIC_RATE = DEFAULT_EMP_ESIC_RATE_PCT / 100;
export const ER_ESIC_RATE = DEFAULT_ER_ESIC_RATE_PCT / 100;

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

/** Component entry modes. */
export const MODE_AUTO = "auto";
export const MODE_CUSTOM = "custom";

/** HRA entry modes (aliases for saved drafts). */
export const HRA_MODE_PERCENT = "percent_40";
export const HRA_MODE_CUSTOM = "custom";
export const HRA_PERCENT = 40;

/** Employee level — UX default for Basic mode only. */
export const EMP_LEVEL_OFFICE = "office";
export const EMP_LEVEL_HELPER = "helper";

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

/** Parse a percentage / decimal setting (null if empty/invalid). */
export function parseRateInput(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return n;
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

function readLegacyStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * One-time: copy localStorage CTC drafts into admin_salary when DB has no row yet.
 * Safe to call repeatedly; skips employees that already have a declared structure.
 */
export async function migrateLegacySalaryStructuresToDb() {
  const store = readLegacyStore();
  const ids = Object.keys(store);
  if (ids.length === 0) return { migrated: 0 };

  let migrated = 0;
  for (const id of ids) {
    const row = store[id];
    if (!row?.declared) continue;
    try {
      const existing = await dbGetSalaryStructure(id, { withRevisions: false });
      if (existing?.declared) continue;
      await dbSaveSalaryStructure(id, { ...row, declared: true });
      migrated += 1;
    } catch (err) {
      console.warn("Salary Admin: legacy CTC migrate skipped for", id, err);
    }
  }
  return { migrated };
}

export async function fetchSalaryStructureMap() {
  try {
    await migrateLegacySalaryStructuresToDb();
  } catch (err) {
    console.warn("Salary Admin: legacy migrate failed", err);
  }
  try {
    return await dbFetchSalaryStructureMap();
  } catch (err) {
    console.warn("Salary Admin: DB map failed, using legacy store", err);
    const store = readLegacyStore();
    const map = new Map();
    for (const [id, row] of Object.entries(store)) {
      if (row && typeof row === "object") map.set(String(id), row);
    }
    return map;
  }
}

export async function getSalaryStructure(employeeMasterId) {
  if (employeeMasterId == null) return null;
  try {
    const row = await dbGetSalaryStructure(employeeMasterId, { withRevisions: true });
    if (row) return row;
  } catch (err) {
    console.warn("Salary Admin: DB get structure failed, trying legacy", err);
  }
  const legacy = readLegacyStore()[String(employeeMasterId)];
  return legacy && typeof legacy === "object" ? legacy : null;
}

/**
 * First-time CTC save. Does not create a revision entry.
 * If a structure already exists, prefer reviseSalaryStructure.
 */
export async function saveSalaryStructure(employeeMasterId, payload) {
  return dbSaveSalaryStructure(employeeMasterId, { ...payload, declared: true });
}

/**
 * Revise an existing CTC: archives the current structure, then saves the new one.
 * @param {string|number} employeeMasterId
 * @param {object} payload — new CTC fields
 * @param {{ reason?: string, wef_date?: string }} [meta]
 */
export async function reviseSalaryStructure(employeeMasterId, payload, meta = {}) {
  return dbReviseSalaryStructure(employeeMasterId, { ...payload, declared: true }, meta);
}

/** Revision history newest-first (archived versions only). */
export async function getSalaryRevisions(employeeMasterId) {
  try {
    return await dbGetSalaryRevisions(employeeMasterId);
  } catch (err) {
    console.warn("Salary Admin: DB revisions failed", err);
    const legacy = readLegacyStore()[String(employeeMasterId)];
    return Array.isArray(legacy?.revisions) ? legacy.revisions : [];
  }
}

export async function getRevisionCount(employeeMasterId) {
  try {
    return await dbGetRevisionCount(employeeMasterId);
  } catch {
    const legacy = readLegacyStore()[String(employeeMasterId)];
    if (!legacy) return 0;
    return Number(legacy.revision_count) || (Array.isArray(legacy.revisions) ? legacy.revisions.length : 0);
  }
}

/** @deprecated Legacy fixed HRA monthly. Prefer hraFromBasic / resolveHraMonthly. */
export function hraFixedMonthly() {
  return round0(HRA_FIXED.a + HRA_FIXED.b + HRA_FIXED.c - HRA_FIXED.d);
}

/** Normalize Basic / HRA mode to auto | custom. */
export function normalizeComponentMode(mode) {
  if (mode === MODE_CUSTOM || mode === HRA_MODE_CUSTOM) return MODE_CUSTOM;
  if (mode === HRA_MODE_PERCENT || mode === MODE_AUTO) return MODE_AUTO;
  return MODE_AUTO;
}

/** Normalize saved / UI HRA mode (keeps percent_40 alias for drafts). */
export function normalizeHraMode(mode) {
  return normalizeComponentMode(mode) === MODE_CUSTOM
    ? HRA_MODE_CUSTOM
    : HRA_MODE_PERCENT;
}

export function normalizeEmployeeLevel(level) {
  return level === EMP_LEVEL_HELPER ? EMP_LEVEL_HELPER : EMP_LEVEL_OFFICE;
}

/** Default Basic mode for an employee level (UX default only). */
export function defaultBasicModeForLevel(level) {
  return normalizeEmployeeLevel(level) === EMP_LEVEL_HELPER
    ? MODE_CUSTOM
    : MODE_AUTO;
}

/** Basic (Auto) = MAX(50% of Gross, ₹15,000). */
export function basicFromGross(grossMonthly) {
  const gross = round0(grossMonthly);
  if (gross <= 0) return 0;
  return round0(Math.max((gross * BASIC_GROSS_PERCENT) / 100, BASIC_SLAB_MIN));
}

/** HRA = 40% of Basic (whole rupees). */
export function hraFromBasic(basicMonthly) {
  const basic = round0(basicMonthly);
  if (basic <= 0) return 0;
  return round0((basic * HRA_PERCENT) / 100);
}

/**
 * Resolve Basic monthly from mode.
 * @param {{ basicMode?: string, grossMonthly?: number, basicMonthly?: number|null }} opts
 */
export function resolveBasicMonthly({
  basicMode = MODE_AUTO,
  grossMonthly = 0,
  basicMonthly = null,
} = {}) {
  if (normalizeComponentMode(basicMode) === MODE_CUSTOM) {
    if (basicMonthly == null || basicMonthly === "") return 0;
    return round0(basicMonthly);
  }
  return basicFromGross(grossMonthly);
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
  if (normalizeComponentMode(hraMode) === MODE_CUSTOM) {
    if (hraMonthly == null || hraMonthly === "") return 0;
    return round0(hraMonthly);
  }
  return hraFromBasic(basicMonthly);
}

/** Special Allowance = Gross − Basic − HRA (floored at 0). */
export function specialFromParts(grossMonthly, basicMonthly, hraMonthly) {
  const raw = round0(grossMonthly) - round0(basicMonthly) - round0(hraMonthly);
  return {
    special: Math.max(0, raw),
    raw,
    exceedsGross: raw < 0,
  };
}

export function suggestedEmpPf(basicMonthly) {
  const pfBase = Math.min(round0(basicMonthly), PF_WAGE_CAP);
  return round0((pfBase * 12) / 100);
}

export function suggestedErPf(basicMonthly) {
  const pfBase = Math.min(round0(basicMonthly), PF_WAGE_CAP);
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
  return round0((basic * 7) / (LEAVE_ENCASH_DAYS * 12));
}

/** Auto Gratuity monthly = Basic × 4.81% (Govt. rules accrual). */
export function gratuityFromBasic(basicMonthly) {
  const basic = round0(basicMonthly);
  if (basic <= 0) return 0;
  return round0((basic * 481) / 10000);
}

/**
 * Resolve Gratuity monthly from mode.
 * Auto: Govt. formula from Basic · Custom: manual amount.
 */
export function resolveGratuityMonthly({
  gratuityMode = MODE_AUTO,
  basicMonthly = 0,
  gratuityMonthly = null,
} = {}) {
  if (normalizeComponentMode(gratuityMode) === MODE_CUSTOM) {
    if (gratuityMonthly == null || gratuityMonthly === "") return 0;
    return round0(gratuityMonthly);
  }
  return gratuityFromBasic(basicMonthly);
}

/**
 * Resolve Leave Encashment monthly from mode.
 * Auto: company policy formula from Basic · Custom: manual amount.
 */
export function resolveLeaveEncashMonthly({
  leaveEncashMode = MODE_AUTO,
  basicMonthly = 0,
  leaveEncashMonthly = null,
} = {}) {
  if (normalizeComponentMode(leaveEncashMode) === MODE_CUSTOM) {
    if (leaveEncashMonthly == null || leaveEncashMonthly === "") return 0;
    return round0(leaveEncashMonthly);
  }
  return leaveEncashFromBasic(basicMonthly);
}

/**
 * Resolve ESIC settings from args / saved structure (configurable, not hardcoded).
 */
export function resolveEsicSettings({
  esicEnabled = true,
  esicCeiling = null,
  esicEmpRatePct = null,
  esicErRatePct = null,
} = {}) {
  const ceiling =
    esicCeiling != null && esicCeiling !== ""
      ? round0(esicCeiling)
      : DEFAULT_ESIC_CEILING;
  const empPct =
    esicEmpRatePct != null && esicEmpRatePct !== ""
      ? Number(esicEmpRatePct)
      : DEFAULT_EMP_ESIC_RATE_PCT;
  const erPct =
    esicErRatePct != null && esicErRatePct !== ""
      ? Number(esicErRatePct)
      : DEFAULT_ER_ESIC_RATE_PCT;
  return {
    esic_enabled: Boolean(esicEnabled),
    esic_ceiling: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : DEFAULT_ESIC_CEILING,
    esic_emp_rate_pct: Number.isFinite(empPct) && empPct > 0 ? empPct : DEFAULT_EMP_ESIC_RATE_PCT,
    esic_er_rate_pct: Number.isFinite(erPct) && erPct > 0 ? erPct : DEFAULT_ER_ESIC_RATE_PCT,
  };
}

/**
 * ESIC on Basic when Gross is within the ceiling (BRD + prototype).
 * Eligibility uses full monthly Gross — never attendance-prorated Gross.
 * Auto mode uses the formula; Custom mode uses the manual amount (may be set even when not eligible).
 */
export function computeEsicOnBasic({
  grossMonthly = 0,
  basicMonthly = 0,
  esicEnabled = true,
  esicCeiling = DEFAULT_ESIC_CEILING,
  esicEmpRatePct = DEFAULT_EMP_ESIC_RATE_PCT,
  esicErRatePct = DEFAULT_ER_ESIC_RATE_PCT,
  empEsicMode = MODE_AUTO,
  erEsicMode = MODE_AUTO,
  empEsicMonthly = null,
  erEsicMonthly = null,
} = {}) {
  const settings = resolveEsicSettings({
    esicEnabled,
    esicCeiling,
    esicEmpRatePct,
    esicErRatePct,
  });
  const gross = round0(grossMonthly);
  const basic = round0(basicMonthly);
  const eligible =
    settings.esic_enabled && gross > 0 && gross <= settings.esic_ceiling;
  const autoEmp = eligible
    ? round0((basic * settings.esic_emp_rate_pct) / 100)
    : 0;
  const autoEr = eligible
    ? round0((basic * settings.esic_er_rate_pct) / 100)
    : 0;

  const empMode = normalizeComponentMode(empEsicMode);
  const erMode = normalizeComponentMode(erEsicMode);
  const empEsic =
    empMode === MODE_CUSTOM
      ? empEsicMonthly != null && empEsicMonthly !== ""
        ? round0(empEsicMonthly)
        : 0
      : autoEmp;
  const erEsic =
    erMode === MODE_CUSTOM
      ? erEsicMonthly != null && erEsicMonthly !== ""
        ? round0(erEsicMonthly)
        : 0
      : autoEr;

  return {
    ...settings,
    esic_eligible: eligible,
    emp_esic_mode: empMode,
    er_esic_mode: erMode,
    emp_esic_monthly: empEsic,
    er_esic_monthly: erEsic,
    emp_esic_auto_monthly: autoEmp,
    er_esic_auto_monthly: autoEr,
    // Applicable for display: auto uses eligibility; custom is applicable when amount > 0 or eligibility
    emp_esic_applicable: empMode === MODE_CUSTOM ? empEsic > 0 || eligible : eligible,
    er_esic_applicable: erMode === MODE_CUSTOM ? erEsic > 0 || eligible : eligible,
  };
}

/**
 * Compute Part A / Part B / CTC.
 * Gross is the master input when provided; legacy drafts without Gross
 * still work via Basic + HRA + Special.
 */
export function computeCtcStructure({
  grossMonthly = null,
  basicMonthly = 0,
  specialAllowanceMonthly = null,
  empPfMonthly = null,
  erPfMonthly = null,
  ptMonthly = null,
  bonusMonthly = null,
  mediclaimEnabled = false,
  mediclaimMonthly = null,
  licEnabled = false,
  licMonthly = null,
  basicMode = MODE_AUTO,
  hraMode = HRA_MODE_PERCENT,
  hraMonthly = null,
  employeeLevel = EMP_LEVEL_OFFICE,
  esicEnabled = true,
  esicCeiling = null,
  esicEmpRatePct = null,
  esicErRatePct = null,
  empEsicMode = MODE_AUTO,
  erEsicMode = MODE_AUTO,
  empEsicMonthly = null,
  erEsicMonthly = null,
  leaveEncashMode = MODE_AUTO,
  leaveEncashMonthly = null,
  gratuityMode = MODE_AUTO,
  gratuityMonthly = null,
  specialPerfBonusEnabled = false,
  specialPerfBonusMonthly = null,
} = {}) {
  const bMode = normalizeComponentMode(basicMode);
  const hMode = normalizeComponentMode(hraMode);
  const leaveMode = normalizeComponentMode(leaveEncashMode);
  const gratMode = normalizeComponentMode(gratuityMode);
  const level = normalizeEmployeeLevel(employeeLevel);

  const hasGrossInput =
    grossMonthly != null && grossMonthly !== "" && Number(grossMonthly) > 0;
  let gross = hasGrossInput ? round0(grossMonthly) : 0;

  const basic = resolveBasicMonthly({
    basicMode: bMode,
    grossMonthly: hasGrossInput ? gross : 0,
    basicMonthly,
  });

  const hra = resolveHraMonthly({
    hraMode: hMode,
    basicMonthly: basic,
    hraMonthly,
  });

  let special;
  let structureWarn = null;
  let structureInvalid = false;

  if (hasGrossInput) {
    const parts = specialFromParts(gross, basic, hra);
    special = parts.special;
    if (parts.exceedsGross) {
      structureInvalid = true;
      structureWarn =
        `Basic (${formatINR(basic)}) + HRA (${formatINR(hra)}) exceed Gross (${formatINR(gross)}). ` +
        `Special allowance is floored at ₹0 — raise Gross or lower Basic / HRA before saving.`;
    }
  } else {
    // Legacy path: Gross derived from components (pre–Gross-master drafts)
    special = round0(specialAllowanceMonthly ?? 0);
    gross = basic + hra + special;
  }

  if (gross <= 0 && basic <= 0 && special <= 0 && hra <= 0) {
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

  const esic = computeEsicOnBasic({
    grossMonthly: gross,
    basicMonthly: basic,
    esicEnabled,
    esicCeiling,
    esicEmpRatePct,
    esicErRatePct,
    empEsicMode,
    erEsicMode,
    empEsicMonthly,
    erEsicMonthly,
  });

  const pt =
    ptMonthly != null && ptMonthly !== ""
      ? round0(ptMonthly)
      : gross > PT_GROSS_MIN
        ? PT_AMOUNT
        : 0;

  const takeHome = gross - empPf - pt - esic.emp_esic_monthly;

  const gratuity = resolveGratuityMonthly({
    gratuityMode: gratMode,
    basicMonthly: basic,
    gratuityMonthly,
  });
  const leaveEncash = resolveLeaveEncashMonthly({
    leaveEncashMode: leaveMode,
    basicMonthly: basic,
    leaveEncashMonthly,
  });
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
  const specialPerfBonus =
    specialPerfBonusEnabled &&
    specialPerfBonusMonthly != null &&
    specialPerfBonusMonthly !== ""
      ? round0(specialPerfBonusMonthly)
      : 0;

  const totalB =
    erPf +
    esic.er_esic_monthly +
    gratuity +
    leaveEncash +
    mediclaim +
    lic +
    specialPerfBonus +
    bonus;
  const ctcMonthly = gross + totalB;
  const ctcAnnual = paFromMonthly(ctcMonthly);

  return {
    employee_level: level,
    basic_mode: bMode,
    basic_monthly: basic,
    hra_mode: hMode === MODE_CUSTOM ? HRA_MODE_CUSTOM : HRA_MODE_PERCENT,
    hra_monthly: hra,
    special_allowance_monthly: special,
    gross_monthly: gross,
    structure_warn: structureWarn,
    structure_invalid: structureInvalid,
    emp_pf_monthly: empPf,
    pt_monthly: pt,
    emp_esic_monthly: esic.emp_esic_monthly,
    emp_esic_mode: esic.emp_esic_mode,
    emp_esic_applicable: esic.emp_esic_applicable,
    esic_enabled: esic.esic_enabled,
    esic_ceiling: esic.esic_ceiling,
    esic_emp_rate_pct: esic.esic_emp_rate_pct,
    esic_er_rate_pct: esic.esic_er_rate_pct,
    esic_eligible: esic.esic_eligible,
    take_home_monthly: takeHome,
    er_pf_monthly: erPf,
    er_esic_monthly: esic.er_esic_monthly,
    er_esic_mode: esic.er_esic_mode,
    er_esic_applicable: esic.er_esic_applicable,
    gratuity_mode: gratMode,
    gratuity_monthly: gratuity,
    leave_encash_mode: leaveMode,
    leave_encash_monthly: leaveEncash,
    mediclaim_enabled: Boolean(mediclaimEnabled),
    mediclaim_monthly: mediclaimEnabled ? mediclaim : 0,
    lic_enabled: Boolean(licEnabled),
    lic_monthly: licEnabled ? lic : 0,
    special_perf_bonus_enabled: Boolean(specialPerfBonusEnabled),
    special_perf_bonus_monthly: specialPerfBonusEnabled ? specialPerfBonus : 0,
    bonus_monthly: bonus,
    total_b_monthly: totalB,
    ctc_monthly: ctcMonthly,
    ctc_annual: ctcAnnual,
    declared: true,
  };
}

export function emptyCtcStructure() {
  return {
    employee_level: EMP_LEVEL_OFFICE,
    basic_mode: MODE_AUTO,
    basic_monthly: null,
    hra_mode: HRA_MODE_PERCENT,
    hra_monthly: null,
    special_allowance_monthly: null,
    gross_monthly: null,
    structure_warn: null,
    structure_invalid: false,
    emp_pf_monthly: null,
    pt_monthly: null,
    emp_esic_monthly: null,
    emp_esic_mode: MODE_AUTO,
    emp_esic_applicable: false,
    esic_enabled: true,
    esic_ceiling: DEFAULT_ESIC_CEILING,
    esic_emp_rate_pct: DEFAULT_EMP_ESIC_RATE_PCT,
    esic_er_rate_pct: DEFAULT_ER_ESIC_RATE_PCT,
    esic_eligible: false,
    take_home_monthly: null,
    er_pf_monthly: null,
    er_esic_mode: MODE_AUTO,
    er_esic_monthly: null,
    er_esic_applicable: false,
    gratuity_mode: MODE_AUTO,
    gratuity_monthly: null,
    leave_encash_mode: MODE_AUTO,
    leave_encash_monthly: null,
    mediclaim_enabled: false,
    mediclaim_monthly: null,
    lic_enabled: false,
    lic_monthly: null,
    special_perf_bonus_enabled: false,
    special_perf_bonus_monthly: null,
    bonus_monthly: null,
    total_b_monthly: null,
    ctc_monthly: null,
    ctc_annual: null,
    declared: false,
  };
}

export function statutoryHelpText() {
  return (
    `Basic (Auto) = MAX(${BASIC_GROSS_PERCENT}% of Gross, ₹${BASIC_SLAB_MIN.toLocaleString("en-IN")})` +
    ` · HRA (Auto) = ${HRA_PERCENT}% of Basic` +
    ` · Special = Gross − Basic − HRA` +
    ` · ESIC on Basic when Gross ≤ ceiling`
  );
}

export const DEFAULT_MONTH_DAYS = 26;

function sheetProrate(amount, presentDays, totalDays = DEFAULT_MONTH_DAYS) {
  const base = round0(amount);
  const k = Number(presentDays);
  const td = Number(totalDays) || DEFAULT_MONTH_DAYS;
  if (!Number.isFinite(k) || td <= 0 || base === 0) return 0;
  return round0((base * k) / td);
}

export function defaultPtForGross(grossWages) {
  return Number(grossWages) > PT_GROSS_MIN ? PT_AMOUNT : 0;
}

/**
 * Monthly processing from saved CTC.
 * Part A amounts are read from the structure (not re-derived).
 * ESIC eligibility uses full monthly Gross on the CTC record.
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

  // ESIC: eligibility from saved full monthly Gross; contribution on prorated Basic
  // using rates / ceiling stored on the CTC record.
  const fullGross = salaryRateJ;
  const esic = computeEsicOnBasic({
    grossMonthly: fullGross,
    basicMonthly: basicEarnedO,
    esicEnabled: structure.esic_enabled !== false,
    esicCeiling: structure.esic_ceiling ?? DEFAULT_ESIC_CEILING,
    esicEmpRatePct: structure.esic_emp_rate_pct ?? DEFAULT_EMP_ESIC_RATE_PCT,
    esicErRatePct: structure.esic_er_rate_pct ?? DEFAULT_ER_ESIC_RATE_PCT,
    empEsicMode: structure.emp_esic_mode ?? MODE_AUTO,
    erEsicMode: structure.er_esic_mode ?? MODE_AUTO,
    empEsicMonthly: structure.emp_esic_monthly,
    erEsicMonthly: structure.er_esic_monthly,
  });
  const empEsicMode = normalizeComponentMode(structure.emp_esic_mode ?? MODE_AUTO);
  // Auto: already based on prorated Basic. Custom: prorate the saved monthly amount.
  const empEsicT =
    empEsicMode === MODE_CUSTOM
      ? sheetProrate(esic.emp_esic_monthly, K, TotalDays)
      : esic.emp_esic_monthly;

  const ptU =
    ptOverride != null && ptOverride !== ""
      ? round0(ptOverride)
      : structure.pt_monthly != null && structure.pt_monthly !== ""
        ? round0(structure.pt_monthly)
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
    `Prorate Basic / HRA / Special from saved CTC · PF = PF earned × 12% · ` +
    `ESIC eligibility from full monthly Gross on CTC · Net = Gross − deductions.`
  );
}

export function formatINRPlain(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return round0(value).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

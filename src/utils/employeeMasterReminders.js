/**
 * Birthday / wedding anniversary / work anniversary reminders for Admin Employee Master.
 * Uses date_of_birth, date_of_anniversary (wedding), and date_of_joining (work tenure).
 */

import { normalizeToIsoDate } from "./dateDisplay";

function parseMonthDay(dateStr) {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) return null;
  const parts = iso.split("-");
  if (parts.length !== 3) return null;
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { month, day };
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Anniversary date in a given year. A 29 Feb date falls back to 28 Feb in non-leap years. */
function occurrenceInYear(md, year) {
  return new Date(year, md.month, Math.min(md.day, daysInMonth(year, md.month)));
}

/** Parse an ISO/dd-mm-yyyy value as a local calendar date (avoids UTC day shifts). */
function localCalendarDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const iso = normalizeToIsoDate(value);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isSameMonthDay(dateStr, ref = new Date()) {
  const md = parseMonthDay(dateStr);
  if (!md) return false;
  const occurrence = occurrenceInYear(md, ref.getFullYear());
  return occurrence.getMonth() === ref.getMonth() && occurrence.getDate() === ref.getDate();
}

/** @param {Array<object>} employees */
function isActiveEmployee(e) {
  return String(e?.status || "").trim().toLowerCase() !== "inactive";
}

function birthdayReminderEnabled(e) {
  return e?.birthday_reminder !== false;
}

function weddingAnniversaryReminderEnabled(e) {
  return e?.anniversary_reminder !== false;
}

export function employeesWithBirthdayToday(employees, refDate = new Date()) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      birthdayReminderEnabled(e) &&
      e.date_of_birth &&
      isSameMonthDay(e.date_of_birth, refDate)
  );
}

/** Wedding anniversary (date_of_anniversary). */
export function employeesWithAnniversaryToday(employees, refDate = new Date()) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      weddingAnniversaryReminderEnabled(e) &&
      e.date_of_anniversary &&
      isSameMonthDay(e.date_of_anniversary, refDate)
  );
}

/** Work anniversary (date_of_joining). */
export function employeesWithWorkAnniversaryToday(employees, refDate = new Date()) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      e.date_of_joining &&
      isSameMonthDay(e.date_of_joining, refDate)
  );
}

/**
 * ISO date of the celebration as it falls inside [fromDate, toDate], or "" when outside.
 * @returns {string} YYYY-MM-DD
 */
export function celebrationOccurrenceIsoInRange(dateStr, fromDate, toDate) {
  const md = parseMonthDay(dateStr);
  if (!md) return "";
  const start = localCalendarDate(fromDate);
  const end = localCalendarDate(toDate);
  if (!start || !end) return "";
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  for (let y = start.getFullYear(); y <= end.getFullYear(); y += 1) {
    const d = occurrenceInYear(md, y);
    if (d >= start && d <= end) {
      return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return "";
}

function celebrationInRange(dateStr, fromDate, toDate) {
  return celebrationOccurrenceIsoInRange(dateStr, fromDate, toDate) !== "";
}

export function employeesWithBirthdayInRange(employees, fromDate, toDate) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      birthdayReminderEnabled(e) &&
      e.date_of_birth &&
      celebrationInRange(e.date_of_birth, fromDate, toDate)
  );
}

export function employeesWithAnniversaryInRange(employees, fromDate, toDate) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      weddingAnniversaryReminderEnabled(e) &&
      e.date_of_anniversary &&
      celebrationInRange(e.date_of_anniversary, fromDate, toDate)
  );
}

export function employeesWithWorkAnniversaryInRange(employees, fromDate, toDate) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      e.date_of_joining &&
      celebrationInRange(e.date_of_joining, fromDate, toDate)
  );
}

/**
 * Why an active employee can be absent from reminders: no date on record, or reminder muted.
 * Used to show data coverage next to the reminder lists.
 */
export function summarizeReminderCoverage(employees) {
  const active = (employees || []).filter(isActiveEmployee);
  const summary = {
    activeEmployees: active.length,
    missingBirthday: 0,
    missingAnniversary: 0,
    missingJoiningDate: 0,
    mutedBirthday: 0,
    mutedAnniversary: 0,
  };
  for (const e of active) {
    if (!parseMonthDay(e.date_of_birth)) summary.missingBirthday += 1;
    else if (!birthdayReminderEnabled(e)) summary.mutedBirthday += 1;

    if (!parseMonthDay(e.date_of_anniversary)) summary.missingAnniversary += 1;
    else if (!weddingAnniversaryReminderEnabled(e)) summary.mutedAnniversary += 1;

    if (!parseMonthDay(e.date_of_joining)) summary.missingJoiningDate += 1;
  }
  return summary;
}

export function computeWorkAnniversaryYears(dateOfJoining, refDate = new Date()) {
  const joinIso = normalizeToIsoDate(dateOfJoining);
  const refIso = normalizeToIsoDate(refDate) || normalizeToIsoDate(new Date());
  if (!joinIso || !refIso) return null;
  const [jy, jm, jd] = joinIso.split("-").map(Number);
  const [ry, rm, rd] = refIso.split("-").map(Number);
  let years = ry - jy;
  if (rm < jm || (rm === jm && rd < jd)) years -= 1;
  return Math.max(0, years);
}

/**
 * IFSPL experience (years) = tenure from Date_of_Joining to ref date.
 * @param {string|Date|null} dateOfJoining
 */
export function computeIfsplExperienceYears(dateOfJoining, refDate = new Date()) {
  if (!dateOfJoining) return null;
  const join = new Date(dateOfJoining);
  if (Number.isNaN(join.getTime())) return null;
  const end = refDate < join ? join : refDate;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const tenureYears = Math.max(0, (end - join) / msPerYear);
  return Math.round(tenureYears * 10) / 10;
}

/**
 * Total experience (years) = Previous_Experience + tenure from Date_of_Joining to ref date.
 * @param {string|Date|null} dateOfJoining
 * @param {number|null|undefined} previousExperienceYears
 */
export function computeTotalExperienceYears(dateOfJoining, previousExperienceYears, refDate = new Date()) {
  const prev = Number(previousExperienceYears);
  const prevSafe = Number.isFinite(prev) ? prev : 0;
  const ifsplExperience = computeIfsplExperienceYears(dateOfJoining, refDate);
  if (ifsplExperience == null) {
    return prevSafe > 0 ? Math.round(prevSafe * 10) / 10 : null;
  }
  const total = prevSafe + ifsplExperience;
  return Math.round(total * 10) / 10;
}

export const EMPLOYMENT_TYPES = {
  PERMANENT: 'permanent',
  CONSULTANT: 'consultant',
  VOUCHER: 'voucher',
  PROBATION: 'probation',
  CONTRACT: 'contract',
  PIP: 'pip',
  NOTICE_PERIOD: 'notice_period',
};

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: EMPLOYMENT_TYPES.PERMANENT, label: 'Permanent Employee' },
  { value: EMPLOYMENT_TYPES.CONSULTANT, label: 'Consultant' },
  { value: EMPLOYMENT_TYPES.VOUCHER, label: 'Voucher Employee' },
  { value: EMPLOYMENT_TYPES.PROBATION, label: 'Probation' },
  { value: EMPLOYMENT_TYPES.CONTRACT, label: 'Contract' },
  { value: EMPLOYMENT_TYPES.PIP, label: 'PIP (Performance Improvement Plan)' },
  { value: EMPLOYMENT_TYPES.NOTICE_PERIOD, label: 'Notice Period' },
];

const KNOWN_EMPLOYMENT_TYPES = new Set(Object.values(EMPLOYMENT_TYPES));

/** @param {string|null|undefined} value */
export function normalizeEmploymentType(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[()]/g, '');
  if (v === 'consultant' || v === 'c') return EMPLOYMENT_TYPES.CONSULTANT;
  if (v === 'voucher' || v === 'voucher_employee' || v === 'v') return EMPLOYMENT_TYPES.VOUCHER;
  if (v === 'probation' || v === 'probahtion') return EMPLOYMENT_TYPES.PROBATION;
  if (v === 'contract') return EMPLOYMENT_TYPES.CONTRACT;
  if (v === 'pip' || v === 'performance_improvement_plan') return EMPLOYMENT_TYPES.PIP;
  if (v === 'notice_period' || v === 'notice') return EMPLOYMENT_TYPES.NOTICE_PERIOD;
  if (v === 'permanent' || v === 'p') return EMPLOYMENT_TYPES.PERMANENT;
  if (KNOWN_EMPLOYMENT_TYPES.has(v)) return v;
  return EMPLOYMENT_TYPES.PERMANENT;
}

/** Infer type from existing employee_id (legacy prefixed ids remain supported). */
export function inferEmploymentTypeFromEmployeeId(employeeId) {
  const id = String(employeeId || '').trim();
  if (/^[Cc]-\d+$/i.test(id)) return EMPLOYMENT_TYPES.CONSULTANT;
  if (/^[Vv]-\d+$/i.test(id)) return EMPLOYMENT_TYPES.VOUCHER;
  return EMPLOYMENT_TYPES.PERMANENT;
}

function idsToScanFromRow(row) {
  const id = String(row?.employee_id || '').trim();
  return id ? [id] : [];
}

/** All system employee_id values already in use for this tenant list. */
export function collectUsedEmployeeIds(existingRows, { excludeDbId = null } = {}) {
  const used = new Set();
  for (const row of existingRows || []) {
    if (excludeDbId != null && row?.id === excludeDbId) continue;
    for (const id of idsToScanFromRow(row)) {
      used.add(id);
    }
  }
  return used;
}

/** Numeric value for permanent IDs (0001, 00001, 1, IFSPL-EMP-12 → 12). */
export function permanentNumericValue(employeeId) {
  const id = String(employeeId || '').trim();
  if (!id) return null;
  if (/^\d+$/.test(id)) {
    const n = parseInt(id, 10);
    return Number.isFinite(n) ? n : null;
  }
  const legacy = /^IFSPL-EMP-(\d+)$/i.exec(id);
  if (legacy) {
    const n = parseInt(legacy[1], 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function prefixedNumericValue(employeeId, letter) {
  const re = new RegExp(`^${letter}-(\\d+)$`, 'i');
  const m = re.exec(String(employeeId || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function isPermanentSeqTaken(seq, existingRows, excludeDbId = null) {
  for (const row of existingRows || []) {
    if (excludeDbId != null && row?.id === excludeDbId) continue;
    if (permanentNumericValue(row?.employee_id) === seq) return true;
  }
  return false;
}

/** @param {number|null} excludeDbId - master row `id` to ignore (current employee on edit). */
export function isEmployeeIdTaken(employeeId, existingRows, excludeDbId = null) {
  const id = String(employeeId || '').trim();
  if (!id) return false;
  if (collectUsedEmployeeIds(existingRows, { excludeDbId }).has(id)) return true;

  const perm = permanentNumericValue(id);
  const consultant = prefixedNumericValue(id, 'C');
  const voucher = prefixedNumericValue(id, 'V');

  for (const row of existingRows || []) {
    if (excludeDbId != null && row?.id === excludeDbId) continue;
    const other = row?.employee_id;
    if (perm != null && permanentNumericValue(other) === perm) return true;
    if (consultant != null && prefixedNumericValue(other, 'C') === consultant) return true;
    if (voucher != null && prefixedNumericValue(other, 'V') === voucher) return true;
  }
  return false;
}

export function collectUsedEmpCodes(existingRows, { excludeDbId = null } = {}) {
  const used = new Set();
  for (const row of existingRows || []) {
    if (excludeDbId != null && row?.id === excludeDbId) continue;
    const code = String(row?.employee_code ?? row?.emp_code ?? '').trim();
    if (code) used.add(code);
  }
  return used;
}

export function isEmpCodeTaken(empCode, existingRows, excludeDbId = null) {
  const code = String(empCode || '').trim();
  if (!code) return false;
  return collectUsedEmpCodes(existingRows, { excludeDbId }).has(code);
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateEmployeeIdentifiers(existingRows, { employee_id, employee_code, emp_code, excludeDbId = null }) {
  const sysId = String(employee_id || '').trim();
  const code = String(employee_code ?? emp_code ?? '').trim();

  if (sysId && isEmployeeIdTaken(sysId, existingRows, excludeDbId)) {
    return { ok: false, message: `System employee ID "${sysId}" is already assigned to another employee.` };
  }
  if (code && isEmpCodeTaken(code, existingRows, excludeDbId)) {
    return { ok: false, message: `Employee code "${code}" is already assigned to another employee.` };
  }
  return { ok: true };
}

function formatPermanentId(seq) {
  if (seq > 99999) throw new Error('Permanent employee ID limit (99999) reached.');
  return String(seq).padStart(5, '0');
}

function maxPermanentSeq(existingRows) {
  let max = 0;
  for (const row of existingRows || []) {
    for (const id of idsToScanFromRow(row)) {
      const n = permanentNumericValue(id);
      if (n != null) max = Math.max(max, n);
    }
  }
  return max;
}

/**
 * Next employee_id uses one continuous IFSPL system series for every employment type.
 * Consultants and voucher employees still keep their employment_type, but do not get
 * C-/V-prefixed employee IDs. employee_code remains the separate attendance/device code.
 */
export function nextEmployeeSystemId(existingRows, _employmentType, options = {}) {
  const { excludeDbId = null } = options;
  const used = collectUsedEmployeeIds(existingRows, { excludeDbId });
  let seq = maxPermanentSeq(existingRows) + 1;

  const maxAttempts = 100000;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = formatPermanentId(seq);
    const seqFree = !isPermanentSeqTaken(seq, existingRows, excludeDbId);
    if (!used.has(candidate) && seqFree) return candidate;
    seq += 1;
  }
  throw new Error('Could not allocate a unique employee ID. Please try again or contact support.');
}

/**
 * Prefer an existing preview id when still free; otherwise allocate the next free id.
 */
export function resolveEmployeeIdForSave(existingRows, employmentType, preferredId, excludeDbId = null) {
  const preferred = String(preferredId || '').trim();
  if (preferred && !isEmployeeIdTaken(preferred, existingRows, excludeDbId)) {
    return preferred;
  }
  return nextEmployeeSystemId(existingRows, employmentType, { excludeDbId });
}

/** @deprecated Use nextEmployeeSystemId(rows, 'permanent') */
export function nextIfsplEmployeeSystemId(existingRows) {
  return nextEmployeeSystemId(existingRows, EMPLOYMENT_TYPES.PERMANENT);
}

export function employmentTypeLabel(type) {
  const t = normalizeEmploymentType(type);
  return EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? 'Permanent Employee';
}

/**
 * When employment type changes on edit, keep the system employee_id. Employment type
 * no longer changes the ID series.
 */
export function resolveEmployeeIdOnTypeChange(_existingRows, editingEmployee, _newEmploymentType) {
  return { employee_id: editingEmployee?.employee_id || '' };
}

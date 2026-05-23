/**
 * Birthday / wedding anniversary reminders for Admin Employee Master.
 * Uses date_of_birth and date_of_anniversary (calendar month/day vs today).
 */

function parseMonthDay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return { month: d.getMonth(), day: d.getDate() };
}

function isSameMonthDay(dateStr, ref = new Date()) {
  const md = parseMonthDay(dateStr);
  if (!md) return false;
  return md.month === ref.getMonth() && md.day === ref.getDate();
}

/** @param {Array<object>} employees */
function isActiveEmployee(e) {
  return e.status !== 'Inactive';
}

export function employeesWithBirthdayToday(employees, refDate = new Date()) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      e.date_of_birth &&
      isSameMonthDay(e.date_of_birth, refDate)
  );
}

/** @param {Array<object>} employees */
export function employeesWithAnniversaryToday(employees, refDate = new Date()) {
  return (employees || []).filter(
    (e) =>
      isActiveEmployee(e) &&
      e.date_of_anniversary &&
      isSameMonthDay(e.date_of_anniversary, refDate)
  );
}

/**
 * Total experience (years) = Previous_Experience + tenure from Date_of_Joining to ref date.
 * @param {string|Date|null} dateOfJoining
 * @param {number|null|undefined} previousExperienceYears
 */
export function computeTotalExperienceYears(dateOfJoining, previousExperienceYears, refDate = new Date()) {
  const prev = Number(previousExperienceYears);
  const prevSafe = Number.isFinite(prev) ? prev : 0;
  if (!dateOfJoining) {
    return prevSafe > 0 ? Math.round(prevSafe * 10) / 10 : null;
  }
  const join = new Date(dateOfJoining);
  if (Number.isNaN(join.getTime())) return Math.round(prevSafe * 10) / 10;
  const end = refDate < join ? join : refDate;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const tenureYears = (end - join) / msPerYear;
  const total = prevSafe + Math.max(0, tenureYears);
  return Math.round(total * 10) / 10;
}

export const EMPLOYMENT_TYPES = {
  PERMANENT: 'permanent',
  CONSULTANT: 'consultant',
  VOUCHER: 'voucher',
};

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: EMPLOYMENT_TYPES.PERMANENT, label: 'Permanent Employee' },
  { value: EMPLOYMENT_TYPES.CONSULTANT, label: 'Consultant' },
  { value: EMPLOYMENT_TYPES.VOUCHER, label: 'Voucher Employee' },
];

/** @param {string|null|undefined} value */
export function normalizeEmploymentType(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (v === 'consultant' || v === 'c') return EMPLOYMENT_TYPES.CONSULTANT;
  if (v === 'voucher' || v === 'voucher_employee' || v === 'v') return EMPLOYMENT_TYPES.VOUCHER;
  return EMPLOYMENT_TYPES.PERMANENT;
}

/** Infer type from existing employee_id (legacy IFSPL-EMP-* counts as permanent). */
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

function isPrefixedSeqTaken(letter, seq, existingRows, excludeDbId = null) {
  for (const row of existingRows || []) {
    if (excludeDbId != null && row?.id === excludeDbId) continue;
    if (prefixedNumericValue(row?.employee_id, letter) === seq) return true;
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
    const code = String(row?.emp_code || '').trim();
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
export function validateEmployeeIdentifiers(existingRows, { employee_id, emp_code, excludeDbId = null }) {
  const sysId = String(employee_id || '').trim();
  const code = String(emp_code || '').trim();

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

function formatPrefixedId(letter, seq) {
  if (seq > 999999) throw new Error(`${letter} employee ID limit reached.`);
  return `${letter}-${String(seq).padStart(6, '0')}`;
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

function maxPrefixedSeq(existingRows, letter) {
  const re = new RegExp(`^${letter}-(\\d+)$`, 'i');
  let max = 0;
  for (const row of existingRows || []) {
    for (const id of idsToScanFromRow(row)) {
      const m = re.exec(id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return max;
}

/**
 * Next employee_id for the given employment type (per tenant row list).
 * Skips any ID already used (gaps, legacy imports, cross-type collisions).
 */
export function nextEmployeeSystemId(existingRows, employmentType, options = {}) {
  const { excludeDbId = null } = options;
  const used = collectUsedEmployeeIds(existingRows, { excludeDbId });
  const type = normalizeEmploymentType(employmentType);

  let seq;
  let formatId;
  if (type === EMPLOYMENT_TYPES.CONSULTANT) {
    seq = maxPrefixedSeq(existingRows, 'C') + 1;
    formatId = (n) => formatPrefixedId('C', n);
  } else if (type === EMPLOYMENT_TYPES.VOUCHER) {
    seq = maxPrefixedSeq(existingRows, 'V') + 1;
    formatId = (n) => formatPrefixedId('V', n);
  } else {
    seq = maxPermanentSeq(existingRows) + 1;
    formatId = formatPermanentId;
  }

  const maxAttempts = 100000;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = formatId(seq);
    const seqFree =
      type === EMPLOYMENT_TYPES.CONSULTANT
        ? !isPrefixedSeqTaken('C', seq, existingRows, excludeDbId)
        : type === EMPLOYMENT_TYPES.VOUCHER
          ? !isPrefixedSeqTaken('V', seq, existingRows, excludeDbId)
          : !isPermanentSeqTaken(seq, existingRows, excludeDbId);
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
 * When employment type changes on edit, assign a new system employee_id for the new type.
 */
export function resolveEmployeeIdOnTypeChange(existingRows, editingEmployee, newEmploymentType) {
  const prevType = editingEmployee?.employment_type
    ? normalizeEmploymentType(editingEmployee.employment_type)
    : inferEmploymentTypeFromEmployeeId(editingEmployee?.employee_id);
  const nextType = normalizeEmploymentType(newEmploymentType);
  if (prevType === nextType) {
    return { employee_id: editingEmployee?.employee_id || '' };
  }
  return {
    employee_id: nextEmployeeSystemId(existingRows, nextType, {
      excludeDbId: editingEmployee?.id ?? null,
    }),
  };
}

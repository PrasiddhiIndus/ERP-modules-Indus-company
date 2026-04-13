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

/**
 * Next IFSPL-EMP-###### style id for this user (max existing + 1).
 */
export function nextIfsplEmployeeSystemId(existingRows) {
  let max = 0;
  for (const row of existingRows || []) {
    const id = String(row?.employee_id || '').trim();
    const m = /^IFSPL-EMP-(\d+)$/i.exec(id);
    if (m) {
      max = Math.max(max, parseInt(m[1], 10));
      continue;
    }
    const digits = id.replace(/\D/g, '');
    if (digits.length >= 4) {
      const n = parseInt(digits.slice(-6), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
  }
  return `IFSPL-EMP-${String(max + 1).padStart(6, '0')}`;
}

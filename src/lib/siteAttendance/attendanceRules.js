import { parseDateOnlyLocal } from "./dateFormat";
import { assignmentOverlapsRange, getRange, personVisibleInRange } from "./salaryCycle";

export const GENERAL_CODES = ["", "P", "HD", "WO", "L", "NH-PH", "CO"];
export const ABCG_CODES = ["", "A", "B", "C", "G", "HD", "WO", "L", "CO"];

export function codesForShiftType(shiftType) {
  return shiftType === "ABCG" ? ABCG_CODES : GENERAL_CODES;
}

export function getDutyContribution(code) {
  const normalized = (code || "").trim().toUpperCase();
  if (normalized === "P" || normalized === "A" || normalized === "B" || normalized === "C" || normalized === "G") {
    return 1;
  }
  if (normalized === "HD") return 0.5;
  return 0;
}

/** Site duty-day length used when converting OT hours → duty units (8 or 12). */
export function getSiteDutyHours(site) {
  return Number(site?.duty_hours) === 12 ? 12 : 8;
}

/**
 * Convert OT into duty units for totals.
 * - regular_ot sites: any OT hours on a day count as 1 duty
 * - otherwise: hours / site duty_hours (8 or 12)
 */
export function getOtDutyContribution(otHours, site) {
  const hours = Number(otHours) || 0;
  if (hours <= 0) return 0;
  if (site?.regular_ot === true) return 1;
  return hours / getSiteDutyHours(site);
}

/** Attendance mark duty + OT duty for one record (designation-scoped row). */
export function getRecordDutyContribution(record, site) {
  if (!record) return 0;
  return getDutyContribution(record.att_code) + getOtDutyContribution(record.ot_hours, site);
}

export function roundDutyTotal(value) {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

export function normalizeNhPhDateList(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  const set = new Set();
  for (const entry of raw) {
    let s = "";
    if (typeof entry === "string") s = entry.split("T")[0];
    else if (entry && typeof entry === "object" && entry.date) s = String(entry.date).split("T")[0];
    if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) set.add(s);
  }
  return Array.from(set).sort();
}

export function isNhPhDay(site, dateString) {
  if (!site || !Array.isArray(site.nh_ph_dates)) return false;
  const key = String(dateString).split("T")[0];
  const list = normalizeNhPhDateList(site.nh_ph_dates);
  return list.includes(key);
}

export function getDateVisibility(dayDate, cycleYear) {
  const dayDateNormalized = new Date(dayDate);
  dayDateNormalized.setHours(0, 0, 0, 0);
  const jan1st = new Date(cycleYear, 0, 1);
  jan1st.setHours(0, 0, 0, 0);
  if (dayDateNormalized >= jan1st) {
    return { visible: true, editable: true };
  }
  return { visible: false, editable: false };
}

/** Last working day (inactive/leaving date). Days after this are closed on the grid. */
export function personInactiveDate(person) {
  if (!person?.leaving_date) return null;
  return parseDateOnlyLocal(person.leaving_date);
}

export function canMarkAttendance(employee, assignment, dayDate) {
  if (!employee) return false;
  if (employee.is_active === false && !personInactiveDate(employee)) return false;

  const joiningDate = parseDateOnlyLocal(employee.joining_date);
  if (joiningDate && dayDate < joiningDate) return false;

  const leavingDate = personInactiveDate(employee);
  if (leavingDate && dayDate > leavingDate) return false;

  if (assignment && assignment.to_date) {
    const assignmentEndDate = new Date(assignment.to_date);
    assignmentEndDate.setHours(0, 0, 0, 0);
    if (dayDate > assignmentEndDate) return false;
  }

  return true;
}

/**
 * Cell is closed (blank grey, non-editable): before joining or after inactive/leaving date.
 * Does not delete saved attendance — callers only hide/disable display.
 */
export function isInactiveCellClosed(employee, dayDate) {
  if (!employee) return true;
  const leave = personInactiveDate(employee);
  if (leave && dayDate > leave) return true;
  const join = parseDateOnlyLocal(employee.joining_date);
  if (join && dayDate < join) return true;
  return false;
}

export function isRowEditingRestricted(employee) {
  if (!employee) return true;
  if (employee.is_active === false && !personInactiveDate(employee)) return true;
  return false;
}

export function siteAssignmentOverlapsMonth(assignment, year, month) {
  const startDay = 1;
  const endDay = 31;
  const range = getRange(year, month, startDay, endDay);
  return assignmentOverlapsRange(assignment, range);
}

export function isOpenSiteAssignment(assignment) {
  return assignment && (assignment.to_date == null || assignment.to_date === "");
}

export function buildSiteRosterFromAssignments(assignmentsData, year, month, startDay = 1, endDay = 31) {
  const range = getRange(year, month, startDay, endDay);
  const byPerson = new Map();
  (assignmentsData || []).forEach((assignment) => {
    if (!assignmentOverlapsRange(assignment, range)) return;
    const personId = assignment.person_id;
    const existing = byPerson.get(personId);
    const open = isOpenSiteAssignment(assignment);
    if (!existing) {
      byPerson.set(personId, { personId, assignment, hasOpenAssignment: open });
      return;
    }
    if (open && !existing.hasOpenAssignment) {
      byPerson.set(personId, { personId, assignment, hasOpenAssignment: true });
    }
  });
  return Array.from(byPerson.values());
}

/**
 * Show on the month grid when the salary cycle overlaps employment.
 * Inactive without a leaving date never appears. With a leaving date, the person
 * appears in the leaving month (cells after that date are closed) and is hidden
 * from later months.
 */
export function personIsVisibleInAttendanceMonth(person, year, month, hasOpenAssignment = false, startDay = 1, endDay = 31) {
  const range = getRange(year, month, startDay, endDay);
  if (person?.is_active === false && !personInactiveDate(person)) return false;
  return personVisibleInRange(person, range);
}

export function applySandwichOnMap(attendanceMap, personId, changedDate, days, sandwichRule) {
  if (!sandwichRule) return { map: attendanceMap, updates: [] };
  const dayIndex = days.findIndex((d) => d.dateString === changedDate);
  if (dayIndex < 1 || dayIndex >= days.length - 1) return { map: attendanceMap, updates: [] };

  const updates = [];
  const key = (id, date) => `${id}_${date}`;
  const codeOf = (record) => (record ? record.att_code : "") || "";

  const convert = (dateStr) => {
    const k = key(personId, dateStr);
    const rec = attendanceMap[k];
    if (!rec) return;
    updates.push({ record: rec, att_code: "L" });
  };

  const prevDay = days[dayIndex - 1];
  const nextDay = days[dayIndex + 1];
  const prevCode = codeOf(attendanceMap[key(personId, prevDay.dateString)]);
  const currentCode = codeOf(attendanceMap[key(personId, changedDate)]);
  const nextCode = codeOf(attendanceMap[key(personId, nextDay.dateString)]);

  if (prevCode === "L" && currentCode === "NH-PH" && nextCode === "L") convert(changedDate);
  if (prevCode === "L" && currentCode === "WO" && nextCode === "L") convert(changedDate);

  if (currentCode === "L") {
    if (dayIndex >= 2) {
      const prevPrevDay = days[dayIndex - 2];
      const prevPrevCode = codeOf(attendanceMap[key(personId, prevPrevDay.dateString)]);
      if (prevPrevCode === "L" && prevCode === "NH-PH" && currentCode === "L") convert(prevDay.dateString);
      if (prevPrevCode === "L" && prevCode === "WO" && currentCode === "L") convert(prevDay.dateString);
    }
    if (dayIndex < days.length - 2) {
      const nextNextDay = days[dayIndex + 2];
      const nextNextCode = codeOf(attendanceMap[key(personId, nextNextDay.dateString)]);
      if (currentCode === "L" && nextCode === "NH-PH" && nextNextCode === "L") convert(nextDay.dateString);
      if (currentCode === "L" && nextCode === "WO" && nextNextCode === "L") convert(nextDay.dateString);
    }
  }

  const nextMap = { ...attendanceMap };
  updates.forEach((u) => {
    const k = key(personId, u.record.att_date);
    nextMap[k] = { ...u.record, att_code: "L" };
  });
  return { map: nextMap, updates };
}

export function computeEmployeeTotals(employee, visibleDays, getRecord, site) {
  const joiningDate = parseDateOnlyLocal(employee.joining_date);
  let totalPresent = 0;
  let totalLeave = 0;
  let totalWeekoff = 0;
  let appliedWeekoff = 0;
  let totalNH_PH = 0;
  let totalOT = 0;
  let weekoffTowardTotalPresent = 0;
  let totalCO = 0;

  visibleDays.forEach((dayInfo) => {
    const record = getRecord(employee.id, dayInfo.dateString, employee.grid_designation || employee.designation);
    const dayDate = new Date(dayInfo.date);
    dayDate.setHours(0, 0, 0, 0);
    if (isInactiveCellClosed(employee, dayDate)) return;
    if (joiningDate && dayDate < joiningDate) return;
    if (!record || !record.att_code) {
      if (record && record.ot_hours) {
        if (site && site.regular_ot) {
          if (record.ot_hours > 0) totalOT += 1;
        } else {
          totalOT += record.ot_hours || 0;
        }
      }
      return;
    }

    const code = record.att_code.trim().toUpperCase();
    const nh = isNhPhDay(site, dayInfo.dateString);

    if (nh && code) {
      let weightage = 0;
      if (code === "P" || code === "A" || code === "B" || code === "C" || code === "G") {
        weightage = site.nh_ph_present ?? 1;
      } else if (code === "HD") {
        weightage = (site.nh_ph_present ?? 1) * 0.5 + (site.nh_ph_leave ?? 1) * 0.5;
      } else if (code === "L") {
        weightage = site.nh_ph_leave ?? 1;
      } else if (code === "WO") {
        weightage = site.nh_ph_weekoff ?? 1;
      } else if (code === "CO") {
        weightage = site.nh_ph_present ?? 1;
      }
      totalNH_PH += weightage;
    }

    if (code === "P" || code === "A" || code === "B" || code === "C" || code === "G") {
      totalPresent++;
    } else if (code === "HD") {
      totalPresent += 0.5;
      totalLeave += 0.5;
    } else if (code === "L") {
      totalLeave++;
    } else if (code === "WO") {
      totalWeekoff++;
      appliedWeekoff++;
      if (site && site.weekoff_counts_as_present === true && !nh) {
        weekoffTowardTotalPresent++;
      }
    } else if (code === "CO") {
      totalCO++;
      totalPresent++;
    }

    if (record.ot_hours) {
      if (site && site.regular_ot) {
        if (record.ot_hours > 0) totalOT += 1;
      } else {
        totalOT += record.ot_hours || 0;
      }
    }
  });

  return {
    totalPresent: totalPresent + weekoffTowardTotalPresent,
    totalLeave,
    totalWeekoff,
    appliedWeekoff,
    totalNH_PH,
    totalOT,
    totalCO,
  };
}

export function categorizeAttendanceRecord(record, siteConfig) {
  const code = String(record?.att_code || "").trim().toUpperCase();
  if (["P", "A", "B", "C", "G"].includes(code)) return "present";
  if (code === "HD") return "half";
  if (code === "L") return "leave";
  if (code === "WO") return "weekoff";
  if (code === "NH-PH") return "holiday";
  if (code === "CO") return "coff";
  if (siteConfig) return "other";
  return "other";
}

export function emptyMetrics() {
  return { present: 0, half: 0, leave: 0, weekoff: 0, holiday: 0, coff: 0, other: 0, otHours: 0, duty: 0 };
}

export function addMetrics(target, source) {
  Object.keys(target).forEach((k) => {
    target[k] += source[k] || 0;
  });
  return target;
}

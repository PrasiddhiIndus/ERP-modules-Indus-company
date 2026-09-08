/**
 * Salary cycle helpers — cycle is identified by its ending month/year.
 * Example: ending June, 26th–25th => 26 May through 25 June.
 */
import { formatDateDisplay, formatDateLocal, parseDateOnlyLocal } from "./dateFormat";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clampDay(year, month, day) {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day || 1), lastDay);
}

function buildRangeObject(cycleYear, cycleMonth, startDay, endDay, startDate, endDate) {
  return {
    cycleYear,
    cycleMonth,
    startDay,
    endDay,
    startDate,
    endDate,
    startDateString: formatDateLocal(startDate),
    endDateString: formatDateLocal(endDate),
  };
}

export function isCalendarMonth(startDay, endDay) {
  return (startDay || 1) === 1 && (endDay || 31) >= 28;
}

export function getRange(cycleYear, cycleMonth, startDay, endDay) {
  const sDay = startDay || 1;
  const eDay = endDay || 31;

  if (sDay <= eDay) {
    const startDate = new Date(cycleYear, cycleMonth - 1, clampDay(cycleYear, cycleMonth, sDay));
    const endDate = new Date(cycleYear, cycleMonth - 1, clampDay(cycleYear, cycleMonth, eDay));
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    return buildRangeObject(cycleYear, cycleMonth, sDay, eDay, startDate, endDate);
  }

  let startMonth = cycleMonth - 1;
  let startYear = cycleYear;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }

  const startDate = new Date(startYear, startMonth - 1, clampDay(startYear, startMonth, sDay));
  const endDate = new Date(cycleYear, cycleMonth - 1, clampDay(cycleYear, cycleMonth, eDay));
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return buildRangeObject(cycleYear, cycleMonth, sDay, eDay, startDate, endDate);
}

export function formatRangeLabel(range) {
  if (!range) return "";
  return `${formatDateDisplay(range.startDateString)} – ${formatDateDisplay(range.endDateString)}`;
}

export function formatSalaryRangeLabel(range) {
  if (!range) return "";
  const start = range.startDateString?.split("-").reverse().join("/") || "";
  const end = range.endDateString?.split("-").reverse().join("/") || "";
  return `${start} – ${end}`;
}

export function generateDays(cycleYear, cycleMonth, startDay, endDay) {
  const range = getRange(cycleYear, cycleMonth, startDay, endDay);
  const days = [];
  const cursor = new Date(range.startDate);

  while (cursor <= range.endDate) {
    const date = new Date(cursor);
    days.push({
      day: date.getDate(),
      date,
      dateString: formatDateLocal(date),
      monthShort: MONTH_SHORT[date.getMonth()],
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return { range, days };
}

export function assignmentOverlapsRange(assignment, range) {
  if (!assignment || !range) return false;
  const firstDay = range.startDateString;
  const lastDay = range.endDateString;
  const fromStr = assignment.from_date ? String(assignment.from_date).split("T")[0] : null;
  const toStr = assignment.to_date ? String(assignment.to_date).split("T")[0] : null;
  if (fromStr && fromStr > lastDay) return false;
  if (toStr && toStr < firstDay) return false;
  return true;
}

export function personVisibleInRange(person, range, parseDateFn) {
  if (!person || !range) return false;
  const parse = typeof parseDateFn === "function" ? parseDateFn : parseDateOnlyLocal;

  const join = parse(person.joining_date);
  if (join && join > range.endDate) return false;

  if (person.leaving_date) {
    const leave = parse(person.leaving_date);
    if (leave && leave < range.startDate) return false;
    return true;
  }

  if (person.is_active === false) return false;
  return true;
}

function normalizeAttDate(attDate) {
  if (attDate == null || attDate === "") return null;
  return String(attDate).split("T")[0];
}

export function attendanceDateInRange(attDate, range) {
  if (!range || attDate == null || attDate === "") return false;
  const dateStr = normalizeAttDate(attDate);
  if (!dateStr) return false;
  return dateStr >= range.startDateString && dateStr <= range.endDateString;
}

export function getAttendanceFilterParts(siteId, range) {
  if (siteId == null || !range) {
    throw new Error("getAttendanceFilter requires siteId and range");
  }
  return {
    siteId,
    month: range.cycleMonth,
    year: range.cycleYear,
    from: range.startDateString,
    to: range.endDateString,
  };
}

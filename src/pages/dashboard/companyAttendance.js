import { supabase as defaultSupabase } from "../../lib/supabase";
import {
  ATTENDANCE_PUNCH_TABLE,
  ATTENDANCE_REGISTER_TABLE,
  EMPLOYEE_MASTER_TABLE,
  comparePunchInStatus,
  isInHouseMasterEmployee,
  isRegisterLeaveMark,
  isoDateToday,
  mapMasterEmployee,
  normalizeAttendanceEmpCode,
  normalizeDbDate,
} from "../../lib/attendanceDaily";
import { attendanceTimesFor, ensureAttendanceRulesLoaded, isWeeklyOffDay } from "../../lib/attendanceRules";

const TARGET_PCT = 92;
const PAGE = 1000;
const MAX_PAGES = 40;

function shiftIso(iso, days) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function datesEnding(today, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(shiftIso(today, -i));
  return out;
}

function isLeaveMark(mark) {
  const value = String(mark || "").trim();
  if (!value || value === "A" || value === "WO" || value === "NH/PH" || value === "Left") return false;
  if (value === "P" || value === "P(OD)" || value === "T" || value === "WFH") return false;
  if (value.startsWith("P/")) return false;
  return isRegisterLeaveMark(value) || value === "CO" || value === "L";
}

function isOffMark(mark) {
  const value = String(mark || "").trim();
  return value === "WO" || value === "NH/PH";
}

function emptyBuckets() {
  return { on: 0, late: 0, leave: 0, absent: 0 };
}

function finishBuckets(bucket) {
  const present = bucket.on + bucket.late;
  const expected = present + bucket.leave + bucket.absent;
  return {
    ...bucket,
    present,
    expected,
    pct: expected ? (present / expected) * 100 : 0,
  };
}

function addBuckets(left, right) {
  return finishBuckets({
    on: (left?.on || 0) + (right?.on || 0),
    late: (left?.late || 0) + (right?.late || 0),
    leave: (left?.leave || 0) + (right?.leave || 0),
    absent: (left?.absent || 0) + (right?.absent || 0),
  });
}

/** Site attendance codes. Shift A/B/C/G are present, not absent. */
function addSiteCode(bucket, att) {
  const code = String(att || "").trim().toUpperCase();
  if (!code || code === "WO" || code === "NH-PH" || code === "NH/PH") return;
  if (code === "L" || code === "CO" || code === "PL" || code === "CL" || code === "SL") {
    bucket.leave += 1;
    return;
  }
  if (code === "P" || code === "HD" || code === "A" || code === "B" || code === "C" || code === "G" || code.startsWith("P")) {
    bucket.on += 1;
    return;
  }
  bucket.absent += 1;
}

function dayBuckets(employees, date, firstPunch, leaveByKey, department) {
  const bucket = emptyBuckets();
  for (const employee of employees) {
    if (department && employee.department !== department) continue;
    if (isWeeklyOffDay(date, { employeeCode: employee.empCode, department: employee.department })) continue;
    const key = `${employee.empCode}|${date}`;
    const mark = leaveByKey.get(key) || "";
    if (isOffMark(mark)) continue;
    const punch = firstPunch.get(key);
    if (punch) {
      const shift = attendanceTimesFor({
        employeeCode: employee.empCode,
        department: employee.department,
        onDate: date,
      });
      const status = comparePunchInStatus(punch, shift.shiftStart, shift.graceMinutes || 0);
      if (status === "Late") bucket.late += 1;
      else bucket.on += 1;
      continue;
    }
    if (isLeaveMark(mark)) bucket.leave += 1;
    else bucket.absent += 1;
  }
  return finishBuckets(bucket);
}

function siteRowsByDate(siteRows, rosterCodes) {
  const byDate = new Map();
  for (const row of siteRows || []) {
    const date = normalizeDbDate(row.att_date || row.attDate);
    const code = normalizeAttendanceEmpCode(row.unique_code || row.uniqueCode || "");
    const att = String(row.att_code || row.attCode || "").trim();
    if (!date || !att) continue;
    if (code && rosterCodes.has(code)) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      code,
      att,
      department: String(row.department || "").trim() || "Sites",
    });
  }
  return byDate;
}

function countSite(rows, department) {
  const bucket = emptyBuckets();
  for (const row of rows || []) {
    if (department && row.department !== department) continue;
    addSiteCode(bucket, row.att);
  }
  return finishBuckets(bucket);
}

function countExtraPunches(date, firstPunch, rosterCodes, siteCodes) {
  const bucket = emptyBuckets();
  for (const [key, time] of firstPunch) {
    const split = key.indexOf("|");
    const code = key.slice(0, split);
    const punchDate = key.slice(split + 1);
    if (punchDate !== date || rosterCodes.has(code) || siteCodes.has(code)) continue;
    const shift = attendanceTimesFor({ employeeCode: code, onDate: date });
    const status = comparePunchInStatus(time, shift.shiftStart, shift.graceMinutes || 0);
    if (status === "Late") bucket.late += 1;
    else bucket.on += 1;
  }
  return finishBuckets(bucket);
}

export function summarizeCompanyAttendance({
  employees,
  punches,
  marks,
  siteRows = [],
  today = isoDateToday(),
  days = 30,
}) {
  const roster = (employees || [])
    .filter((employee) => employee?.empCode)
    .map((employee) => ({
      ...employee,
      empCode: normalizeAttendanceEmpCode(employee.empCode),
      department: String(employee.department || "").trim() || "Office",
    }));
  const rosterCodes = new Set(roster.map((employee) => employee.empCode));
  const firstPunch = new Map();
  for (const punch of punches || []) {
    const code = normalizeAttendanceEmpCode(punch.empCode || punch.employee_code);
    const date = normalizeDbDate(punch.punchDate || punch.punch_date);
    const time = String(punch.punchTime || punch.punch_time || "").slice(0, 5);
    if (!code || !date || !time) continue;
    const key = `${code}|${date}`;
    const current = firstPunch.get(key);
    if (!current || time < current) firstPunch.set(key, time);
  }
  const leaveByKey = new Map();
  for (const row of marks || []) {
    const code = normalizeAttendanceEmpCode(row.empCode || row.emp_code || row.employee_code);
    const date = normalizeDbDate(row.registerDate || row.register_date);
    const mark = String(row.mark || "").trim();
    if (!code || !date || !mark) continue;
    leaveByKey.set(`${code}|${date}`, mark);
  }
  const siteByDate = siteRowsByDate(siteRows, rosterCodes);

  const dayStats = (date, department) => {
    const office = dayBuckets(
      department ? roster.filter((employee) => employee.department === department) : roster,
      date,
      firstPunch,
      leaveByKey
    );
    const siteRowsForDay = siteByDate.get(date) || [];
    const site = countSite(siteRowsForDay, department);
    const siteCodes = new Set(siteRowsForDay.map((row) => row.code).filter(Boolean));
    const extra =
      department && department !== "Unassigned"
        ? emptyBuckets()
        : countExtraPunches(date, firstPunch, rosterCodes, siteCodes);
    const extraFinished = department && department !== "Unassigned" ? finishBuckets(emptyBuckets()) : extra;
    return addBuckets(addBuckets(office, site), extraFinished);
  };

  const dates = datesEnding(today, days);
  const company = dayStats(today);
  const names = new Set(roster.map((employee) => employee.department));
  for (const row of siteByDate.get(today) || []) names.add(row.department);
  if (company.expected > 0 && countExtraPunches(today, firstPunch, rosterCodes, new Set((siteByDate.get(today) || []).map((row) => row.code).filter(Boolean))).expected) {
    names.add("Unassigned");
  }
  const departments = [...names]
    .map((name) => ({ name, ...dayStats(today, name) }))
    .filter((row) => row.expected > 0)
    .sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name))
    .slice(0, 8);

  const trend = dates.map((iso) => {
    const stats = dayStats(iso);
    const date = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    return {
      iso,
      weekday: date.toLocaleDateString("en-IN", { weekday: "short" }),
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      full: date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }),
      pct: stats.pct,
      present: stats.present,
      expected: stats.expected,
    };
  });

  return { today, company, departments, trend, target: TARGET_PCT, roster: roster.length };
}

async function readPages(makeQuery, pageCap = MAX_PAGES) {
  const rows = [];
  for (let page = 0; page < pageCap; page += 1) {
    const from = page * PAGE;
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

function rosterFrom(people) {
  return (people || [])
    .map(mapMasterEmployee)
    .filter((employee) => employee.empCode && isInHouseMasterEmployee(employee));
}

async function readDay(client, table, select, dateCol, iso) {
  return readPages(
    () => client.from(table).select(select).eq(dateCol, iso),
    6
  );
}

/**
 * Paints today as soon as that day is in, then fills the trend.
 * Days are read a few at a time so login is not waiting on a full month.
 */
export async function loadCompanyAttendance(client = defaultSupabase, { onUpdate, days = 30 } = {}) {
  const today = isoDateToday();
  const span = Math.max(1, Math.min(30, days));
  const newestFirst = [...datesEnding(today, span)].reverse();
  const [people] = await Promise.all([
    readPages(
      () =>
        client
          .from(EMPLOYEE_MASTER_TABLE)
          .select("employee_code,employee_id,full_name,department,designation,status,date_of_leaving,employee_type")
          .eq("status", "Active")
          .order("employee_code", { ascending: true }),
      8
    ),
    ensureAttendanceRulesLoaded(client),
  ]);
  const employees = rosterFrom(people);
  const punches = [];
  const marks = [];
  const siteRows = [];
  let markSelect = "employee_code,register_date,mark";
  let siteSelect = "att_date,att_code,people:person_id(category_name,unique_code)";

  const readMarkDay = async (iso) => {
    try {
      return await readDay(client, ATTENDANCE_REGISTER_TABLE, markSelect, "register_date", iso);
    } catch (error) {
      const message = String(error?.message || "");
      if (markSelect.startsWith("employee_code") && /column|emp_code|schema cache/i.test(message)) {
        markSelect = "emp_code,register_date,mark";
        return readDay(client, ATTENDANCE_REGISTER_TABLE, markSelect, "register_date", iso);
      }
      return [];
    }
  };

  const readSiteDay = async (iso) => {
    try {
      const rows = await readDay(client, "attendance", siteSelect, "att_date", iso);
      return rows.map((row) => ({
        att_date: row.att_date,
        att_code: row.att_code,
        unique_code: row.people?.unique_code || "",
        department: row.people?.category_name || "",
      }));
    } catch (error) {
      const message = String(error?.message || "");
      if (siteSelect.includes("people") && /column|relationship|schema cache|could not find/i.test(message)) {
        siteSelect = "att_date,att_code";
        try {
          return await readDay(client, "attendance", siteSelect, "att_date", iso);
        } catch {
          return [];
        }
      }
      return [];
    }
  };

  let loaded = 0;
  let snapshot = null;
  for (let index = 0; index < newestFirst.length; index += 4) {
    const slice = newestFirst.slice(index, index + 4);
    const parts = await Promise.all(
      slice.map(async (iso) => {
        const [dayPunches, dayMarks, daySite] = await Promise.all([
          readDay(client, ATTENDANCE_PUNCH_TABLE, "employee_code,punch_date,punch_time", "punch_date", iso).catch(() => []),
          readMarkDay(iso),
          readSiteDay(iso),
        ]);
        return { dayPunches, dayMarks, daySite };
      })
    );
    for (const part of parts) {
      punches.push(...part.dayPunches);
      marks.push(...part.dayMarks);
      siteRows.push(...part.daySite);
    }
    loaded += slice.length;
    snapshot = summarizeCompanyAttendance({ employees, punches, marks, siteRows, today, days: loaded });
    onUpdate?.(snapshot);
  }

  return snapshot || summarizeCompanyAttendance({ employees, punches, marks, siteRows, today, days: span });
}


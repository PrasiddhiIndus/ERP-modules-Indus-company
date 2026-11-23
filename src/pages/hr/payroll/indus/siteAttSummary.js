/**
 * Attendance summary for Process salary — same Site Attendance data as the Attendance page.
 */
import {
  getSite,
  listAssignments,
  listAttendance,
  listPeopleByIds,
} from "../../../../lib/siteAttendance/siteAttendanceApi";
import {
  buildSiteRosterFromAssignments,
  computeEmployeeTotals,
  personIsVisibleInAttendanceMonth,
} from "../../../../lib/siteAttendance/attendanceRules";
import { formatSalaryRangeLabel, generateDays } from "../../../../lib/siteAttendance/salaryCycle";

function getRecordFromMap(map, personId, dateString, designation) {
  const desig = designation || "";
  const keyed = map[`${personId}_${dateString}_${desig}`];
  if (keyed) return keyed;
  return map[`${personId}_${dateString}`] || null;
}

/**
 * @param {{ siteId: number|string, month: number, year: number }} args
 */
export async function fetchSiteAttendanceSummary({ siteId, month, year }) {
  const id = Number(siteId);
  if (!id || !month || !year) {
    return { ok: false, error: "Select a site and month." };
  }

  const site = await getSite(id);
  if (!site) return { ok: false, error: "Site not found in Attendance." };

  const startDay = site.salary_cycle_start_day || 1;
  const endDay = site.salary_cycle_end_day || 31;
  const generated = generateDays(Number(year), Number(month), startDay, endDay);
  const range = generated.range;
  const days = generated.days;

  const assigns = await listAssignments({ siteId: id });
  const roster = buildSiteRosterFromAssignments(assigns, Number(year), Number(month), startDay, endDay);
  const people = await listPeopleByIds(roster.map((r) => r.personId));
  const peopleMap = Object.fromEntries(people.map((p) => [String(p.id), p]));

  const employees = [];
  roster.forEach(({ personId, hasOpenAssignment }) => {
    const person = peopleMap[String(personId)];
    if (!person) return;
    if (!personIsVisibleInAttendanceMonth(person, Number(year), Number(month), hasOpenAssignment, startDay, endDay)) {
      return;
    }
    employees.push(person);
  });
  employees.sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));

  const records = await listAttendance({
    siteId: id,
    month: Number(month),
    year: Number(year),
    from: range.startDateString,
    to: range.endDateString,
  });

  const map = {};
  records.forEach((r) => {
    const desig = r.designation || "";
    map[`${r.person_id}_${r.att_date}_${desig}`] = r;
    if (!desig) map[`${r.person_id}_${r.att_date}`] = r;
  });

  const locked = records.some((r) => r.is_locked);
  let markedPeople = 0;
  let sumPresent = 0;
  let sumLeave = 0;
  let sumWeekoff = 0;
  let sumNh = 0;
  let sumOt = 0;

  const rows = employees.map((emp) => {
    const totals = computeEmployeeTotals(
      emp,
      days,
      (personId, dateString, designation) => getRecordFromMap(map, personId, dateString, designation),
      site
    );
    const hasMarks =
      totals.totalPresent > 0 ||
      totals.totalLeave > 0 ||
      totals.totalWeekoff > 0 ||
      totals.totalNH_PH > 0 ||
      totals.totalOT > 0;
    if (hasMarks) markedPeople += 1;
    sumPresent += totals.totalPresent;
    sumLeave += totals.totalLeave;
    sumWeekoff += totals.totalWeekoff;
    sumNh += totals.totalNH_PH;
    sumOt += totals.totalOT;

    const otDays = site.regular_ot ? totals.totalOT : 0;
    const otHours = site.regular_ot ? 0 : totals.totalOT;

    return {
      code: String(emp.unique_code || ""),
      name: emp.full_name || "",
      personId: emp.id,
      PD: Math.round(totals.totalPresent * 100) / 100,
      OTD: Math.round(otDays * 100) / 100,
      OTH: Math.round(otHours * 100) / 100,
      NH: Math.round(totals.totalNH_PH * 100) / 100,
      WOT: 0,
      hasMarks,
    };
  });

  return {
    ok: true,
    siteId: id,
    siteName: site.site_name || "",
    month: Number(month),
    year: Number(year),
    rangeLabel: formatSalaryRangeLabel(range),
    dutyHours: site.duty_hours || 8,
    cycleStart: startDay,
    cycleEnd: endDay,
    locked,
    peopleCount: employees.length,
    markedPeople,
    recordCount: records.length,
    totals: {
      PD: Math.round(sumPresent * 100) / 100,
      leave: Math.round(sumLeave * 100) / 100,
      weekoff: Math.round(sumWeekoff * 100) / 100,
      NH: Math.round(sumNh * 100) / 100,
      OT: Math.round(sumOt * 100) / 100,
    },
    rows: rows.filter((r) => r.code),
  };
}

/**
 * Admin ops behaviour / attendance insights.
 * Pattern detection (trend, anomaly, habitual late) — not a hosted ML service.
 */

import { isLatePunchInRow, isOvertimeRow } from "../../lib/attendanceReports";
import { CHART_SERIES, UI_TOKENS } from "../../theme/tokens";

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function round0(n) {
  return Math.round(Number(n) || 0);
}

function mean(values) {
  const list = (values || []).filter((v) => Number.isFinite(v));
  if (!list.length) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function stdev(values) {
  const list = (values || []).filter((v) => Number.isFinite(v));
  if (list.length < 2) return 0;
  const m = mean(list);
  const varSum = list.reduce((a, v) => a + (v - m) ** 2, 0);
  return Math.sqrt(varSum / (list.length - 1));
}

/** Simple slope of y over index 0..n-1 (least squares). */
export function linearSlope(values) {
  const list = (values || []).filter((v) => Number.isFinite(v));
  const n = list.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += list[i];
    sumXY += i * list[i];
    sumXX += i * i;
  }
  const den = n * sumXX - sumX * sumX;
  if (!den) return 0;
  return (n * sumXY - sumX * sumY) / den;
}

function forecastNext(values) {
  const list = (values || []).filter((v) => Number.isFinite(v));
  if (!list.length) return 0;
  const slope = linearSlope(list);
  return Math.max(0, list[list.length - 1] + slope);
}

function dayLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/**
 * Aggregate punch-day rows into company behaviour metrics.
 * @param {Array} punchRows from buildDailyAttendanceReportRows
 * @param {{ department?: string }} [filters]
 */
export function buildAttendanceBehaviourInsights(punchRows = [], filters = {}) {
  let rows = [...(punchRows || [])];
  const dept = String(filters.department || "").trim();
  if (dept && dept !== "all" && dept !== "ALL") {
    rows = rows.filter((r) => String(r.department || "").trim() === dept);
  }

  const byDay = new Map();
  const byEmp = new Map();
  const byDept = new Map();

  for (const row of rows) {
    const date = String(row.punchDate || "").slice(0, 10);
    if (!date) continue;
    const late = isLatePunchInRow(row);
    const ot = isOvertimeRow(row);
    const minutes = Number(row.workedMinutes);
    const hasHours = Number.isFinite(minutes) && minutes > 0;

    if (!byDay.has(date)) {
      byDay.set(date, { date, present: 0, late: 0, ot: 0, minutesSum: 0, minutesCount: 0 });
    }
    const day = byDay.get(date);
    day.present += 1;
    if (late) day.late += 1;
    if (ot) day.ot += 1;
    if (hasHours) {
      day.minutesSum += minutes;
      day.minutesCount += 1;
    }

    const code = String(row.empCode || "").trim();
    if (code) {
      if (!byEmp.has(code)) {
        byEmp.set(code, {
          empCode: code,
          employeeName: row.employeeName || code,
          department: row.department || "—",
          days: 0,
          late: 0,
          ot: 0,
          minutesSum: 0,
          minutesCount: 0,
        });
      }
      const emp = byEmp.get(code);
      emp.days += 1;
      if (late) emp.late += 1;
      if (ot) emp.ot += 1;
      if (row.employeeName && !emp.employeeName) emp.employeeName = row.employeeName;
      if (row.department) emp.department = row.department;
      if (hasHours) {
        emp.minutesSum += minutes;
        emp.minutesCount += 1;
      }
    }

    const department = String(row.department || "Unassigned").trim() || "Unassigned";
    if (!byDept.has(department)) {
      byDept.set(department, { name: department, present: 0, late: 0, ot: 0 });
    }
    const drow = byDept.get(department);
    drow.present += 1;
    if (late) drow.late += 1;
    if (ot) drow.ot += 1;
  }

  const trend = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      key: d.date,
      name: dayLabel(d.date),
      fullName: d.date,
      present: d.present,
      late: d.late,
      ot: d.ot,
      lateRate: d.present ? round1((d.late / d.present) * 100) : 0,
      otRate: d.present ? round1((d.ot / d.present) * 100) : 0,
      avgHours: d.minutesCount ? round1(d.minutesSum / d.minutesCount / 60) : 0,
    }));

  const totalPresent = trend.reduce((a, d) => a + d.present, 0);
  const totalLate = trend.reduce((a, d) => a + d.late, 0);
  const totalOt = trend.reduce((a, d) => a + d.ot, 0);
  const hoursSamples = trend.filter((d) => d.avgHours > 0).map((d) => d.avgHours);
  const lateRates = trend.map((d) => d.lateRate);
  const otRates = trend.map((d) => d.otRate);

  const lateSlope = linearSlope(lateRates);
  const otSlope = linearSlope(otRates);
  const lateForecast = round1(forecastNext(lateRates));
  const lateMean = mean(lateRates);
  const lateSd = stdev(lateRates);

  const anomalyDays = trend
    .filter((d) => lateSd > 0 && Math.abs(d.lateRate - lateMean) >= 1.5 * lateSd && d.present >= 5)
    .map((d) => ({
      date: d.key,
      label: d.name,
      lateRate: d.lateRate,
      z: round1((d.lateRate - lateMean) / lateSd),
    }));

  const peopleStats = [...byEmp.values()]
    .map((e) => ({
      ...e,
      lateRate: e.days ? round1((e.late / e.days) * 100) : 0,
      otRate: e.days ? round1((e.ot / e.days) * 100) : 0,
      avgHours: e.minutesCount ? round1(e.minutesSum / e.minutesCount / 60) : 0,
    }))
    .sort((a, b) => String(a.employeeName || a.empCode || "").localeCompare(String(b.employeeName || b.empCode || "")));

  const habitualLateAll = peopleStats
    .filter((e) => e.days >= 3 && e.late / e.days >= 0.35)
    .slice()
    .sort((a, b) => b.lateRate - a.lateRate || b.late - a.late);

  const habitualLate = habitualLateAll.slice(0, 6);

  const otHeavyAll = peopleStats
    .filter((e) => e.days >= 3 && e.ot / e.days >= 0.25)
    .slice()
    .sort((a, b) => b.otRate - a.otRate || b.ot - a.ot);

  const otHeavy = otHeavyAll.slice(0, 6);

  const deptBarsAll = [...byDept.values()]
    .filter((d) => d.present > 0)
    .map((d) => ({
      name: d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name,
      fullName: d.name,
      lateRate: round1((d.late / d.present) * 100),
      otRate: round1((d.ot / d.present) * 100),
      present: d.present,
      late: d.late,
      ot: d.ot,
    }))
    .sort((a, b) => b.lateRate - a.lateRate);

  const deptBars = deptBarsAll.slice(0, 8);

  const notes = [];

  if (lateSlope > 0.35) {
    notes.push({
      id: "late-rising",
      kind: "late",
      severity: "warning",
      title: "More people are coming in late",
      body: `Late arrivals are climbing. About ${lateForecast}% of punch-ins may be late if this continues.`,
      path: "/app/admin/employee/late-punch-report",
    });
  } else if (lateSlope < -0.35) {
    notes.push({
      id: "late-improving",
      kind: "late",
      severity: "info",
      title: "Punctuality is improving",
      body: "Fewer late punch-ins in this period. Keep the same follow-up with teams.",
      path: "/app/admin/employee/attendance-daily",
    });
  }

  if (otSlope > 0.4 && mean(otRates) >= 12) {
    notes.push({
      id: "ot-fatigue",
      kind: "ot",
      severity: "critical",
      title: "Overtime is building up",
      body: "More long days (>9 hours). Check workload before it affects attendance quality.",
      path: "/app/admin/employee/attendance-daily",
    });
  }

  if (habitualLateAll.length) {
    notes.push({
      id: "habitual-late",
      kind: "late",
      severity: "warning",
      title: `${habitualLateAll.length} people often arrive late`,
      body: `${habitualLateAll[0].employeeName} is late on ${habitualLateAll[0].lateRate}% of their days in this range.`,
      path: "/app/admin/employee/late-punch-report",
    });
  }

  if (anomalyDays.length) {
    const top = anomalyDays.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
    notes.push({
      id: "anomaly-day",
      kind: "late",
      severity: top.z > 0 ? "critical" : "info",
      title: top.z > 0 ? `Unusual late day on ${top.label}` : `Quieter late day on ${top.label}`,
      body:
        top.z > 0
          ? `${top.lateRate}% of punch-ins were late — well above the period average.`
          : `${top.lateRate}% late — better than the period average.`,
      path: "/app/admin/employee/attendance-daily",
    });
  }

  if (!rows.length) {
    notes.push({
      id: "no-punches",
      kind: "attendance",
      severity: "info",
      title: "No attendance punches in this range",
      body: "Widen the dates or confirm biometric sync to see averages.",
      path: "/app/admin/employee/attendance-daily",
    });
  }

  const avgHours = hoursSamples.length ? round1(mean(hoursSamples)) : 0;

  return {
    totals: {
      punchDays: totalPresent,
      lateDays: totalLate,
      otDays: totalOt,
      lateRate: totalPresent ? round1((totalLate / totalPresent) * 100) : 0,
      otRate: totalPresent ? round1((totalOt / totalPresent) * 100) : 0,
      avgHours,
      lateForecast,
      lateSlope: round1(lateSlope),
      otSlope: round1(otSlope),
      employeesSeen: byEmp.size,
    },
    trend,
    deptBars,
    deptBarsAll,
    peopleStats,
    habitualLate,
    habitualLateAll,
    otHeavy,
    otHeavyAll,
    anomalyDays,
    notes,
    chartColors: {
      // Cool vs warm series so late % and long-day % stay visually distinct.
      present: CHART_SERIES[0],
      late: UI_TOKENS.info,
      ot: UI_TOKENS.accentViolet,
      hours: UI_TOKENS.teal,
      lateHot: UI_TOKENS.critical,
      lateWarm: UI_TOKENS.warning,
      lateOk: UI_TOKENS.info,
    },
  };
}

export function buildModuleCoverage({
  leavePending = 0,
  tourPending = 0,
  recruitment = null,
  leaveAlerts = 0,
  activeEmployees = 0,
  lateRate = 0,
}) {
  const hiringAttention =
    (recruitment?.pendingRequisitions || 0) +
    (recruitment?.offersPending || 0) +
    (recruitment?.documentsToReview || 0) +
    (recruitment?.interviewsToEvaluate || 0);

  return [
    {
      id: "workforce",
      kind: "people",
      label: "People",
      value: activeEmployees,
      hint: "Active employees",
      path: "/app/admin/employee/master",
      tone: "info",
    },
    {
      id: "attendance",
      kind: "late",
      label: "Coming late",
      value: `${lateRate}%`,
      hint: "Of punch-ins in range",
      path: "/app/admin/employee/late-punch-report",
      tone: lateRate >= 20 ? "critical" : lateRate >= 12 ? "warning" : "ok",
    },
    {
      id: "leave",
      kind: "approvals",
      label: "Leave waiting",
      value: leavePending,
      hint: "Need your decision",
      path: "/app/admin/employee/leaves-permissions",
      tone: leavePending > 0 ? "warning" : "ok",
    },
    {
      id: "tour",
      kind: "approvals",
      label: "Tour waiting",
      value: tourPending,
      hint: "Need your decision",
      path: "/app/admin/employee/tour-approvals",
      tone: tourPending > 0 ? "warning" : "ok",
    },
    {
      id: "policy",
      kind: "policy",
      label: "Policy flags",
      value: leaveAlerts,
      hint: "Leave / register limits",
      path: "/app/admin/alerts-notifications",
      tone: leaveAlerts > 0 ? "critical" : "ok",
    },
    {
      id: "hiring",
      kind: "hiring",
      label: "Hiring follow-ups",
      value: hiringAttention,
      hint: recruitment ? `${recruitment.openRequisitions || 0} open roles` : "Recruitment",
      path: "/app/admin/recruitment",
      tone: hiringAttention > 0 ? "warning" : "ok",
    },
  ];
}

export function severityChip(tone) {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  if (tone === "ok") return "neutral";
  return "info";
}

export { round0, round1 };

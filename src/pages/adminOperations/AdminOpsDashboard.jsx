import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { fetchLeaveStatusCounts, fetchLeaveRequests, subscribeLeaveWorkflowRealtime } from "../../lib/adminLeaveRequests";
import { fetchTourStatusCounts, fetchTourRequests, subscribeTourWorkflowRealtime } from "../../lib/adminTourRequests";
import { fetchRegisterMarksForYear, fetchActiveEmployees } from "../../lib/attendanceDaily";
import { buildLeaveLimitNotifications } from "../../lib/attendanceLeaveLimits";
import { buildDailyAttendanceReportRows } from "../../lib/attendanceReports";
import { isSupabaseRealtimeEnabled } from "../../lib/supabaseConfig";
import {
  employeesWithBirthdayToday,
  employeesWithAnniversaryToday,
  employeesWithWorkAnniversaryToday,
  computeWorkAnniversaryYears,
} from "../../utils/employeeMasterReminders";
import { BarCompareChart, ComposedTrendChart } from "../../components/charts/DashboardCharts";
import { TOKENS } from "../../theme/tokens";
import {
  PageTaskHeader,
  SectionCard,
  FilterBar,
  StatusChip,
  TinyInput,
  TinySelect,
  KpiTile,
} from "../../components/erpUi";
import { getDashboardSummary } from "./recruitment/recruitmentService";
import {
  buildAttendanceBehaviourInsights,
  buildModuleCoverage,
  severityChip,
} from "./adminOpsInsights";
import AdminOpsDetailModal from "./AdminOpsDetailModal";

const REALTIME_DEBOUNCE_MS = 450;
const EMPLOYEE_PAGE_SIZE = 1000;
const MAX_EMPLOYEE_PAGES = 20;

const ROUTES = {
  employeeMaster: "/app/admin/employee/master",
  leaveApprovals: "/app/admin/employee/leaves-permissions",
  tourApprovals: "/app/admin/employee/tour-approvals",
  latePunch: "/app/admin/employee/late-punch-report",
  attendanceDaily: "/app/admin/employee/attendance-daily",
  alerts: "/app/admin/alerts-notifications",
  recruitment: "/app/admin/recruitment",
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function severityRank(sev) {
  if (sev === "critical") return 0;
  if (sev === "warning") return 1;
  return 2;
}

function mapAlertSeverity(sev) {
  if (sev === "critical" || sev === "high") return "critical";
  if (sev === "warning") return "warning";
  return "info";
}

function leaveDisplayName(row) {
  return row?.employee?.full_name || row?.employee_code || "Employee";
}

function tourDisplayName(row) {
  return row?.employee?.full_name || row?.employee_name || row?.employee_code || "Employee";
}

function ageDays(iso) {
  if (!iso) return 0;
  const start = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  const today = new Date(`${todayIso()}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.round((today - start) / 86400000));
}

function filterActiveEmployees(rows) {
  return (rows || []).filter((e) => String(e?.status || "").trim().toLowerCase() !== "inactive");
}

async function fetchAllEmployees() {
  const rows = [];
  for (let page = 0; page < MAX_EMPLOYEE_PAGES; page += 1) {
    const from = page * EMPLOYEE_PAGE_SIZE;
    const { data, error } = await supabase
      .from("admin_ifsp_employee_master")
      .select(
        "id, full_name, employee_code, employee_id, date_of_birth, date_of_anniversary, date_of_joining, status, department, birthday_reminder, anniversary_reminder"
      )
      .order("id", { ascending: true })
      .range(from, from + EMPLOYEE_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < EMPLOYEE_PAGE_SIZE) break;
  }
  return rows;
}

function employeeDetailPath(id) {
  return `/app/admin/employee/master/${id}`;
}

function sevChip(row) {
  const label = row.severity === "critical" ? "Critical" : row.severity === "warning" ? "Needs attention" : "FYI";
  return (
    <StatusChip
      label={label}
      severity={row.severity === "critical" ? "critical" : row.severity === "warning" ? "warning" : "info"}
    />
  );
}

const PERSON_COLS = [
  {
    key: "person",
    label: "Person",
    render: (row) => (
      <div className="min-w-0">
        <p className="font-medium text-ink-strong truncate">{row.person || row.employeeName || row.name}</p>
        <p className="type-meta text-ink-muted truncate">{row.empCode || "—"}</p>
      </div>
    ),
  },
  { key: "department", label: "Department" },
];

export default function AdminOpsDashboard() {
  const navigate = useNavigate();

  const [fromDate, setFromDate] = useState(() => daysAgoIso(21));
  const [toDate, setToDate] = useState(todayIso);
  const [department, setDepartment] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [realtimeLive, setRealtimeLive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshDebounceRef = useRef(null);
  const initialLoadRef = useRef(true);

  const [leaveCounts, setLeaveCounts] = useState({ pending: 0 });
  const [tourCounts, setTourCounts] = useState({ pending: 0 });
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [pendingTours, setPendingTours] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveLimitAlerts, setLeaveLimitAlerts] = useState([]);
  const [punchRows, setPunchRows] = useState([]);
  const [recruitment, setRecruitment] = useState(null);
  const [detailSpec, setDetailSpec] = useState(null);

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    if (initialLoadRef.current) {
      setLoading(true);
      initialLoadRef.current = false;
    }
    try {
      const year = new Date().getFullYear();
      const from = fromDate || daysAgoIso(21);
      const to = toDate || todayIso();

      const [leaveStatus, tourStatus, leaves, tours, empRes, registerRows, activeEmps, punches, hiring] =
        await Promise.all([
          fetchLeaveStatusCounts().catch(() => ({ pending: 0 })),
          fetchTourStatusCounts().catch(() => ({ pending: 0 })),
          fetchLeaveRequests({ status: "pending", page: 1, pageSize: 200 }).catch(() => ({ rows: [] })),
          fetchTourRequests({ status: "pending", page: 1, pageSize: 200 }).catch(() => ({ rows: [] })),
          fetchAllEmployees()
            .then((data) => ({ data, error: null }))
            .catch((error) => ({ data: null, error })),
          fetchRegisterMarksForYear(supabase, year).catch(() => []),
          fetchActiveEmployees(supabase).catch(() => []),
          buildDailyAttendanceReportRows(supabase, { fromDate: from, toDate: to }).catch(() => []),
          getDashboardSummary().catch(() => null),
        ]);

      setLeaveCounts(leaveStatus);
      setTourCounts(tourStatus);
      setPendingLeaves(leaves.rows || []);
      setPendingTours(tours.rows || []);
      setPunchRows(punches || []);
      setRecruitment(hiring);

      const employeeNameByCode = {};
      for (const e of activeEmps || []) {
        if (e.empCode) employeeNameByCode[e.empCode] = e.employeeName || e.empCode;
      }
      setLeaveLimitAlerts(
        buildLeaveLimitNotifications({ registerRows: registerRows || [], employeeNameByCode, year })
      );

      if (empRes.error) {
        console.warn("[AdminOpsDashboard] employee master", empRes.error);
        setEmployees([]);
      } else {
        setEmployees(filterActiveEmployees(empRes.data || []));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate]);

  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => setRefreshKey((k) => k + 1), REALTIME_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const unsubs = [subscribeLeaveWorkflowRealtime(scheduleRefresh), subscribeTourWorkflowRealtime(scheduleRefresh)];
    let empChannel = null;
    if (isSupabaseRealtimeEnabled()) {
      setRealtimeLive(true);
      empChannel = supabase
        .channel("admin-dash-saas")
        .on("postgres_changes", { event: "*", schema: "public", table: "admin_ifsp_employee_master" }, scheduleRefresh)
        .subscribe();
    }
    return () => {
      unsubs.forEach((u) => u());
      if (empChannel) supabase.removeChannel(empChannel);
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, [scheduleRefresh]);

  const behaviour = useMemo(
    () => buildAttendanceBehaviourInsights(punchRows, { department }),
    [department, punchRows]
  );

  const departments = useMemo(() => {
    const set = new Set();
    for (const row of punchRows) {
      const d = String(row.department || "").trim();
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [punchRows]);

  const coverage = useMemo(
    () =>
      buildModuleCoverage({
        leavePending: leaveCounts.pending || 0,
        tourPending: tourCounts.pending || 0,
        recruitment,
        leaveAlerts: leaveLimitAlerts.length,
        activeEmployees: employees.length,
        lateRate: behaviour.totals.lateRate,
      }),
    [behaviour.totals.lateRate, employees.length, leaveCounts.pending, leaveLimitAlerts.length, recruitment, tourCounts.pending]
  );

  const actionItems = useMemo(() => {
    const today = todayIso();
    const items = [];

    for (const row of pendingLeaves) {
      const due = String(row.from_date || row.submitted_at || "").slice(0, 10) || today;
      const submitted = String(row.submitted_at || row.created_at || due).slice(0, 10);
      items.push({
        id: `leave-${row.id}`,
        type: "Leave",
        severity: due < today ? "critical" : "warning",
        person: leaveDisplayName(row),
        empCode: row.employee_code || "",
        department: row.employee?.department || row.department || "—",
        detail: `${row.leave_type_code || "Leave"} · ${row.days ?? "—"} day(s)`,
        due,
        age: ageDays(submitted),
        path: ROUTES.leaveApprovals,
      });
    }

    for (const row of pendingTours) {
      const due = String(row.from_date || row.start_date || row.submitted_at || "").slice(0, 10) || today;
      const submitted = String(row.submitted_at || row.created_at || due).slice(0, 10);
      items.push({
        id: `tour-${row.id}`,
        type: "Tour",
        severity: due < today ? "critical" : "warning",
        person: tourDisplayName(row),
        empCode: row.employee_code || "",
        department: row.employee?.department || row.department || "—",
        detail: row.purpose || row.destination || "Tour request",
        due,
        age: ageDays(submitted),
        path: ROUTES.tourApprovals,
      });
    }

    for (const alert of leaveLimitAlerts) {
      const severity = mapAlertSeverity(alert.severity || "warning");
      if (severity === "info") continue;
      items.push({
        id: `alert-${alert.key}`,
        type: "Policy",
        severity,
        person: alert.employeeName || alert.title || "Employee",
        empCode: alert.empCode || "",
        department: alert.department || "—",
        detail: alert.title || "Leave policy alert",
        due: today,
        age: 0,
        path: alert.route || ROUTES.alerts,
      });
    }

    for (const e of behaviour.habitualLateAll.slice(0, 8)) {
      items.push({
        id: `habit-${e.empCode}`,
        type: "Late pattern",
        severity: e.lateRate >= 50 ? "critical" : "warning",
        person: e.employeeName,
        empCode: e.empCode,
        department: e.department,
        detail: `Late on ${e.lateRate}% of ${e.days} days`,
        due: today,
        age: 0,
        path: ROUTES.latePunch,
      });
    }

    for (const e of employeesWithBirthdayToday(employees)) {
      items.push({
        id: `bday-${e.id}`,
        type: "Today",
        severity: "info",
        person: e.full_name || e.employee_code || "Employee",
        empCode: e.employee_code || "",
        department: e.department || "—",
        detail: "Birthday today",
        due: today,
        age: 0,
        path: employeeDetailPath(e.id),
      });
    }
    for (const e of employeesWithAnniversaryToday(employees)) {
      items.push({
        id: `ann-${e.id}`,
        type: "Today",
        severity: "info",
        person: e.full_name || e.employee_code || "Employee",
        empCode: e.employee_code || "",
        department: e.department || "—",
        detail: "Wedding anniversary today",
        due: today,
        age: 0,
        path: employeeDetailPath(e.id),
      });
    }
    for (const e of employeesWithWorkAnniversaryToday(employees)) {
      const years = computeWorkAnniversaryYears(e.date_of_joining, today);
      items.push({
        id: `work-${e.id}`,
        type: "Today",
        severity: "info",
        person: e.full_name || e.employee_code || "Employee",
        empCode: e.employee_code || "",
        department: e.department || "—",
        detail: years ? `${years}-year work anniversary` : "Work anniversary milestone",
        due: today,
        age: 0,
        path: employeeDetailPath(e.id),
      });
    }

    return items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.age - a.age);
  }, [behaviour.habitualLateAll, employees, leaveLimitAlerts, pendingLeaves, pendingTours]);

  const needsDecision = useMemo(
    () => actionItems.filter((r) => r.type === "Leave" || r.type === "Tour" || r.type === "Policy"),
    [actionItems]
  );

  const openDetail = useCallback((spec) => setDetailSpec(spec), []);
  const closeDetail = useCallback(() => setDetailSpec(null), []);

  const queueColumns = useMemo(
    () => [
      { key: "severity", label: "Priority", render: sevChip },
      { key: "type", label: "Type" },
      ...PERSON_COLS,
      {
        key: "detail",
        label: "What happened",
        render: (row) => (
          <span className="truncate block max-w-[18rem]" title={row.detail}>
            {row.detail}
          </span>
        ),
      },
      {
        key: "due",
        label: "Due",
        render: (row) => <span className="tabular-nums">{formatDisplayDate(row.due)}</span>,
      },
    ],
    []
  );

  const peopleLateCols = useMemo(
    () => [
      ...PERSON_COLS,
      {
        key: "lateRate",
        label: "Late %",
        render: (row) => <span className="tabular-nums font-semibold text-warning">{row.lateRate}%</span>,
      },
      {
        key: "late",
        label: "Late days",
        render: (row) => (
          <span className="tabular-nums">
            {row.late}/{row.days}
          </span>
        ),
      },
      {
        key: "avgHours",
        label: "Avg hours",
        render: (row) => <span className="tabular-nums">{row.avgHours ? `${row.avgHours}h` : "—"}</span>,
      },
    ],
    []
  );

  const peopleOtCols = useMemo(
    () => [
      ...PERSON_COLS,
      {
        key: "otRate",
        label: "Long-day %",
        render: (row) => <span className="tabular-nums font-semibold text-critical">{row.otRate}%</span>,
      },
      {
        key: "ot",
        label: "Long days",
        render: (row) => (
          <span className="tabular-nums">
            {row.ot}/{row.days}
          </span>
        ),
      },
      {
        key: "avgHours",
        label: "Avg hours",
        render: (row) => <span className="tabular-nums">{row.avgHours ? `${row.avgHours}h` : "—"}</span>,
      },
    ],
    []
  );

  const dayTrendCols = useMemo(
    () => [
      { key: "name", label: "Day" },
      {
        key: "present",
        label: "Punches",
        render: (row) => <span className="tabular-nums">{row.present}</span>,
      },
      {
        key: "lateRate",
        label: "Late %",
        render: (row) => <span className="tabular-nums text-warning font-semibold">{row.lateRate}%</span>,
      },
      {
        key: "otRate",
        label: "Long-day %",
        render: (row) => <span className="tabular-nums text-critical font-semibold">{row.otRate}%</span>,
      },
      {
        key: "avgHours",
        label: "Avg hours",
        render: (row) => <span className="tabular-nums">{row.avgHours ? `${row.avgHours}h` : "—"}</span>,
      },
    ],
    []
  );

  const deptCols = useMemo(
    () => [
      {
        key: "fullName",
        label: "Department",
        render: (row) => row.fullName || row.name,
      },
      {
        key: "lateRate",
        label: "Late %",
        render: (row) => <span className="tabular-nums text-warning font-semibold">{row.lateRate}%</span>,
      },
      {
        key: "otRate",
        label: "Long-day %",
        render: (row) => <span className="tabular-nums">{row.otRate}%</span>,
      },
      {
        key: "late",
        label: "Late punches",
        render: (row) => (
          <span className="tabular-nums">
            {row.late}/{row.present}
          </span>
        ),
      },
    ],
    []
  );

  const openLateDetail = useCallback(
    (focusDept) => {
      const people = focusDept
        ? behaviour.peopleStats.filter((p) => p.department === focusDept)
        : behaviour.habitualLateAll.length
          ? behaviour.habitualLateAll
          : behaviour.peopleStats.filter((p) => p.late > 0).sort((a, b) => b.lateRate - a.lateRate);
      openDetail({
        id: focusDept ? `late-dept-${focusDept}` : "late",
        title: focusDept ? `Late arrivals · ${focusDept}` : "Late arrivals",
        subtitle: focusDept
          ? "People in this department with punch data in the selected dates."
          : "Share of punch-ins that arrived after the expected start time.",
        pagePath: ROUTES.latePunch,
        pageLabel: "Open late punch report",
        defaultSort: "late",
        sortOptions: [
          { value: "late", label: "Highest late %" },
          { value: "name", label: "Name" },
          { value: "department", label: "Department" },
        ],
        summary: [
          { label: "Late rate", value: `${behaviour.totals.lateRate}%` },
          { label: "Late punch-days", value: behaviour.totals.lateDays },
          { label: "People seen", value: behaviour.totals.employeesSeen },
          { label: "If trend holds", value: `~${behaviour.totals.lateForecast}%` },
        ],
        columns: peopleLateCols,
        rows: people,
      });
    },
    [behaviour, openDetail, peopleLateCols]
  );

  const openOtDetail = useCallback(() => {
    openDetail({
      id: "ot",
      title: "Long working days",
      subtitle: "Days with more than 9 hours worked. Useful for spotting overload.",
      pagePath: ROUTES.attendanceDaily,
      pageLabel: "Open attendance",
      defaultSort: "ot",
      sortOptions: [
        { value: "ot", label: "Highest long-day %" },
        { value: "name", label: "Name" },
        { value: "department", label: "Department" },
      ],
      summary: [
        { label: "Long-day rate", value: `${behaviour.totals.otRate}%` },
        { label: "Long punch-days", value: behaviour.totals.otDays },
        { label: "Avg hours", value: behaviour.totals.avgHours ? `${behaviour.totals.avgHours}h` : "—" },
        { label: "People flagged", value: behaviour.otHeavyAll.length },
      ],
      columns: peopleOtCols,
      rows: behaviour.otHeavyAll.length
        ? behaviour.otHeavyAll
        : behaviour.peopleStats.filter((p) => p.ot > 0).sort((a, b) => b.otRate - a.otRate),
    });
  }, [behaviour, openDetail, peopleOtCols]);

  const openHoursDetail = useCallback(() => {
    openDetail({
      id: "hours",
      title: "Hours worked",
      subtitle: "Average hours per person from punches in this date range.",
      pagePath: ROUTES.attendanceDaily,
      pageLabel: "Open attendance",
      defaultSort: "value",
      sortOptions: [
        { value: "value", label: "Highest hours" },
        { value: "name", label: "Name" },
        { value: "department", label: "Department" },
      ],
      sortFn: (a, b, sortBy) => {
        if (sortBy === "name") return String(a.employeeName || "").localeCompare(String(b.employeeName || ""));
        if (sortBy === "department") return String(a.department || "").localeCompare(String(b.department || ""));
        return (b.avgHours || 0) - (a.avgHours || 0);
      },
      summary: [
        { label: "Team avg", value: behaviour.totals.avgHours ? `${behaviour.totals.avgHours}h` : "—" },
        { label: "People with punches", value: behaviour.totals.employeesSeen },
        { label: "Punch-days", value: behaviour.totals.punchDays },
      ],
      columns: [
        ...PERSON_COLS,
        {
          key: "avgHours",
          label: "Avg hours",
          render: (row) => <span className="tabular-nums font-semibold">{row.avgHours ? `${row.avgHours}h` : "—"}</span>,
        },
        {
          key: "days",
          label: "Days",
          render: (row) => <span className="tabular-nums">{row.days}</span>,
        },
      ],
      rows: behaviour.peopleStats
        .slice()
        .sort((a, b) => (b.avgHours || 0) - (a.avgHours || 0))
        .map((r) => ({ ...r, value: r.avgHours })),
    });
  }, [behaviour, openDetail]);

  const openApprovalsDetail = useCallback(
    (kind = "all") => {
      let rows = needsDecision;
      let title = "Waiting on your decision";
      let pagePath = ROUTES.leaveApprovals;
      if (kind === "leave") {
        rows = actionItems.filter((r) => r.type === "Leave");
        title = "Leave requests waiting";
        pagePath = ROUTES.leaveApprovals;
      } else if (kind === "tour") {
        rows = actionItems.filter((r) => r.type === "Tour");
        title = "Tour requests waiting";
        pagePath = ROUTES.tourApprovals;
      } else if (kind === "policy") {
        rows = actionItems.filter((r) => r.type === "Policy");
        title = "Policy flags";
        pagePath = ROUTES.alerts;
      }
      openDetail({
        id: `approvals-${kind}`,
        title,
        subtitle: "Approve or follow up so people are not blocked.",
        pagePath,
        pageLabel: "Open full queue",
        defaultSort: "priority",
        sortOptions: [
          { value: "priority", label: "Priority" },
          { value: "due", label: "Due date" },
          { value: "name", label: "Name" },
          { value: "type", label: "Type" },
        ],
        sortFn: (a, b, sortBy) => {
          if (sortBy === "due") return String(a.due).localeCompare(String(b.due));
          if (sortBy === "name") return String(a.person).localeCompare(String(b.person));
          if (sortBy === "type") return String(a.type).localeCompare(String(b.type));
          return severityRank(a.severity) - severityRank(b.severity) || b.age - a.age;
        },
        summary: [
          { label: "Leave", value: leaveCounts.pending || 0 },
          { label: "Tour", value: tourCounts.pending || 0 },
          { label: "Policy", value: leaveLimitAlerts.length },
          { label: "Total here", value: rows.length },
        ],
        columns: queueColumns,
        rows,
      });
    },
    [actionItems, leaveCounts.pending, leaveLimitAlerts.length, needsDecision, openDetail, queueColumns, tourCounts.pending]
  );

  const openHiringDetail = useCallback(() => {
    const r = recruitment || {};
    const rows = [
      { id: "open", name: "Open roles", value: r.openRequisitions || 0, detail: "Requisitions still open" },
      { id: "pending", name: "Pending requisitions", value: r.pendingRequisitions || 0, detail: "Awaiting action" },
      { id: "offers", name: "Offers pending", value: r.offersPending || 0, detail: "Offers not closed" },
      { id: "docs", name: "Documents to review", value: r.documentsToReview || 0, detail: "Candidate documents" },
      { id: "interviews", name: "Interviews to score", value: r.interviewsToEvaluate || 0, detail: "Feedback outstanding" },
    ].filter((row) => row.value > 0);
    openDetail({
      id: "hiring",
      title: "Hiring follow-ups",
      subtitle: "Where recruitment still needs a decision or review.",
      pagePath: ROUTES.recruitment,
      pageLabel: "Open recruitment",
      defaultSort: "value",
      sortOptions: [
        { value: "value", label: "Highest count" },
        { value: "name", label: "Name" },
      ],
      summary: [
        { label: "Open roles", value: r.openRequisitions || 0 },
        { label: "Follow-ups", value: coverage.find((c) => c.id === "hiring")?.value ?? 0 },
      ],
      columns: [
        { key: "name", label: "Item" },
        {
          key: "value",
          label: "Count",
          render: (row) => <span className="tabular-nums font-semibold">{row.value}</span>,
        },
        { key: "detail", label: "Meaning" },
      ],
      rows: rows.length
        ? rows
        : [{ id: "none", name: "No open follow-ups", value: 0, detail: "Hiring looks clear right now" }],
    });
  }, [coverage, openDetail, recruitment]);

  const openPeopleDetail = useCallback(() => {
    const today = todayIso();
    const rows = [
      ...employeesWithBirthdayToday(employees).map((e) => ({
        id: `bday-${e.id}`,
        person: e.full_name || e.employee_code,
        empCode: e.employee_code || "",
        department: e.department || "—",
        detail: "Birthday today",
        severity: "info",
        due: today,
      })),
      ...employeesWithAnniversaryToday(employees).map((e) => ({
        id: `ann-${e.id}`,
        person: e.full_name || e.employee_code,
        empCode: e.employee_code || "",
        department: e.department || "—",
        detail: "Wedding anniversary today",
        severity: "info",
        due: today,
      })),
      ...employeesWithWorkAnniversaryToday(employees).map((e) => {
        const years = computeWorkAnniversaryYears(e.date_of_joining, today);
        return {
          id: `work-${e.id}`,
          person: e.full_name || e.employee_code,
          empCode: e.employee_code || "",
          department: e.department || "—",
          detail: years ? `${years}-year work anniversary` : "Work anniversary milestone",
          severity: "info",
          due: today,
        };
      }),
    ];
    openDetail({
      id: "people",
      title: "Active team",
      subtitle: "People on the employee master. Celebrations today appear below when present.",
      pagePath: ROUTES.employeeMaster,
      pageLabel: "Open employee master",
      defaultSort: "name",
      sortOptions: [
        { value: "name", label: "Name" },
        { value: "department", label: "Department" },
      ],
      summary: [
        { label: "Active people", value: employees.length },
        { label: "Today’s notes", value: rows.length },
      ],
      columns: [
        ...PERSON_COLS,
        { key: "detail", label: "Today" },
      ],
      rows: rows.length
        ? rows
        : employees.slice(0, 50).map((e) => ({
            id: e.id,
            person: e.full_name || e.employee_code,
            empCode: e.employee_code || "",
            department: e.department || "—",
            detail: "Active",
          })),
    });
  }, [employees, openDetail]);

  const openTrendDetail = useCallback(() => {
    openDetail({
      id: "trend",
      title: "Day-by-day attendance",
      subtitle: "How late arrivals and long days moved across the selected dates.",
      pagePath: ROUTES.attendanceDaily,
      pageLabel: "Open attendance",
      defaultSort: "due",
      sortOptions: [
        { value: "due", label: "Date" },
        { value: "late", label: "Highest late %" },
        { value: "ot", label: "Highest long-day %" },
      ],
      sortFn: (a, b, sortBy) => {
        if (sortBy === "late") return (b.lateRate || 0) - (a.lateRate || 0);
        if (sortBy === "ot") return (b.otRate || 0) - (a.otRate || 0);
        return String(a.key || a.fullName || "").localeCompare(String(b.key || b.fullName || ""));
      },
      summary: [
        { label: "Late rate", value: `${behaviour.totals.lateRate}%` },
        { label: "Long-day rate", value: `${behaviour.totals.otRate}%` },
        { label: "Avg hours", value: behaviour.totals.avgHours ? `${behaviour.totals.avgHours}h` : "—" },
      ],
      columns: dayTrendCols,
      rows: behaviour.trend.map((d) => ({ ...d, id: d.key, due: d.key })),
    });
  }, [behaviour, dayTrendCols, openDetail]);

  const openDeptDetail = useCallback(() => {
    openDetail({
      id: "depts",
      title: "Late arrivals by team",
      subtitle: "Which departments have the highest share of late punch-ins.",
      pagePath: ROUTES.latePunch,
      pageLabel: "Open late punch report",
      defaultSort: "late",
      sortOptions: [
        { value: "late", label: "Highest late %" },
        { value: "ot", label: "Highest long-day %" },
        { value: "name", label: "Name" },
      ],
      sortFn: (a, b, sortBy) => {
        if (sortBy === "ot") return (b.otRate || 0) - (a.otRate || 0);
        if (sortBy === "name") return String(a.fullName || a.name).localeCompare(String(b.fullName || b.name));
        return (b.lateRate || 0) - (a.lateRate || 0);
      },
      columns: deptCols,
      rows: behaviour.deptBarsAll,
    });
  }, [behaviour.deptBarsAll, deptCols, openDetail]);

  const openActionQueueDetail = useCallback(
    (seedRows) => {
      const rows = seedRows || actionItems;
      openDetail({
        id: "action-queue",
        title: "What needs attention",
        subtitle: "Approvals, policy flags, late patterns, and today’s people notes.",
        pagePath: ROUTES.leaveApprovals,
        pageLabel: "Open leave approvals",
        defaultSort: "priority",
        sortOptions: [
          { value: "priority", label: "Priority" },
          { value: "due", label: "Due date" },
          { value: "name", label: "Name" },
          { value: "type", label: "Type" },
        ],
        sortFn: (a, b, sortBy) => {
          if (sortBy === "due") return String(a.due).localeCompare(String(b.due));
          if (sortBy === "name") return String(a.person).localeCompare(String(b.person));
          if (sortBy === "type") return String(a.type).localeCompare(String(b.type));
          return severityRank(a.severity) - severityRank(b.severity) || b.age - a.age;
        },
        summary: [
          { label: "Critical", value: rows.filter((r) => r.severity === "critical").length },
          { label: "Needs attention", value: rows.filter((r) => r.severity === "warning").length },
          { label: "FYI", value: rows.filter((r) => r.severity === "info").length },
          { label: "Total", value: rows.length },
        ],
        columns: queueColumns,
        rows,
      });
    },
    [actionItems, openDetail, queueColumns]
  );

  const openNoteDetail = useCallback(
    (note) => {
      if (note.kind === "ot") {
        openOtDetail();
        return;
      }
      if (note.id === "habitual-late" || note.kind === "late") {
        openLateDetail();
        return;
      }
      if (note.id === "anomaly-day") {
        openTrendDetail();
        return;
      }
      openTrendDetail();
    },
    [openLateDetail, openOtDetail, openTrendDetail]
  );

  const t = behaviour.totals;
  const pendingTotal = (leaveCounts.pending || 0) + (tourCounts.pending || 0);
  const previewQueue = actionItems.slice(0, 8);
  const dateHint =
    department === "all" ? `${fromDate} → ${toDate}` : `${fromDate} → ${toDate} · ${department}`;

  const hasDateFilter = fromDate !== daysAgoIso(21) || toDate !== todayIso() || department !== "all";

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <PageTaskHeader
        title="Admin overview"
        subtitle="See how the team is attending, what is waiting on you, and where to act — without leaving this page."
      >
        {realtimeLive ? (
          <span className="inline-flex items-center gap-1.5 type-meta text-success">
            <i className="w-1.5 h-1.5 rounded-full bg-success" />
            Live
          </span>
        ) : null}
        {refreshing && !loading ? <span className="type-meta text-ink-muted">Updating…</span> : null}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="erp-btn-secondary h-9 px-3 inline-flex items-center gap-1.5"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <FilterBar>
        <div className="flex flex-col gap-0.5 w-auto">
          <label className="text-[10px] font-semibold text-ink-muted uppercase">From</label>
          <TinyInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-0.5 w-auto">
          <label className="text-[10px] font-semibold text-ink-muted uppercase">To</label>
          <TinyInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-ink-muted uppercase">Department</label>
          <TinySelect value={department} onChange={(e) => setDepartment(e.target.value)} className="min-w-[160px]">
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </TinySelect>
        </div>
        <p className="type-meta text-ink-muted self-end pb-2">{dateHint}</p>
        {hasDateFilter ? (
          <div className="flex flex-col gap-0.5 justify-end">
            <label className="text-[10px] font-semibold text-transparent uppercase">Reset</label>
            <button
              type="button"
              onClick={() => {
                setFromDate(daysAgoIso(21));
                setToDate(todayIso());
                setDepartment("all");
              }}
              className="h-9 px-3 inline-flex items-center gap-1 rounded-lg border border-border text-xs font-semibold text-ink-secondary hover:bg-row-hover"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        ) : null}
      </FilterBar>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile
          label="Late arrivals"
          value={loading ? "…" : `${t.lateRate}%`}
          sub={
            t.lateSlope > 0.2
              ? `Rising · next ~${t.lateForecast}%`
              : t.lateSlope < -0.2
                ? `Improving · next ~${t.lateForecast}%`
                : `${t.lateDays} late punch-days`
          }
          onClick={() => openLateDetail()}
          tone={t.lateRate >= 20 ? "border-critical-border" : t.lateRate >= 12 ? "border-warning-border" : "border-border/80"}
        />
        <KpiTile
          label="Long days"
          value={loading ? "…" : `${t.otRate}%`}
          sub={`${t.otDays} days over 9 hours`}
          onClick={openOtDetail}
          tone={t.otRate >= 18 ? "border-critical-border" : "border-border/80"}
        />
        <KpiTile
          label="Avg hours / day"
          value={loading ? "…" : t.avgHours ? `${t.avgHours}h` : "—"}
          sub={`${t.employeesSeen} people with punches`}
          onClick={openHoursDetail}
        />
        <KpiTile
          label="Waiting on you"
          value={loading ? "…" : pendingTotal}
          sub={`${leaveCounts.pending || 0} leave · ${tourCounts.pending || 0} tour`}
          onClick={() => openApprovalsDetail("all")}
          tone={pendingTotal > 0 ? "border-warning-border" : "border-border/80"}
        />
        <KpiTile
          label="Hiring follow-ups"
          value={loading ? "…" : coverage.find((c) => c.id === "hiring")?.value ?? 0}
          sub={recruitment ? `${recruitment.openRequisitions || 0} open roles` : "Recruitment"}
          onClick={openHiringDetail}
        />
        <KpiTile
          label="Active people"
          value={loading ? "…" : employees.length}
          sub="Employee master"
          onClick={openPeopleDetail}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {coverage.map((mod) => (
          <button
            key={mod.id}
            type="button"
            onClick={() => {
              if (mod.id === "workforce") openPeopleDetail();
              else if (mod.id === "attendance") openLateDetail();
              else if (mod.id === "leave") openApprovalsDetail("leave");
              else if (mod.id === "tour") openApprovalsDetail("tour");
              else if (mod.id === "policy") openApprovalsDetail("policy");
              else if (mod.id === "hiring") openHiringDetail();
            }}
            className="text-left rounded-xl border border-border bg-surface px-3 py-2.5 hover:bg-row-hover transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="type-mono-caption text-ink-muted uppercase">{mod.label}</span>
              <StatusChip
                label={mod.tone === "ok" ? "OK" : mod.tone === "critical" ? "Act" : "Watch"}
                severity={severityChip(mod.tone)}
              />
            </div>
            <p className="type-figure text-ink-strong mt-1 tabular-nums">{loading ? "…" : mod.value}</p>
            <p className="type-meta text-ink-muted mt-0.5 truncate">{mod.hint}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard
          title="Late & long days over time"
          right={
            <button type="button" className="type-meta text-accent hover:underline" onClick={openTrendDetail}>
              View days
            </button>
          }
          className="xl:col-span-2"
        >
          <button type="button" className="w-full text-left px-2 pb-2 min-h-[240px]" onClick={openTrendDetail}>
            {chartsReady && behaviour.trend.length ? (
              <ComposedTrendChart
                data={behaviour.trend}
                areas={[{ key: "lateRate", name: "Late %", color: TOKENS.warning, fillOpacity: 0.16 }]}
                lines={[{ key: "otRate", name: "Long-day %", color: TOKENS.critical, width: 2.25 }]}
                height={240}
                showLegend
                compact
                formatter={(v) => `${v}%`}
                yTickFormatter={(v) => `${Math.round(Number(v) || 0)}%`}
              />
            ) : (
              <p className="text-sm text-ink-muted text-center py-16">
                {loading ? "Loading attendance…" : "No punch data in this range."}
              </p>
            )}
          </button>
        </SectionCard>

        <SectionCard
          title="What stands out"
          right={
            <span className="inline-flex items-center gap-1 type-meta text-ink-muted">
              <Sparkles className="w-3.5 h-3.5" />
              From this period
            </span>
          }
        >
          {behaviour.notes.length === 0 ? (
            <p className="px-4 py-8 text-center type-meta text-ink-muted">Nothing unusual in this window.</p>
          ) : (
            <ul className="divide-y divide-border">
              {behaviour.notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-3 hover:bg-row-hover"
                    onClick={() => openNoteDetail(note)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="type-body-medium text-ink-strong">{note.title}</p>
                      <StatusChip
                        label={
                          note.severity === "critical" ? "Act" : note.severity === "warning" ? "Watch" : "Note"
                        }
                        severity={
                          note.severity === "critical" ? "critical" : note.severity === "warning" ? "warning" : "info"
                        }
                      />
                    </div>
                    <p className="type-meta text-ink-secondary mt-1">{note.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Which teams arrive late"
          right={
            <button type="button" className="type-meta text-accent hover:underline" onClick={openDeptDetail}>
              All teams
            </button>
          }
        >
          <div className="px-2 pb-2 min-h-[220px]">
            {chartsReady && behaviour.deptBars.length ? (
              <BarCompareChart
                data={behaviour.deptBars}
                layout="horizontal"
                xKey="name"
                series={[{ key: "lateRate", name: "Late %", color: TOKENS.warning }]}
                height={210}
                categoryWidth={96}
                formatter={(v) => `${v}%`}
                yTickFormatter={(v) => `${Math.round(Number(v) || 0)}%`}
                onBarClick={(payload) => openLateDetail(payload?.fullName || payload?.name)}
              />
            ) : (
              <p className="text-sm text-ink-muted text-center py-14">No department signal yet.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Often late"
          right={
            <button type="button" className="type-meta text-accent hover:underline" onClick={() => openLateDetail()}>
              See all
            </button>
          }
        >
          {behaviour.habitualLate.length === 0 ? (
            <p className="px-4 py-10 text-center type-meta text-ink-muted">No repeated late pattern in range.</p>
          ) : (
            <ul className="divide-y divide-border max-h-[240px] overflow-y-auto">
              {behaviour.habitualLate.map((row) => (
                <li key={row.empCode}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-row-hover"
                    onClick={() => openLateDetail()}
                  >
                    <span className="min-w-0">
                      <span className="block type-body-medium text-ink-strong truncate">{row.employeeName}</span>
                      <span className="block type-meta text-ink-muted truncate">
                        {row.empCode} · {row.department}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block type-num text-warning font-semibold">{row.lateRate}%</span>
                      <span className="block type-meta text-ink-muted">
                        {row.late}/{row.days} days
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Many long days"
          right={
            <button type="button" className="type-meta text-accent hover:underline" onClick={openOtDetail}>
              See all
            </button>
          }
        >
          {behaviour.otHeavy.length === 0 ? (
            <p className="px-4 py-10 text-center type-meta text-ink-muted">No heavy overtime pattern in range.</p>
          ) : (
            <ul className="divide-y divide-border max-h-[240px] overflow-y-auto">
              {behaviour.otHeavy.map((row) => (
                <li key={row.empCode}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-row-hover"
                    onClick={openOtDetail}
                  >
                    <span className="min-w-0">
                      <span className="block type-body-medium text-ink-strong truncate">{row.employeeName}</span>
                      <span className="block type-meta text-ink-muted truncate">
                        {row.empCode} · avg {row.avgHours || "—"}h
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block type-num text-critical font-semibold">{row.otRate}%</span>
                      <span className="block type-meta text-ink-muted">
                        {row.ot}/{row.days} long
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Needs your attention"
        right={
          <button
            type="button"
            className="type-meta text-accent hover:underline"
            onClick={() => openActionQueueDetail()}
          >
            Open full list ({actionItems.length})
          </button>
        }
      >
        {loading ? (
          <p className="px-4 py-10 text-center type-meta text-ink-muted">Loading…</p>
        ) : previewQueue.length === 0 ? (
          <p className="px-4 py-10 text-center type-meta text-ink-muted">Nothing waiting right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {previewQueue.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-row-hover"
                  onClick={() => openActionQueueDetail(actionItems.filter((r) => r.type === row.type))}
                >
                  {sevChip(row)}
                  <span className="min-w-0 flex-1">
                    <span className="block type-body-medium text-ink-strong truncate">
                      {row.person}
                      <span className="text-ink-muted font-normal"> · {row.type}</span>
                    </span>
                    <span className="block type-meta text-ink-muted truncate">{row.detail}</span>
                  </span>
                  <span className="shrink-0 type-meta text-ink-muted tabular-nums">{formatDisplayDate(row.due)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <AdminOpsDetailModal
        open={Boolean(detailSpec)}
        spec={detailSpec}
        onClose={closeDetail}
        onOpenPage={(path) => navigate(path)}
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { fetchLeaveStatusCounts, fetchLeaveRequests, subscribeLeaveWorkflowRealtime } from "../../lib/adminLeaveRequests";
import { fetchTourStatusCounts, subscribeTourWorkflowRealtime } from "../../lib/adminTourRequests";
import { fetchRegisterMarksForYear, fetchActiveEmployees } from "../../lib/attendanceDaily";
import { buildLeaveLimitNotifications } from "../../lib/attendanceLeaveLimits";
import { isSupabaseRealtimeEnabled } from "../../lib/supabaseConfig";
import {
  employeesWithBirthdayInRange,
  employeesWithAnniversaryInRange,
  employeesWithWorkAnniversaryInRange,
  employeesWithBirthdayToday,
  employeesWithAnniversaryToday,
  employeesWithWorkAnniversaryToday,
  computeWorkAnniversaryYears,
  celebrationOccurrenceIsoInRange,
  summarizeReminderCoverage,
} from "../../utils/employeeMasterReminders";
import { normalizeToIsoDate } from "../../utils/dateDisplay";
import {
  SparkKpi,
  ChartPanel,
  AreaTrendChart,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  countByKey,
  CHART_SERIES,
} from "../../components/charts/DashboardCharts";
import {
  PageTaskHeader,
  SectionCard,
  FilterBar,
  DenseTable,
  StatusChip,
  TinyInput,
  TinySelect,
} from "./components/AdminUi";

const REALTIME_DEBOUNCE_MS = 450;
const EMPLOYEE_PAGE_SIZE = 1000;
const MAX_EMPLOYEE_PAGES = 20;

const ROUTES = {
  employeeMaster: "/app/admin/employee/master",
  leaveApprovals: "/app/admin/employee/leaves-permissions",
  leaveManagement: "/app/admin/employee/leave-management",
  tourApprovals: "/app/admin/employee/tour-approvals",
  attendanceDaily: "/app/admin/employee/attendance-daily",
  alerts: "/app/admin/alerts-notifications",
  reports: "/app/admin/reports-analytics",
};

const DASH_SECTIONS = {
  birthdays: "dash-birthdays",
  weddingAnniversaries: "dash-wedding-anniversaries",
  workAnniversaries: "dash-work-anniversaries",
  remindersFeed: "dash-reminders-feed",
  leaveQueue: "dash-leave-queue",
};

function employeeDetailPath(id) {
  return `/app/admin/employee/master/${id}`;
}

function scrollToDashSection(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function reminderTypeTarget(type) {
  if (type === "Birthday") return { kind: "scroll", id: DASH_SECTIONS.birthdays };
  if (type === "Anniversary") return { kind: "scroll", id: DASH_SECTIONS.weddingAnniversaries };
  if (type === "Work anniversary") return { kind: "scroll", id: DASH_SECTIONS.workAnniversaries };
  if (type === "Leave") return { kind: "path", path: ROUTES.leaveApprovals };
  if (type === "Alert") return { kind: "path", path: ROUTES.alerts };
  return { kind: "scroll", id: DASH_SECTIONS.remindersFeed };
}

function followDashboardTarget(target, navigate) {
  if (!target) return;
  if (target.kind === "scroll") scrollToDashSection(target.id);
  else if (target.path) navigate(target.path);
}

function celebrationSliceTarget(name) {
  if (name === "Birthdays") return { kind: "scroll", id: DASH_SECTIONS.birthdays };
  if (name === "Wedding ann.") return { kind: "scroll", id: DASH_SECTIONS.weddingAnniversaries };
  if (name === "Work ann.") return { kind: "scroll", id: DASH_SECTIONS.workAnniversaries };
  return { kind: "path", path: ROUTES.employeeMaster };
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthEndIso() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function celebrationDateInRangeIso(dateStr, fromIso, toIso) {
  const occurrence = celebrationOccurrenceIsoInRange(dateStr, fromIso, toIso);
  if (occurrence) return occurrence;
  return normalizeToIsoDate(dateStr) || todayIso();
}

function positiveChartSlices(rows) {
  return (rows || []).filter((d) => (Number(d.value) || 0) > 0);
}

/** Tells the admin why some employees never appear in a reminder list. */
function CoverageNote({ total, missing, muted, missingLabel, mutedLabel, fixPath }) {
  if (!total) return null;
  const notes = [];
  if (missing > 0) notes.push(`${missing} of ${total} ${missingLabel}`);
  if (muted > 0) notes.push(`${muted} ${mutedLabel}`);
  if (notes.length === 0) {
    return (
      <p className="px-4 py-2 border-t border-divider type-meta text-ink-muted">
        All {total} active employees are covered.
      </p>
    );
  }
  return (
    <p className="px-4 py-2 border-t border-divider type-meta text-ink-muted">
      {notes.join(" · ")} ·{" "}
      <Link to={fixPath} className="text-accent hover:underline">
        Update in Employee Master
      </Link>
    </p>
  );
}

function ChartEmpty({ message }) {
  return <p className="text-sm text-ink-muted text-center py-16 px-4">{message}</p>;
}

/** Bucket reminder items into daily counts between from and to (inclusive). */
function bucketItemsByDay(items, fromIso, toIso) {
  const start = new Date(fromIso);
  const end = new Date(toIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  const map = new Map();
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const label = `${String(cursor.getDate()).padStart(2, "0")}/${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, { name: label, birthdays: 0, anniversaries: 0, workAnniversaries: 0, leaves: 0, alerts: 0, total: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const item of items || []) {
    const key = String(item.date || "").slice(0, 10);
    if (!map.has(key)) continue;
    const cell = map.get(key);
    if (item.type === "Birthday") cell.birthdays += 1;
    else if (item.type === "Anniversary") cell.anniversaries += 1;
    else if (item.type === "Work anniversary") cell.workAnniversaries += 1;
    else if (item.type === "Leave") cell.leaves += 1;
    else if (item.type === "Alert") cell.alerts += 1;
    cell.total += 1;
  }
  return [...map.values()];
}

function severityRank(sev) {
  if (sev === "critical") return 0;
  if (sev === "warning") return 1;
  return 2;
}

const SORT_OPTIONS = [
  { value: "priority", label: "Priority" },
  { value: "date", label: "Date" },
  { value: "type", label: "Type" },
  { value: "name", label: "Name" },
];

const MODULE_SHORTCUTS = [
  { label: "Employee Master", path: ROUTES.employeeMaster, desc: "Profiles & documents" },
  { label: "Daily Attendance", path: ROUTES.attendanceDaily, desc: "Register & corrections" },
  { label: "Leave Approvals", path: ROUTES.leaveApprovals, desc: "Pending leave queue" },
  { label: "Leave Management", path: ROUTES.leaveManagement, desc: "Balances & policies" },
  { label: "Tour Approvals", path: ROUTES.tourApprovals, desc: "Travel requests inbox" },
  { label: "National Holidays", path: "/app/admin/employee/national-holidays", desc: "Holiday calendar" },
  { label: "Reports & Analytics", path: ROUTES.reports, desc: "Admin reports" },
  { label: "Alerts & Notifications", path: ROUTES.alerts, desc: "All system alerts" },
];

function leaveDisplayName(row) {
  return row?.employee?.full_name || row?.employee_code || "Employee";
}

function mapAlertSeverity(sev) {
  if (sev === "critical" || sev === "high") return "critical";
  if (sev === "warning") return "warning";
  return "info";
}

function countTick(v) {
  return String(Math.round(Number(v) || 0));
}

function celebrationIso(dateStr, refYear) {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) return todayIso();
  const [, m, d] = iso.split("-");
  return `${refYear}-${m}-${d}`;
}

function filterActiveEmployees(rows) {
  return (rows || []).filter((e) => String(e?.status || "").trim().toLowerCase() !== "inactive");
}

/** Employee master in pages — a single select is capped by the API row limit and would drop reminders. */
async function fetchAllEmployeesForReminders() {
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

export default function AdminOpsDashboard() {
  const navigate = useNavigate();

  const [fromDate, setFromDate] = useState(monthStartIso);
  const [toDate, setToDate] = useState(monthEndIso);
  const [masterSearch, setMasterSearch] = useState("");
  const [sortBy, setSortBy] = useState("priority");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeLive, setRealtimeLive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshDebounceRef = useRef(null);

  const [activeEmployees, setActiveEmployees] = useState(0);
  const [leaveCounts, setLeaveCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [tourCounts, setTourCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveLimitAlerts, setLeaveLimitAlerts] = useState([]);
  const initialLoadRef = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    if (initialLoadRef.current) {
      setLoading(true);
      initialLoadRef.current = false;
    }
    try {
      const year = new Date().getFullYear();
      const [leaveStatus, tours, leaves, allLeaveRes, empRes, registerRows, activeEmps] =
        await Promise.all([
          fetchLeaveStatusCounts().catch(() => ({ pending: 0, approved: 0, rejected: 0 })),
          fetchTourStatusCounts().catch(() => ({ pending: 0, approved: 0, rejected: 0 })),
          fetchLeaveRequests({ status: "pending", page: 1, pageSize: 8 }).catch(() => ({ rows: [] })),
          fetchLeaveRequests({ status: "all", page: 1, pageSize: 300 }).catch(() => ({ rows: [] })),
          fetchAllEmployeesForReminders()
            .then((data) => ({ data, error: null }))
            .catch((error) => ({ data: null, error })),
          fetchRegisterMarksForYear(supabase, year).catch(() => []),
          fetchActiveEmployees(supabase).catch(() => []),
        ]);

      setLeaveCounts(leaveStatus);
      setTourCounts(tours);
      setPendingLeaves(leaves.rows || []);
      setAllLeaves(allLeaveRes.rows || []);

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
        setActiveEmployees(0);
      } else {
        const rows = filterActiveEmployees(empRes.data || []);
        setEmployees(rows);
        setActiveEmployees(rows.length);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      setRefreshKey((k) => k + 1);
    }, REALTIME_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const unsubs = [
      subscribeLeaveWorkflowRealtime(scheduleRefresh),
      subscribeTourWorkflowRealtime(scheduleRefresh),
    ];

    let empChannel = null;
    if (isSupabaseRealtimeEnabled()) {
      setRealtimeLive(true);
      empChannel = supabase
        .channel("admin-dash-emp-master")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "admin_ifsp_employee_master" },
          scheduleRefresh
        )
        .subscribe();
    }

    return () => {
      unsubs.forEach((u) => u());
      if (empChannel) supabase.removeChannel(empChannel);
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, [scheduleRefresh]);

  const needle = masterSearch.trim().toLowerCase();

  const birthdayReminders = useMemo(() => {
    const from = fromDate || monthStartIso();
    const to = toDate || monthEndIso();
    let rows = employeesWithBirthdayInRange(employees, from, to).map((e) => {
      const isToday = employeesWithBirthdayToday([e]).length > 0;
      return {
        id: `bday-${e.id}`,
        name: e.full_name || e.employee_code || "Employee",
        empCode: e.employee_code,
        department: e.department || "—",
        date: celebrationDateInRangeIso(e.date_of_birth, from, to),
        isToday,
        path: employeeDetailPath(e.id),
      };
    });
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (needle) {
      rows = rows.filter(
        (x) =>
          x.name?.toLowerCase().includes(needle) ||
          x.empCode?.toLowerCase().includes(needle) ||
          x.department?.toLowerCase().includes(needle)
      );
    }
    return rows;
  }, [employees, fromDate, toDate, needle]);

  const anniversaryReminders = useMemo(() => {
    const from = fromDate || monthStartIso();
    const to = toDate || monthEndIso();
    let rows = employeesWithAnniversaryInRange(employees, from, to).map((e) => {
      const isToday = employeesWithAnniversaryToday([e]).length > 0;
      return {
        id: `ann-${e.id}`,
        name: e.full_name || e.employee_code || "Employee",
        empCode: e.employee_code,
        department: e.department || "—",
        date: celebrationDateInRangeIso(e.date_of_anniversary, from, to),
        isToday,
        path: employeeDetailPath(e.id),
      };
    });
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (needle) {
      rows = rows.filter(
        (x) =>
          x.name?.toLowerCase().includes(needle) ||
          x.empCode?.toLowerCase().includes(needle) ||
          x.department?.toLowerCase().includes(needle)
      );
    }
    return rows;
  }, [employees, fromDate, toDate, needle]);

  const workAnniversaryReminders = useMemo(() => {
    const from = fromDate || monthStartIso();
    const to = toDate || monthEndIso();
    let rows = employeesWithWorkAnniversaryInRange(employees, from, to).map((e) => {
      const isToday = employeesWithWorkAnniversaryToday([e]).length > 0;
      const celebrationDate = celebrationDateInRangeIso(e.date_of_joining, from, to);
      const years = computeWorkAnniversaryYears(e.date_of_joining, celebrationDate);
      return {
        id: `work-${e.id}`,
        name: e.full_name || e.employee_code || "Employee",
        empCode: e.employee_code,
        department: e.department || "—",
        date: celebrationDate,
        years: years != null ? `${years} yr${years === 1 ? "" : "s"}` : "—",
        isToday,
        path: employeeDetailPath(e.id),
      };
    });
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (needle) {
      rows = rows.filter(
        (x) =>
          x.name?.toLowerCase().includes(needle) ||
          x.empCode?.toLowerCase().includes(needle) ||
          x.department?.toLowerCase().includes(needle)
      );
    }
    return rows;
  }, [employees, fromDate, toDate, needle]);

  const reminderCoverage = useMemo(() => summarizeReminderCoverage(employees), [employees]);

  const birthdayTodayCount = useMemo(
    () => employeesWithBirthdayToday(employees).length,
    [employees]
  );
  const anniversaryTodayCount = useMemo(
    () => employeesWithAnniversaryToday(employees).length,
    [employees]
  );
  const workAnniversaryTodayCount = useMemo(
    () => employeesWithWorkAnniversaryToday(employees).length,
    [employees]
  );

  const remindersFeed = useMemo(() => {
    const from = fromDate || monthStartIso();
    const to = toDate || monthEndIso();
    const items = [];

    for (const row of birthdayReminders) {
      items.push({
        id: row.id,
        type: "Birthday",
        name: row.name,
        empCode: row.empCode,
        date: row.date,
        severity: row.isToday ? "critical" : "info",
        title: row.isToday ? "Birthday today" : "Upcoming birthday",
        path: row.path,
      });
    }

    for (const row of anniversaryReminders) {
      items.push({
        id: row.id,
        type: "Anniversary",
        name: row.name,
        empCode: row.empCode,
        date: row.date,
        severity: row.isToday ? "critical" : "info",
        title: row.isToday ? "Wedding anniversary today" : "Upcoming wedding anniversary",
        path: row.path,
      });
    }

    for (const row of workAnniversaryReminders) {
      items.push({
        id: row.id,
        type: "Work anniversary",
        name: row.name,
        empCode: row.empCode,
        date: row.date,
        severity: row.isToday ? "critical" : "info",
        title: row.isToday
          ? `Work anniversary today${row.years !== "—" ? ` · ${row.years}` : ""}`
          : `Upcoming work anniversary${row.years !== "—" ? ` · ${row.years}` : ""}`,
        path: row.path,
      });
    }

    for (const row of pendingLeaves) {
      const leaveDate = row.from_date || row.submitted_at?.slice(0, 10) || todayIso();
      if (leaveDate < from || leaveDate > to) continue;
      items.push({
        id: `leave-${row.id}`,
        type: "Leave",
        name: leaveDisplayName(row),
        empCode: row.employee_code || "",
        date: leaveDate,
        severity: "warning",
        title: `Leave pending — ${row.leave_type_code || "Leave"}`,
        path: ROUTES.leaveApprovals,
      });
    }

    for (const alert of leaveLimitAlerts) {
      items.push({
        id: `alert-${alert.key}`,
        type: "Alert",
        name: alert.title,
        empCode: alert.empCode || "",
        date: todayIso(),
        severity: mapAlertSeverity(alert.severity || "warning"),
        title: alert.title,
        path: alert.route || ROUTES.alerts,
      });
    }

    let filtered = items;
    if (needle) {
      filtered = items.filter(
        (x) =>
          x.name?.toLowerCase().includes(needle) ||
          x.empCode?.toLowerCase().includes(needle) ||
          x.title?.toLowerCase().includes(needle) ||
          x.type?.toLowerCase().includes(needle)
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "date") return String(a.date).localeCompare(String(b.date));
      if (sortBy === "type") return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const sr = severityRank(a.severity) - severityRank(b.severity);
      if (sr !== 0) return sr;
      return String(a.date).localeCompare(String(b.date));
    });

    return sorted;
  }, [birthdayReminders, anniversaryReminders, workAnniversaryReminders, pendingLeaves, leaveLimitAlerts, fromDate, toDate, needle, sortBy]);

  const birthdayCount = birthdayReminders.length;
  const anniversaryCount = anniversaryReminders.length;
  const workAnniversaryCount = workAnniversaryReminders.length;

  const chartData = useMemo(() => {
    const from = fromDate || monthStartIso();
    const to = toDate || monthEndIso();

    const leaveDonut = positiveChartSlices([
      { name: "Pending", value: leaveCounts.pending ?? 0 },
      { name: "Approved", value: leaveCounts.approved ?? 0 },
      { name: "Rejected", value: leaveCounts.rejected ?? 0 },
    ]);

    const tourDonut = positiveChartSlices([
      { name: "Pending", value: tourCounts.pending ?? 0 },
      { name: "Approved", value: tourCounts.approved ?? 0 },
      { name: "Rejected", value: tourCounts.rejected ?? 0 },
    ]);

    const celebrationsDonut = positiveChartSlices([
      { name: "Birthdays", value: birthdayCount },
      { name: "Wedding ann.", value: anniversaryCount },
      { name: "Work ann.", value: workAnniversaryCount },
    ]);

    const reminderTypeBar = countByKey(remindersFeed, (r) => r.type).slice(0, 6);

    const priorityDonut = positiveChartSlices(
      countByKey(remindersFeed, (r) => {
        if (r.severity === "critical") return "High";
        if (r.severity === "warning") return "Medium";
        return "Info";
      })
    );

    const timeline = bucketItemsByDay(remindersFeed, from, to);

    const deptBar = countByKey(
      employees,
      (e) => String(e.department || "").trim() || "Unassigned"
    ).slice(0, 8);

    const leaveInRange = allLeaves.filter((row) => {
      const d = row.from_date || row.submitted_at?.slice(0, 10);
      return d && d >= from && d <= to;
    });
    const leaveTypeBar = countByKey(leaveInRange, (r) => r.leave_type_code || "Other").slice(0, 6);

    const leaveTotal =
      (leaveCounts.pending ?? 0) + (leaveCounts.approved ?? 0) + (leaveCounts.rejected ?? 0);
    const leaveClearancePct =
      leaveTotal > 0 ? Math.round(((leaveCounts.approved ?? 0) / leaveTotal) * 100) : 0;

    const birthdayByDay = bucketItemsByDay(
      birthdayReminders.map((r) => ({ ...r, type: "Birthday", date: r.date })),
      from,
      to
    );

    return {
      leaveDonut,
      tourDonut,
      celebrationsDonut,
      reminderTypeBar,
      priorityDonut,
      timeline,
      birthdayByDay,
      deptBar,
      leaveTypeBar,
      leaveClearancePct,
    };
  }, [
    remindersFeed,
    leaveCounts,
    tourCounts,
    employees,
    allLeaves,
    fromDate,
    toDate,
    birthdayCount,
    anniversaryCount,
    workAnniversaryCount,
    birthdayReminders,
  ]);

  const celebrationColumns = [
    { key: "empCode", label: "Code" },
    {
      key: "name",
      label: "Employee",
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-ink">{row.name}</p>
          {row.isToday ? (
            <StatusChip label="Today" severity="critical" />
          ) : null}
        </div>
      ),
    },
    { key: "department", label: "Department" },
    {
      key: "date",
      label: "Date",
      render: (row) => formatDisplayDate(row.date),
    },
    {
      key: "action",
      label: "",
      render: (row) => (
        <Link to={row.path} className="text-sm text-accent hover:underline">
          Open
        </Link>
      ),
    },
  ];

  const workAnniversaryColumns = [
    ...celebrationColumns.slice(0, 4),
    { key: "years", label: "Tenure" },
    celebrationColumns[4],
  ];

  const reminderColumns = [
    {
      key: "severity",
      label: "Priority",
      render: (row) => (
        <StatusChip
          label={row.severity === "critical" ? "High" : row.severity === "warning" ? "Medium" : "Info"}
          severity={row.severity}
        />
      ),
    },
    { key: "type", label: "Type" },
    {
      key: "name",
      label: "Subject",
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-ink">{row.name}</p>
          {row.empCode ? <p className="type-meta text-ink-muted">{row.empCode}</p> : null}
        </div>
      ),
    },
    { key: "title", label: "Detail" },
    {
      key: "date",
      label: "Date",
      render: (row) => formatDisplayDate(row.date),
    },
    {
      key: "action",
      label: "",
      render: (row) => (
        <Link to={row.path} className="text-sm text-accent hover:underline">
          Open
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      <PageTaskHeader
        title="Admin Dashboard"
        subtitle="Live reminders, alerts, and quick access to employee administration."
      >
        {realtimeLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live updates
          </span>
        ) : null}
        {refreshing && !loading ? (
          <span className="text-[11px] text-gray-500 tabular-nums">Updating…</span>
        ) : null}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="btn-secondary text-sm"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </PageTaskHeader>

      <FilterBar>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">From date</label>
          <TinyInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">To date</label>
          <TinyInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-0.5 min-w-[200px] flex-1">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Master search</label>
          <TinyInput
            placeholder="Name, code, alert, type…"
            value={masterSearch}
            onChange={(e) => setMasterSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Sort by</label>
          <TinySelect value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="min-w-[120px]">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </TinySelect>
        </div>
      </FilterBar>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <SparkKpi
          label="Active employees"
          value={loading ? "…" : activeEmployees}
          sub="In employee master"
          series={sparkFromValue(activeEmployees)}
          color={CHART_SERIES[0]}
          onClick={() => navigate(ROUTES.employeeMaster)}
        />
        <SparkKpi
          label="Birthdays today"
          value={loading ? "…" : birthdayTodayCount}
          sub={`${birthdayCount} in selected range`}
          series={sparkFromValue(birthdayTodayCount)}
          color={CHART_SERIES[1]}
          onClick={() => scrollToDashSection(DASH_SECTIONS.birthdays)}
        />
        <SparkKpi
          label="Anniversaries today"
          value={loading ? "…" : anniversaryTodayCount + workAnniversaryTodayCount}
          sub={`${anniversaryCount} wedding · ${workAnniversaryCount} work in range`}
          series={sparkFromValue(anniversaryTodayCount + workAnniversaryTodayCount)}
          color={CHART_SERIES[5]}
          onClick={() => scrollToDashSection(DASH_SECTIONS.weddingAnniversaries)}
        />
        <SparkKpi
          label="Leave pending"
          value={loading ? "…" : leaveCounts.pending ?? 0}
          sub={`${leaveCounts.approved ?? 0} approved overall`}
          series={sparkFromValue(leaveCounts.pending ?? 0)}
          color={CHART_SERIES[3]}
          onClick={() => {
            if (pendingLeaves.length > 0) scrollToDashSection(DASH_SECTIONS.leaveQueue);
            else navigate(ROUTES.leaveApprovals);
          }}
          value={loading ? "…" : tourCounts.pending ?? 0}
          sub="Awaiting approval"
          series={sparkFromValue(tourCounts.pending ?? 0)}
          color={CHART_SERIES[2]}
          onClick={() => navigate(ROUTES.tourApprovals)}
        />
        <SparkKpi
          label="Alerts & reminders"
          value={loading ? "…" : remindersFeed.length}
          sub="All types in feed"
          series={sparkFromValue(remindersFeed.length)}
          color={CHART_SERIES[4]}
          onClick={() => scrollToDashSection(DASH_SECTIONS.remindersFeed)}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <SectionCard
          title="Birthday reminders"
          right={
            <div className="flex items-center gap-3">
              <span className="type-meta text-ink-muted hidden sm:inline">
                {birthdayReminders.length} · {formatDisplayDate(fromDate)} – {formatDisplayDate(toDate)}
              </span>
              <Link to={ROUTES.alerts} className="text-sm text-accent hover:underline shrink-0">
                All alerts
              </Link>
            </div>
          }
          className="scroll-mt-4"
        >
          <div id={DASH_SECTIONS.birthdays} className="-scroll-mt-24" />
          {birthdayReminders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              No birthdays in this date range.{" "}
              <Link to={ROUTES.employeeMaster} className="text-accent hover:underline">
                Add Date of Birth in Employee Master
              </Link>
              .
            </p>
          ) : (
            <DenseTable
              columns={celebrationColumns}
              rows={birthdayReminders}
              rowKey="id"
              onRowClick={(row) => navigate(row.path)}
            />
          )}
          <CoverageNote
            total={reminderCoverage.activeEmployees}
            missing={reminderCoverage.missingBirthday}
            muted={reminderCoverage.mutedBirthday}
            missingLabel="have no date of birth on record"
            mutedLabel="have birthday reminders switched off"
            fixPath={ROUTES.employeeMaster}
          />
        </SectionCard>

        <SectionCard
          title="Wedding anniversary reminders"
          right={
            <div className="flex items-center gap-3">
              <span className="type-meta text-ink-muted hidden sm:inline">
                {anniversaryReminders.length} · {formatDisplayDate(fromDate)} – {formatDisplayDate(toDate)}
              </span>
              <Link to={ROUTES.employeeMaster} className="text-sm text-accent hover:underline shrink-0">
                Employee Master
              </Link>
            </div>
          }
          className="scroll-mt-4"
        >
          <div id={DASH_SECTIONS.weddingAnniversaries} className="-scroll-mt-24" />
          {anniversaryReminders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              No wedding anniversaries in range.{" "}
              <Link to={ROUTES.employeeMaster} className="text-accent hover:underline">
                Add Wedding Anniversary Date
              </Link>
              .
            </p>
          ) : (
            <DenseTable
              columns={celebrationColumns}
              rows={anniversaryReminders}
              rowKey="id"
              onRowClick={(row) => navigate(row.path)}
            />
          )}
          <CoverageNote
            total={reminderCoverage.activeEmployees}
            missing={reminderCoverage.missingAnniversary}
            muted={reminderCoverage.mutedAnniversary}
            missingLabel="have no wedding anniversary date on record"
            mutedLabel="have anniversary reminders switched off"
            fixPath={ROUTES.employeeMaster}
          />
        </SectionCard>

        <SectionCard
          title="Work anniversary reminders"
          right={
            <div className="flex items-center gap-3">
              <span className="type-meta text-ink-muted hidden sm:inline">
                {workAnniversaryReminders.length} · {formatDisplayDate(fromDate)} – {formatDisplayDate(toDate)}
              </span>
              <Link to={ROUTES.employeeMaster} className="text-sm text-accent hover:underline shrink-0">
                Employee Master
              </Link>
            </div>
          }
          className="scroll-mt-4"
        >
          <div id={DASH_SECTIONS.workAnniversaries} className="-scroll-mt-24" />
          {workAnniversaryReminders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              No work anniversaries in range.{" "}
              <Link to={ROUTES.employeeMaster} className="text-accent hover:underline">
                Check Date of Joining
              </Link>
              .
            </p>
          ) : (
            <DenseTable
              columns={workAnniversaryColumns}
              rows={workAnniversaryReminders}
              rowKey="id"
              onRowClick={(row) => navigate(row.path)}
            />
          )}
          <CoverageNote
            total={reminderCoverage.activeEmployees}
            missing={reminderCoverage.missingJoiningDate}
            muted={0}
            missingLabel="have no date of joining on record"
            mutedLabel=""
            fixPath={ROUTES.employeeMaster}
          />
        </SectionCard>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ChartPanel
          title="Birthdays & anniversaries"
          subtitle="Birthday · wedding · work anniversary in range"
          height={200}
          onOpen={() => scrollToDashSection(DASH_SECTIONS.birthdays)}
        >
          {chartData.celebrationsDonut.length ? (
            <DonutChart
              data={chartData.celebrationsDonut}
              height={200}
              centerValue={birthdayCount + anniversaryCount + workAnniversaryCount}
              centerLabel="Total"
              formatter={countTick}
              onSliceClick={(slice) => followDashboardTarget(celebrationSliceTarget(slice?.name), navigate)}
            />
          ) : (
            <ChartEmpty message="No birthdays or anniversaries in selected range" />
          )}
        </ChartPanel>

        <ChartPanel
          title="Leave workflow"
          subtitle="Pending · approved · rejected"
          height={200}
          onOpen={() => navigate(ROUTES.leaveApprovals)}
        >
          {chartData.leaveDonut.length ? (
            <DonutChart
              data={chartData.leaveDonut}
              height={200}
              centerValue={leaveCounts.pending ?? 0}
              centerLabel="Pending"
              formatter={countTick}
              onSliceClick={() => navigate(ROUTES.leaveApprovals)}
            />
          ) : (
            <ChartEmpty message="No leave requests yet" />
          )}
        </ChartPanel>

        <ChartPanel
          title="Tour workflow"
          subtitle="Travel request status"
          height={200}
          onOpen={() => navigate(ROUTES.tourApprovals)}
        >
          {chartData.tourDonut.length ? (
            <DonutChart
              data={chartData.tourDonut}
              height={200}
              centerValue={tourCounts.pending ?? 0}
              centerLabel="Pending"
              formatter={countTick}
              onSliceClick={() => navigate(ROUTES.tourApprovals)}
            />
          ) : (
            <ChartEmpty message="No tour requests yet" />
          )}
        </ChartPanel>

        <ChartPanel
          title="Reminder priority"
          subtitle="High · medium · info"
          height={200}
          onOpen={() => scrollToDashSection(DASH_SECTIONS.remindersFeed)}
        >
          {chartData.priorityDonut.length ? (
            <DonutChart
              data={chartData.priorityDonut}
              height={200}
              centerValue={remindersFeed.length}
              centerLabel="Total"
              formatter={countTick}
              onSliceClick={() => scrollToDashSection(DASH_SECTIONS.remindersFeed)}
            />
          ) : (
            <ChartEmpty message="No reminders in selected range" />
          )}
        </ChartPanel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <ChartPanel
          title="Leave clearance"
          subtitle="Approved share of all requests"
          height={220}
          onOpen={() => navigate(ROUTES.leaveApprovals)}
        >
          <RadialScoreChart
            value={chartData.leaveClearancePct}
            max={100}
            label="Approved"
            color={CHART_SERIES[5]}
            onClick={() => navigate(ROUTES.leaveApprovals)}
          />
        </ChartPanel>

        <ChartPanel
          title="Birthdays by day"
          subtitle="Count per day in range"
          height={220}
          className="lg:col-span-2"
          onOpen={() => scrollToDashSection(DASH_SECTIONS.birthdays)}
        >
          {chartData.birthdayByDay.some((d) => d.birthdays > 0) ? (
            <AreaTrendChart
              data={chartData.birthdayByDay}
              xKey="name"
              series={[{ key: "birthdays", name: "Birthdays", color: CHART_SERIES[1] }]}
              height={200}
              yTickFormatter={countTick}
              formatter={countTick}
              onPointClick={() => scrollToDashSection(DASH_SECTIONS.birthdays)}
            />
          ) : (
            <ChartEmpty message="No birthdays in selected range" />
          )}
        </ChartPanel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartPanel
          title="Reminders in range"
          subtitle="Birthdays · wedding · work · leaves · alerts by day"
          height={240}
          onOpen={() => scrollToDashSection(DASH_SECTIONS.remindersFeed)}
        >
          {chartData.timeline.some((d) => d.total > 0) ? (
            <AreaTrendChart
              data={chartData.timeline}
              xKey="name"
              series={[
                { key: "birthdays", name: "Birthdays", color: CHART_SERIES[1] },
                { key: "anniversaries", name: "Wedding ann.", color: CHART_SERIES[5] },
                { key: "workAnniversaries", name: "Work ann.", color: CHART_SERIES[0] },
                { key: "leaves", name: "Leaves", color: CHART_SERIES[3] },
                { key: "alerts", name: "Alerts", color: CHART_SERIES[2] },
              ]}
              height={220}
              yTickFormatter={countTick}
              formatter={countTick}
              onPointClick={() => scrollToDashSection(DASH_SECTIONS.remindersFeed)}
            />
          ) : (
            <ChartEmpty message="No reminder activity in selected dates" />
          )}
        </ChartPanel>

        <ChartPanel
          title="Reminders by type"
          subtitle="Click a bar to jump to the section or page"
          height={240}
          onOpen={() => scrollToDashSection(DASH_SECTIONS.remindersFeed)}
        >
          {chartData.reminderTypeBar.length ? (
            <BarCompareChart
              data={chartData.reminderTypeBar}
              layout="horizontal"
              height={220}
              yTickFormatter={countTick}
              formatter={countTick}
              onBarClick={(bar) => followDashboardTarget(reminderTypeTarget(bar?.name), navigate)}
            />
          ) : (
            <ChartEmpty message="No reminders to show" />
          )}
        </ChartPanel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartPanel
          title="Headcount by department"
          subtitle="Active employees"
          height={240}
          onOpen={() => navigate(ROUTES.employeeMaster)}
        >
          {chartData.deptBar.length ? (
            <BarCompareChart
              data={chartData.deptBar}
              layout="horizontal"
              height={220}
              categoryWidth={100}
              yTickFormatter={countTick}
              formatter={countTick}
              onBarClick={() => navigate(ROUTES.employeeMaster)}
            />
          ) : (
            <ChartEmpty message="No active employees in master" />
          )}
        </ChartPanel>

        <ChartPanel
          title="Leave types in range"
          subtitle="Requests by leave type"
          height={240}
          onOpen={() => navigate(ROUTES.leaveManagement)}
        >
          {chartData.leaveTypeBar.length ? (
            <BarCompareChart
              data={chartData.leaveTypeBar}
              layout="horizontal"
              height={220}
              categoryWidth={88}
              yTickFormatter={countTick}
              formatter={countTick}
              onBarClick={() => navigate(ROUTES.leaveApprovals)}
            />
          ) : (
            <ChartEmpty message="No leave requests in selected dates" />
          )}
        </ChartPanel>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <SectionCard
          title="Reminders & alerts"
          right={
            <div className="flex items-center gap-3">
              <span className="type-meta text-ink-muted hidden sm:inline">
                {remindersFeed.length} · {formatDisplayDate(fromDate)} – {formatDisplayDate(toDate)}
              </span>
              <Link to={ROUTES.alerts} className="text-sm text-accent hover:underline shrink-0">
                Alerts page
              </Link>
            </div>
          }
          className="lg:col-span-2 scroll-mt-4"
        >
          <div id={DASH_SECTIONS.remindersFeed} className="-scroll-mt-24" />
          {remindersFeed.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              {needle ? (
                "No reminders match your search."
              ) : (
                <>
                  No reminders in this date range. Check{" "}
                  <Link to={ROUTES.employeeMaster} className="text-accent hover:underline">
                    Employee Master
                  </Link>{" "}
                  or{" "}
                  <Link to={ROUTES.alerts} className="text-accent hover:underline">
                    Alerts
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <DenseTable
              columns={reminderColumns}
              rows={remindersFeed}
              rowKey="id"
              onRowClick={(row) => navigate(row.path)}
            />
          )}
        </SectionCard>

        <SectionCard title="Admin modules" right={<span className="type-meta text-ink-muted">Jump to a task</span>}>
          <ul className="divide-y divide-border">
            {MODULE_SHORTCUTS.map((m) => (
              <li key={m.path}>
                <Link
                  to={m.path}
                  className="flex flex-col gap-0.5 py-3 px-1 hover:bg-surface-muted/60 rounded-md transition-colors"
                >
                  <span className="text-sm font-medium text-ink">{m.label}</span>
                  <span className="type-meta text-ink-muted">{m.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {pendingLeaves.length > 0 && (
        <SectionCard
          title="Leave approval queue"
          right={
            <Link to={ROUTES.leaveApprovals} className="text-sm text-accent hover:underline">
              View all
            </Link>
          }
          className="scroll-mt-4"
        >
          <div id={DASH_SECTIONS.leaveQueue} className="-scroll-mt-24" />
          <DenseTable
            columns={[
              { key: "employee_code", label: "Code" },
              {
                key: "employee_name",
                label: "Employee",
                render: (r) => leaveDisplayName(r),
              },
              {
                key: "leave_type_code",
                label: "Type",
                render: (r) => r.leave_type_code || "—",
              },
              {
                key: "from_date",
                label: "From",
                render: (r) => formatDisplayDate(r.from_date),
              },
              {
                key: "to_date",
                label: "To",
                render: (r) => formatDisplayDate(r.to_date),
              },
              {
                key: "days",
                label: "Days",
                render: (r) => r.days ?? "—",
              },
            ]}
            rows={pendingLeaves}
            rowKey="id"
            onRowClick={() => navigate(ROUTES.leaveApprovals)}
          />
        </SectionCard>
      )}
    </div>
  );
}

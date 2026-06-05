import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  Badge,
  Drawer,
  Modal,
  StatusChip,
  LinkedChip,
  Timeline,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import {
  fetchAttendancePunchesPage,
  fetchAttendancePunchesInRange,
  isoDateToday,
  mapDbPunchToViewRow,
  resolveAttendanceEmpCodeFilter,
} from "../../../lib/attendanceDaily";
import {
  enrichRawPunchesWithDayInOut,
  fetchRawPunchesDailySummaryPage,
} from "../../../lib/attendanceReports";
import { pairPunchesToDailyRows } from "../../../lib/attendanceDaily";
import {
  ATTENDANCE_PUNCH_TABLE,
  ATTENDANCE_UPSERT_CHUNK,
  addDaysToIsoDate,
  dedupePunchDbRows,
  mapApiPunchToDbRow,
} from "../../../../shared/attendancePunchSync.mjs";
import {
  mockEmployees,
  mockOnboarding,
  mockPermissions,
  mockComplianceRows,
  mockSalaryInputs,
  mockExits,
} from "../data/mockAdminData";
import { apiUrl, fetchApiHealth, fetchAttendanceApiStatus } from "../../../lib/apiBase";

const tabs = ["Personal", "Employment", "Salary", "Compliance", "Documents", "Leave", "Attendance", "Exit status"];

export function EmployeeMasterPage() {
  const [drawer, setDrawer] = useState(null);
  const [tab, setTab] = useState("Personal");
  const [modal, setModal] = useState(false);

  const cols = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "department", label: "Department" },
    { key: "designation", label: "Designation" },
    { key: "manager", label: "Manager" },
    { key: "joiningDate", label: "Joining" },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusChip label={r.status} severity={r.status.includes("Exit") ? "high" : "info"} />,
    },
    { key: "salaryBand", label: "Salary (summary)" },
    {
      key: "compliance",
      label: "Compliance",
      render: (r) => <span className={r.compliance.includes("Gap") ? "text-amber-700 font-medium" : ""}>{r.compliance}</span>,
    },
  ];

  return (
    <>
      <SectionCard
        title="Employee Master — IFSPL / IEVPL in-house"
        right={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setModal(true)} className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-medium">
              Add employee
            </button>
            <button type="button" className="h-8 px-3 rounded-lg border border-gray-300 text-xs">
              Export
            </button>
          </div>
        }
      >
        <FilterBar>
          <TinyInput placeholder="Search code / name" className="min-w-[180px]" />
          <TinySelect className="min-w-[100px]">
            <option>All companies</option>
            <option>IFSPL</option>
            <option>IEVPL</option>
          </TinySelect>
          <TinySelect className="min-w-[120px]">
            <option>All departments</option>
            <option>Admin</option>
            <option>Fire Ops</option>
          </TinySelect>
          <TinySelect className="min-w-[110px]">
            <option>All status</option>
            <option>Active</option>
            <option>Probation</option>
            <option>Notice</option>
          </TinySelect>
        </FilterBar>
        <div className="mt-3">
          <DenseTable columns={cols} rows={mockEmployees} onRowClick={setDrawer} />
        </div>
      </SectionCard>

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawer ? `${drawer.name} · ${drawer.code}` : ""}
        widthClass="max-w-xl"
      >
        {drawer && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-2 py-1 rounded text-[11px] border ${
                    tab === t ? "bg-blue-50 border-blue-200 text-blue-900" : "border-gray-200 text-gray-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="text-xs space-y-2 text-gray-700">
              {tab === "Personal" && (
                <>
                  <p>
                    <span className="text-gray-500">Contact:</span> {drawer.phone} · {drawer.email}
                  </p>
                  <p>
                    <span className="text-gray-500">Address:</span> On file — verify Aadhaar seed address
                  </p>
                </>
              )}
              {tab === "Employment" && (
                <>
                  <p>Company: {drawer.company}</p>
                  <p>Department / designation: {drawer.department} · {drawer.designation}</p>
                  <p>Reporting: {drawer.manager}</p>
                  <LinkedChip label="Onboarding file" toHint="Onboarding" />
                </>
              )}
              {tab === "Salary" && <p>Structure: {drawer.salaryBand} — full breakdown in payroll core (export-ready view in Salary Inputs).</p>}
              {tab === "Compliance" && <p>{drawer.compliance} — open Compliance & Documents for checklist.</p>}
              {tab === "Documents" && (
                <ul className="list-disc pl-4 space-y-1">
                  <li>Offer + appointment</li>
                  <li>ID proofs</li>
                  <li>Bank + statutory</li>
                </ul>
              )}
              {tab === "Leave" && <LinkedChip label="Open leave workflow" toHint="Leaves" />}
              {tab === "Attendance" && (
                <div className="flex flex-wrap gap-2">
                  <LinkedChip label="Daily register" toHint="Daily Attendance Register" />
                  <LinkedChip label="Raw punches" toHint="Raw Attendance Data" />
                </div>
              )}
              {tab === "Exit status" && <LinkedChip label="Exit & F&F" toHint="linked clearance" />}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Document checklist</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {["Aadhaar", "PAN", "Bank", "PF", "Medical", "NDA"].map((d) => (
                  <label key={d} className="flex items-center gap-2 border rounded px-2 py-1">
                    <input type="checkbox" defaultChecked={d !== "Medical"} />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <button type="button" className="text-xs text-blue-700 font-medium">
              Status history (audit)
            </button>
          </div>
        )}
      </Drawer>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Add employee (draft)"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="h-8 px-3 rounded border text-xs" onClick={() => setModal(false)}>
              Cancel
            </button>
            <button type="button" className="h-8 px-3 rounded bg-[#1F3A8A] text-white text-xs">
              Save draft
            </button>
          </div>
        }
      >
        <div className="space-y-2 text-xs">
          <TinyInput placeholder="Full name" className="w-full" />
          <TinySelect className="w-full">
            <option>IFSPL</option>
            <option>IEVPL</option>
          </TinySelect>
          <TinyInput placeholder="Department" className="w-full" />
          <p className="text-gray-500">Code generation, appointment, and compliance tasks route to Onboarding after save.</p>
        </div>
      </Modal>
    </>
  );
}

export function EmployeeOnboardingPage() {
  const cols = [
    { key: "name", label: "Joiner" },
    { key: "company", label: "Co." },
    { key: "stage", label: "Stage" },
    { key: "pct", label: "%", render: (r) => `${r.pct}%` },
    { key: "pending", label: "Pending" },
    {
      key: "activation",
      label: "Activation",
      render: (r) => <StatusChip label={r.activation ? "Live" : "Hold"} severity={r.activation ? "info" : "warning"} />,
    },
  ];
  return (
    <SectionCard title="Onboarding workflow" right={<Badge tone="bg-blue-50 text-blue-800">Stage-gated</Badge>}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3 text-xs">
        {["Create", "Documents", "Code & appointment", "Salary & compliance", "Induction", "Activation"].map((s, i) => (
          <div key={s} className={`rounded-lg border px-2 py-2 ${i < 3 ? "bg-emerald-50 border-emerald-100" : "bg-white border-gray-200"}`}>
            <p className="font-semibold text-gray-800">{s}</p>
            <p className="text-[11px] text-gray-500">Checklist + owner</p>
          </div>
        ))}
      </div>
      <DenseTable columns={cols} rows={mockOnboarding} />
      <p className="text-[11px] text-gray-500 mt-2">Ties to Employee Master, Compliance, and Salary Inputs when activation flips on.</p>
    </SectionCard>
  );
}

const ATTENDANCE_TABLE = ATTENDANCE_PUNCH_TABLE;
const ATTENDANCE_PAGE_SIZES = [25, 50, 100, 200];
const SYNC_OVERLAP_DAYS = 2;
const ATTENDANCE_SORT_OPTIONS = [
  { value: "punchDateTime", label: "Punch date/time" },
  { value: "empCode", label: "Emp code" },
  { value: "employeeName", label: "Employee" },
];

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function formatAttendanceApiError(err, res, data) {
  if (err?.name === "AbortError") {
    return "eTimeOffice request timed out. Try a single date or fewer employees, then sync again.";
  }
  const msg = String(err?.message || data?.message || "").trim();
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return [
      "Cannot reach the ERP API server (eTimeOffice proxy).",
      "Run `npm run dev` (starts Vite + Node on port 8787) or `npm run server` in a separate terminal.",
      "Ensure `.env.server` includes ETIME_AUTH_CREDENTIALS (see `.env.server.example`).",
      import.meta.env.DEV
        ? "In dev, the app calls /api via the Vite proxy — both processes must be running."
        : "In production, set VITE_API_BASE_URL to your deployed Node server URL and redeploy the frontend.",
    ].join(" ");
  }
  if (res?.status === 500 && /ETIME_AUTH_CREDENTIALS/i.test(msg)) {
    return `${msg} Add ETIME_* variables to .env.server and restart the Node server.`;
  }
  if (res?.status === 502 || /cannot reach etimeoffice|eTimeOffice network/i.test(msg)) {
    return msg || "Cannot reach eTimeOffice. Check network/firewall/VPN and .env.server credentials.";
  }
  return msg || "Unable to sync attendance punches from eTimeOffice.";
}

async function upsertAttendanceRows(rows) {
  const { rows: uniqueRows, collisionCount, inputCount, uniqueCount } = dedupePunchDbRows(rows);
  if (collisionCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[attendance-sync] ${collisionCount} punch_key collision(s) in batch of ${inputCount}; kept ${uniqueCount} unique row(s).`
    );
  }
  for (let i = 0; i < uniqueRows.length; i += ATTENDANCE_UPSERT_CHUNK) {
    const chunk = uniqueRows.slice(i, i + ATTENDANCE_UPSERT_CHUNK);
    const { error } = await supabase.from(ATTENDANCE_TABLE).upsert(chunk, { onConflict: "punch_key" });
    if (error) throw error;
  }
  return { stored: uniqueRows.length, apiRows: rows.length, collisions: collisionCount };
}

export function EmployeeAttendanceInputsPage() {
  const [selectedDate, setSelectedDate] = useState(isoDateToday());
  const [empCode, setEmpCode] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState("daily");
  const [sortKey, setSortKey] = useState("punchDateTime");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [apiConnection, setApiConnection] = useState({
    checking: true,
    reachable: false,
    etimeConfigured: false,
    message: "",
    baseUrl: "",
    punchEndpoint: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setApiConnection((prev) => ({ ...prev, checking: true }));
      const health = await fetchApiHealth();
      if (cancelled) return;
      if (!health.ok) {
        setApiConnection({
          checking: false,
          reachable: false,
          etimeConfigured: false,
          message: health.error || `API health check failed (${health.status || "offline"}).`,
          baseUrl: "",
          punchEndpoint: "",
        });
        return;
      }
      const status = await fetchAttendanceApiStatus();
      if (cancelled) return;
      if (!status.ok || !status.data?.etimeConfigured) {
        setApiConnection({
          checking: false,
          reachable: true,
          etimeConfigured: false,
          message:
            status.data?.message ||
            status.error ||
            "Node server is up but eTimeOffice credentials are missing on the server.",
          baseUrl: status.data?.baseUrl || "",
          punchEndpoint: status.data?.punchEndpoint || "",
        });
        return;
      }
      setApiConnection({
        checking: false,
        reachable: true,
        etimeConfigured: true,
        message: "",
        baseUrl: status.data?.baseUrl || "",
        punchEndpoint: status.data?.punchEndpoint || "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAttendanceFromTable = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const codeFilter = resolveAttendanceEmpCodeFilter(empCode);
      if (viewMode === "daily") {
        const result = await fetchRawPunchesDailySummaryPage(supabase, {
          fromDate: selectedDate,
          toDate: selectedDate,
          empCode: codeFilter,
          page,
          pageSize,
          search: searchDebounced,
        });
        setRows(result.rows);
        setTotalCount(result.total);
        setSummary((prev) => ({
          ...(prev || {}),
          source: "Supabase",
          selectedDate,
          count: result.total,
          tablePage: result.page,
          viewMode: "daily",
        }));
      } else {
        const [result, allForDay] = await Promise.all([
          fetchAttendancePunchesPage(supabase, {
            fromDate: selectedDate,
            toDate: selectedDate,
            empCode: codeFilter,
            page,
            pageSize,
            search: searchDebounced,
            sortKey,
            sortDir,
          }),
          fetchAttendancePunchesInRange(supabase, {
            fromDate: selectedDate,
            toDate: selectedDate,
            empCode: codeFilter,
          }),
        ]);
        setRows(enrichRawPunchesWithDayInOut(result.rows, pairPunchesToDailyRows(allForDay)));
        setTotalCount(result.total);
        setSummary((prev) => ({
          ...(prev || {}),
          source: "Supabase",
          selectedDate,
          count: result.total,
          tablePage: result.page,
          viewMode: "detail",
        }));
      }
    } catch (err) {
      setRows([]);
      setTotalCount(0);
      const msg = err?.message || "Unable to fetch attendance punches from Supabase.";
      setError(
        msg.includes("erp_attendance_punches") || err?.code === "PGRST205"
          ? "Attendance table is missing. Run the Supabase migration for erp_attendance_punches, then reload."
          : msg
      );
    } finally {
      setLoading(false);
    }
  }, [empCode, page, pageSize, searchDebounced, selectedDate, sortDir, sortKey, viewMode]);

  const syncAttendanceFromApi = useCallback(async () => {
    const syncFromDate = addDaysToIsoDate(selectedDate, -SYNC_OVERLAP_DAYS);
    const params = new URLSearchParams({
      empCode: resolveAttendanceEmpCodeFilter(empCode),
      fromDate: syncFromDate,
      toDate: selectedDate,
    });
    setSyncing(true);
    setError("");
    try {
      if (!apiConnection.etimeConfigured && !apiConnection.checking) {
        throw new Error(
          apiConnection.message ||
            "eTimeOffice API is not configured. Fix server env (ETIME_AUTH_CREDENTIALS) and restart Node."
        );
      }
      const res = await fetch(apiUrl(`/api/admin/attendance/punches?${params.toString()}`));
      const data = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(formatAttendanceApiError(null, res, data));
      }
      const apiRecords = Array.isArray(data?.records) ? data.records : [];
      const dbRows = apiRecords.map((record, index) => mapApiPunchToDbRow(record, index));
      const rowsToStore = dbRows.filter((row) => row.punch_date && row.employee_code);
      const skipped = dbRows.length - rowsToStore.length;
      const upsertResult = rowsToStore.length ? await upsertAttendanceRows(rowsToStore) : { stored: 0, apiRows: 0, collisions: 0 };
      setSummary({
        ...data,
        source: "Supabase",
        syncFromDate,
        syncToDate: selectedDate,
        apiCount: apiRecords.length,
        syncedCount: upsertResult.stored,
        skippedNoDateOrEmp: skipped,
        dedupeCollisions: upsertResult.collisions,
        message: upsertResult.stored
          ? `${upsertResult.stored} punch row(s) stored (${syncFromDate} → ${selectedDate}, overlap ${SYNC_OVERLAP_DAYS} day(s)).`
          : data?.message || "No punch rows with a valid date and employee code to store.",
      });
      const result = await fetchAttendancePunchesPage(supabase, {
        fromDate: selectedDate,
        toDate: selectedDate,
        empCode: resolveAttendanceEmpCodeFilter(empCode),
        page: 1,
        pageSize,
        search: searchDebounced,
        sortKey,
        sortDir,
      });
      setPage(1);
      setRows(result.rows);
      setTotalCount(result.total);
    } catch (err) {
      setError(formatAttendanceApiError(err));
    } finally {
      setSyncing(false);
    }
  }, [
    apiConnection.checking,
    apiConnection.etimeConfigured,
    apiConnection.message,
    empCode,
    pageSize,
    searchDebounced,
    selectedDate,
    sortDir,
    sortKey,
  ]);

  useEffect(() => {
    loadAttendanceFromTable();
  }, [loadAttendanceFromTable]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = totalCount ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, totalCount);

  useEffect(() => {
    setPage(1);
  }, [selectedDate, empCode, pageSize, searchDebounced, sortDir, sortKey, viewMode]);

  const tableColumns = useMemo(() => {
    if (viewMode === "daily") {
      return [
        { key: "empCode", label: "Emp code" },
        { key: "employeeName", label: "Employee" },
        { key: "department", label: "Department" },
        {
          key: "punchDate",
          label: "Punch date",
          render: (r) => formatDateDdMmYyyy(r.punchDate) || r.punchDate || "—",
        },
        { key: "punchIn", label: "Punch in" },
        { key: "punchOut", label: "Punch out" },
        {
          key: "punchCount",
          label: "Punches",
          render: (r) => r.punchCount ?? "—",
        },
        {
          key: "workedHours",
          label: "Hours",
          render: (r) => r.workedHours || "—",
        },
      ];
    }
    return [
      { key: "empCode", label: "Emp code" },
      { key: "employeeName", label: "Employee" },
      {
        key: "punchDate",
        label: "Punch date",
        render: (r) => formatDateDdMmYyyy(r.punchDate) || r.punchDate || "—",
      },
      { key: "punchTime", label: "Punch time" },
      { key: "dayPunchIn", label: "Punch in" },
      { key: "dayPunchOut", label: "Punch out" },
    ];
  }, [viewMode]);

  return (
    <SectionCard
      title="Raw attendance data (admin)"
      right={
        <StatusChip
          label={syncing ? "Syncing eTimeOffice" : loading ? "Loading Supabase" : "Supabase table"}
          severity={syncing || loading ? "warning" : "info"}
        />
      }
    >
      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Date
          <TinyInput
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-[130px] ml-1"
          />
        </label>
        <TinyInput value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="Emp code / ALL" className="w-[130px]" />
        <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="min-w-[160px]" />
        <TinySelect
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          className="min-w-[150px]"
          title="Daily: first/last punch per employee per day"
        >
          <option value="daily">Daily (in / out)</option>
          <option value="detail">All punch rows</option>
        </TinySelect>
        {viewMode === "detail" ? (
          <>
            <label className="text-[11px] text-gray-600">
              Sort
              <TinySelect value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="min-w-[145px] ml-1">
                {ATTENDANCE_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </TinySelect>
            </label>
            <TinySelect value={sortDir} onChange={(e) => setSortDir(e.target.value)} className="w-[110px]">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </TinySelect>
          </>
        ) : null}
        <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-[100px]">
          {ATTENDANCE_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </TinySelect>
        <button
          type="button"
          onClick={syncAttendanceFromApi}
          disabled={syncing || loading || apiConnection.checking || !apiConnection.etimeConfigured}
          title={
            !apiConnection.etimeConfigured && !apiConnection.checking
              ? apiConnection.message || "eTimeOffice API not ready"
              : "Fetch punches from eTimeOffice into Supabase"
          }
          className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs disabled:opacity-60"
        >
          {syncing ? "Syncing..." : "Sync eTimeOffice"}
        </button>
        <button
          type="button"
          onClick={loadAttendanceFromTable}
          disabled={syncing || loading}
          className="h-8 px-3 rounded-lg border border-gray-300 text-xs disabled:opacity-60"
        >
          {loading ? "Loading..." : "Reload table"}
        </button>
      </FilterBar>

      <p className="mt-2 text-[11px] text-gray-600 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2">
        <span className="font-medium text-blue-900">Display is from Supabase</span> (table{" "}
        <code className="text-[10px]">erp_attendance_punches</code>). eTimeOffice data is{" "}
        <span className="font-medium">not loaded automatically</span> — click{" "}
        <span className="font-medium">Sync eTimeOffice</span> to pull punches for the selected date into Supabase, then the grid reloads.
        {" "}
        <span className="font-medium">Daily view</span> shows first punch as Punch in and last as Punch out per employee per day.
      </p>

      {apiConnection.checking ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          Checking connection to eTimeOffice proxy…
        </div>
      ) : null}
      {!apiConnection.checking && !apiConnection.reachable ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 whitespace-pre-wrap">
          {apiConnection.message}
        </div>
      ) : null}
      {!apiConnection.checking && apiConnection.reachable && !apiConnection.etimeConfigured ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 whitespace-pre-wrap">
          {apiConnection.message}
        </div>
      ) : null}
      {!apiConnection.checking && apiConnection.etimeConfigured ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
          eTimeOffice proxy ready
          {apiConnection.punchEndpoint ? ` (${apiConnection.punchEndpoint})` : ""}. Use Sync to import punches for{" "}
          {selectedDate}.
        </div>
      ) : null}

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 whitespace-pre-wrap">{error}</div>}

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <DenseTable
            columns={tableColumns}
            rows={rows}
            serialOffset={(currentPage - 1) * pageSize}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
            <span>
              Showing {pageStart}-{pageEnd} of {totalCount} record(s) for {selectedDate}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-7 px-2 rounded border border-gray-300 disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-7 px-2 rounded border border-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
        <SectionCard title="eTimeOffice sync" className="!shadow-none">
          <Timeline
            items={[
              {
                title: "Source",
                meta: apiConnection.etimeConfigured
                  ? `Supabase · eTimeOffice (${apiConnection.punchEndpoint || "API"})`
                  : "Supabase table · eTimeOffice sync",
              },
              { title: "Date", meta: summary?.selectedDate || selectedDate },
              { title: "Records for date", meta: `${totalCount} total · page ${currentPage} (${rows.length} shown)` },
              { title: "Last API sync", meta: summary?.syncedCount != null ? `${summary.syncedCount} stored` : "Not synced this session" },
            ]}
          />
          {summary?.message && <p className="text-[11px] text-gray-500 mt-3">{summary.message}</p>}
        </SectionCard>
      </div>
    </SectionCard>
  );
}

export function EmployeeAttendanceSheetsPage() {
  return (
    <SectionCard title="Attendance sheets" right={<StatusChip label="Sheet prep" severity="info" />}>
      <FilterBar>
        <TinyInput type="month" className="w-[140px]" />
        <TinySelect className="min-w-[130px]">
          <option>All companies</option>
          <option>IFSPL</option>
          <option>IEVPL</option>
        </TinySelect>
        <TinySelect className="min-w-[130px]">
          <option>All sites</option>
        </TinySelect>
        <button type="button" className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs">
          Generate sheet
        </button>
      </FilterBar>
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <DenseTable
            columns={[
              { key: "sheet", label: "Sheet" },
              { key: "period", label: "Period" },
              { key: "source", label: "Source" },
              { key: "status", label: "Status" },
            ]}
            rows={[
              { id: "monthly", sheet: "Monthly attendance sheet", period: "Current month", source: "Raw Attendance Data", status: "Draft" },
              { id: "payroll", sheet: "Payroll attendance sheet", period: "Current month", source: "Raw Attendance Data", status: "Pending review" },
            ]}
          />
        </div>
        <SectionCard title="Sheet flow" className="!shadow-none">
          <Timeline
            items={[
              { title: "Sync raw data", meta: "Raw Attendance Data" },
              { title: "Prepare sheet", meta: "Monthly employee-wise sheet" },
              { title: "Payroll handoff", meta: "Lock after review" },
            ]}
          />
        </SectionCard>
      </div>
    </SectionCard>
  );
}

export { EmployeeLeavesPage } from "./EmployeeLeaveInboxPage";

export function EmployeePermissionsPage() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SectionCard title="Pending today" className="!p-3">
          <p className="text-2xl font-bold">5</p>
        </SectionCard>
        <SectionCard title="Currently out" className="!p-3">
          <p className="text-2xl font-bold">6</p>
        </SectionCard>
        <SectionCard title="Over-duration" className="!p-3">
          <p className="text-2xl font-bold text-amber-700">2</p>
        </SectionCard>
        <SectionCard title="Hours impact (est.)" className="!p-3">
          <p className="text-2xl font-bold">11.5h</p>
        </SectionCard>
      </div>
      <SectionCard title="Permission / short leave" right={<button className="text-xs text-blue-700 font-medium">New request</button>}>
        <DenseTable
          columns={[
            { key: "date", label: "Date" },
            { key: "emp", label: "Employee" },
            { key: "kind", label: "Kind" },
            { key: "hrs", label: "Hours" },
            { key: "mgr", label: "Manager" },
            { key: "admin", label: "Admin" },
          ]}
          rows={mockPermissions}
          rowKey="id"
        />
      </SectionCard>
    </div>
  );
}

export function EmployeeCompliancePage() {
  return (
    <SectionCard title="Compliance & documents" right={<button className="h-8 px-2 rounded border text-xs">Missing docs filter</button>}>
      <FilterBar>
        <TinySelect>
          <option>All completeness</option>
          <option>Missing any</option>
          <option>Expiring soon</option>
        </TinySelect>
        <TinyInput placeholder="Employee" className="min-w-[140px]" />
      </FilterBar>
      <div className="mt-2">
        <DenseTable
          columns={[
            { key: "emp", label: "Employee" },
            ...["aadhaar", "pan", "bank", "pf", "esic", "uan", "nominee"].map((k) => ({
              key: k,
              label: k.toUpperCase(),
              render: (r) => {
                const v = r[k];
                const sev = v === "OK" || v === "NA" ? "info" : "warning";
                return <StatusChip label={v} severity={sev} />;
              },
            })),
          ]}
          rows={mockComplianceRows}
          rowKey="id"
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-2">Expiry / reupload alerts surface in Alerts & Notifications.</p>
    </SectionCard>
  );
}

export function EmployeeSalaryInputsPage() {
  return (
    <div className="max-w-6xl">
    <SectionCard title="Salary inputs" right={<Badge tone="bg-gray-100 text-gray-700">Export-ready</Badge>}>
      <FilterBar>
        <TinyInput type="month" className="w-[140px]" defaultValue="2025-03" />
        <TinySelect>
          <option>All employees</option>
        </TinySelect>
        <button type="button" className="h-8 px-3 rounded border text-xs">
          Pull from attendance
        </button>
      </FilterBar>
      <div className="mt-2">
        <DenseTable
          columns={[
            { key: "emp", label: "Employee" },
            { key: "month", label: "Month" },
            { key: "unpaidLeave", label: "UL days" },
            { key: "corrections", label: "Corr." },
            { key: "deductions", label: "Deductions" },
            { key: "advanceRec", label: "Adv. rec." },
            { key: "remarks", label: "Remarks" },
          ]}
          rows={mockSalaryInputs}
          rowKey="id"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <LinkedChip label="Attendance corrections" toHint="Raw Attendance Data" />
        <LinkedChip label="Leave / LOP" toHint="Leaves" />
      </div>
    </SectionCard>
    </div>
  );
}

export function EmployeeExitPage() {
  return (
    <SectionCard title="Exit & full & final" right={<StatusChip label="Cross-module" severity="high" />}>
      <div className="flex flex-wrap gap-1 mb-3">
        {["Resignation", "Clearance", "Asset recovery", "Compliance closure", "F&F inputs"].map((t) => (
          <button key={t} type="button" className="px-2 py-1 rounded border border-gray-200 text-[11px] bg-white hover:bg-gray-50">
            {t}
          </button>
        ))}
      </div>
      <DenseTable
        columns={[
          { key: "emp", label: "Employee" },
          { key: "resignDate", label: "Resignation" },
          { key: "notice", label: "Notice" },
          { key: "lwd", label: "LWD" },
          { key: "clearance", label: "Clearance" },
          { key: "gate", label: "Gate / access" },
          { key: "fnf", label: "F&F" },
        ]}
        rows={mockExits}
        rowKey="id"
      />
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-gray-200 p-2 bg-gray-50/80">
          <p className="font-semibold text-gray-800 mb-1">Linked actions</p>
          <ul className="space-y-1 list-disc pl-4 text-gray-700">
            <li>Store recovery — Return Entry / issue reference</li>
            <li>Gate access closure — Employee Movement / Security</li>
            <li>Attendance freeze - Raw Attendance Data</li>
            <li>Salary finalization — Salary Inputs</li>
          </ul>
        </div>
        <div className="rounded-lg border border-amber-200 p-2 bg-amber-50/50">
          <p className="font-semibold text-amber-900 mb-1">Blocking reasons (sample)</p>
          <p>PPE set not returned — linked to store issue #IS-8821</p>
        </div>
      </div>
    </SectionCard>
  );
}



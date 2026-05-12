import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  mockEmployees,
  mockOnboarding,
  mockLeaveRequests,
  mockPermissions,
  mockComplianceRows,
  mockSalaryInputs,
  mockExits,
} from "../data/mockAdminData";

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
              {tab === "Attendance" && <LinkedChip label="Raw data" toHint="Raw Attendance Data" />}
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

const DEFAULT_ATTENDANCE_FROM = "2024-01-01";
const DEFAULT_ATTENDANCE_TO = "2026-05-12";
const ATTENDANCE_TABLE = "erp_attendance_punches";
const ATTENDANCE_TABLE_LIMIT = 1000;
const ATTENDANCE_UPSERT_CHUNK = 500;
const ATTENDANCE_PAGE_SIZES = [25, 50, 100, 200];
const ATTENDANCE_SORT_OPTIONS = [
  { value: "punchDateTime", label: "Punch date/time" },
  { value: "empCode", label: "Emp code" },
  { value: "employeeName", label: "Employee" },
  { value: "deviceName", label: "Device" },
  { value: "status", label: "Status" },
];

function normalizeDbDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function normalizeDbTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\b(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
}

function makePunchKey(record, index = 0) {
  const date = normalizeDbDate(record.punchDate) || "no-date";
  const time = normalizeDbTime(record.punchTime || record.punchDate) || "no-time";
  const parts = [
    record.empCode || "no-emp",
    date,
    time,
    record.deviceName || "no-device",
    record.direction || "no-direction",
    record.status || "no-status",
  ];
  if (date === "no-date" || time === "no-time") parts.push(String(index));
  return parts.join("|").toLowerCase();
}

function mapApiPunchToDbRow(record, index) {
  const now = new Date().toISOString();
  return {
    punch_key: makePunchKey(record, index),
    emp_code: String(record.empCode || "").trim(),
    employee_name: String(record.employeeName || "").trim() || null,
    punch_date: normalizeDbDate(record.punchDate),
    punch_time: normalizeDbTime(record.punchTime || record.punchDate),
    device_name: String(record.deviceName || "").trim() || null,
    direction: String(record.direction || "").trim() || null,
    status: String(record.status || "").trim() || null,
    source: "eTimeOffice",
    source_payload: record.sourcePayload || record,
    synced_at: now,
    updated_at: now,
  };
}

function mapDbPunchToViewRow(row) {
  const sourcePunchDate = row.source_payload?.PunchDate || row.source_payload?.PunchDateTime || "";
  const punchTime = row.punch_time || normalizeDbTime(sourcePunchDate);
  return {
    id: row.id || row.punch_key,
    empCode: row.emp_code || "",
    employeeName: row.employee_name || "",
    punchDate: row.punch_date || "",
    punchTime: punchTime ? String(punchTime).slice(0, 5) : "",
    deviceName: row.device_name || "",
    direction: row.direction || "",
    status: row.status || "",
    syncedAt: row.synced_at || "",
  };
}

function getAttendanceSortValue(row, sortKey) {
  if (sortKey === "punchDateTime") return `${row.punchDate || ""} ${row.punchTime || ""}`;
  return String(row[sortKey] || "").toLowerCase();
}

async function upsertAttendanceRows(rows) {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.punch_key, row])).values());
  for (let i = 0; i < uniqueRows.length; i += ATTENDANCE_UPSERT_CHUNK) {
    const chunk = uniqueRows.slice(i, i + ATTENDANCE_UPSERT_CHUNK);
    const { error } = await supabase.from(ATTENDANCE_TABLE).upsert(chunk, { onConflict: "punch_key" });
    if (error) throw error;
  }
  return uniqueRows.length;
}

export function EmployeeAttendanceInputsPage() {
  const [fromDate, setFromDate] = useState(DEFAULT_ATTENDANCE_FROM);
  const [toDate, setToDate] = useState(DEFAULT_ATTENDANCE_TO);
  const [empCode, setEmpCode] = useState("ALL");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sortKey, setSortKey] = useState("punchDateTime");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const loadAttendanceFromTable = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let query = supabase
        .from(ATTENDANCE_TABLE)
        .select("id,punch_key,emp_code,employee_name,punch_date,punch_time,device_name,direction,status,synced_at,source_payload")
        .order("punch_date", { ascending: false, nullsFirst: false })
        .order("punch_time", { ascending: false, nullsFirst: false })
        .limit(ATTENDANCE_TABLE_LIMIT);

      if (fromDate) query = query.gte("punch_date", fromDate);
      if (toDate) query = query.lte("punch_date", toDate);
      if (empCode.trim() && empCode.trim().toUpperCase() !== "ALL") {
        query = query.eq("emp_code", empCode.trim());
      }

      const { data, error: tableError } = await query;
      if (tableError) throw tableError;
      setRows((data || []).map(mapDbPunchToViewRow));
      setSummary((prev) => ({
        ...(prev || {}),
        source: "Supabase",
        fromDate,
        toDate,
        count: data?.length || 0,
      }));
    } catch (err) {
      setRows([]);
      const msg = err?.message || "Unable to fetch attendance punches from Supabase.";
      setError(
        msg.includes("erp_attendance_punches") || err?.code === "PGRST205"
          ? "Attendance table is missing. Run the Supabase migration for erp_attendance_punches, then reload."
          : msg
      );
    } finally {
      setLoading(false);
    }
  }, [empCode, fromDate, toDate]);

  const syncAttendanceFromApi = useCallback(async () => {
    const params = new URLSearchParams({
      empCode: empCode.trim() || "ALL",
      fromDate,
      toDate,
    });
    setSyncing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/attendance/punches?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || `Attendance fetch failed (${res.status})`);
      }
      const dbRows = (Array.isArray(data?.records) ? data.records : []).map(mapApiPunchToDbRow);
      const storedCount = dbRows.length ? await upsertAttendanceRows(dbRows) : 0;
      setSummary({
        ...data,
        source: "Supabase",
        syncedCount: storedCount,
        message: storedCount ? `${storedCount} unique API punch row(s) stored in Supabase.` : data?.message || "No API punch rows found.",
      });
      await loadAttendanceFromTable();
    } catch (err) {
      setError(err?.message || "Unable to sync attendance punches.");
    } finally {
      setSyncing(false);
    }
  }, [empCode, fromDate, loadAttendanceFromTable, toDate]);

  useEffect(() => {
    loadAttendanceFromTable();
  }, [loadAttendanceFromTable]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.empCode, row.employeeName, row.punchDate, row.punchTime, row.deviceName, row.direction, row.status]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const av = getAttendanceSortValue(a, sortKey);
      const bv = getAttendanceSortValue(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = sortedRows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, sortedRows.length);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedRows]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, rows.length, search, sortDir, sortKey]);

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
          From
          <TinyInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[130px] ml-1" />
        </label>
        <label className="text-[11px] text-gray-600">
          To
          <TinyInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[130px] ml-1" />
        </label>
        <TinyInput value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="Emp code / ALL" className="w-[130px]" />
        <TinyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search punches" className="min-w-[160px]" />
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
          disabled={syncing || loading}
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

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <DenseTable
            columns={[
              { key: "empCode", label: "Emp code" },
              { key: "employeeName", label: "Employee" },
              { key: "punchDate", label: "Punch date" },
              { key: "punchTime", label: "Punch time" },
              { key: "deviceName", label: "Device" },
              { key: "direction", label: "In/Out" },
              { key: "status", label: "Status" },
            ]}
            rows={pagedRows}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
            <span>
              Showing {pageStart}-{pageEnd} of {sortedRows.length} record(s)
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
              { title: "Source", meta: "Supabase table · eTimeOffice sync" },
              { title: "Range", meta: summary ? `${summary.fromDate} to ${summary.toDate}` : "Waiting for fetch" },
              { title: "Records loaded", meta: `${sortedRows.length} filtered / ${rows.length} from table` },
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

export function EmployeeLeavesPage() {
  const [approve, setApprove] = useState(null);
  const cols = [
    { key: "emp", label: "Requested by" },
    { key: "type", label: "Type" },
    { key: "from", label: "From" },
    { key: "to", label: "To" },
    { key: "mgr", label: "Manager" },
    { key: "admin", label: "Admin" },
    { key: "attendanceImpact", label: "Attendance" },
    {
      key: "payrollImpact",
      label: "Payroll",
      render: (r) => (r.payrollImpact ? <Badge tone="bg-orange-100 text-orange-900">{r.payrollImpact}</Badge> : "—"),
    },
    {
      key: "id",
      label: "",
      render: (r) => (
        <button type="button" className="text-[11px] text-blue-700 font-medium" onClick={() => setApprove(r)}>
          Validate
        </button>
      ),
    },
  ];
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        <SectionCard title="Leave inbox" className="xl:col-span-3">
          <FilterBar>
            <TinySelect>
              <option>All types</option>
              <option>Casual</option>
              <option>Sick</option>
              <option>Earned</option>
              <option>Unpaid</option>
            </TinySelect>
            <TinySelect>
              <option>Admin queue</option>
              <option>All</option>
            </TinySelect>
          </FilterBar>
          <div className="mt-2">
            <DenseTable columns={cols} rows={mockLeaveRequests} rowKey="id" />
          </div>
        </SectionCard>
        <div className="space-y-3">
          <SectionCard title="Balances (sample)">
            <DenseTable
              columns={[
                { key: "t", label: "Type" },
                { key: "b", label: "Bal" },
              ]}
              rows={[
                { id: "1", t: "Casual", b: "6" },
                { id: "2", t: "Sick", b: "8" },
                { id: "3", t: "Earned", b: "14" },
              ]}
            />
          </SectionCard>
          <SectionCard title="Calendar">
            <p className="text-xs text-gray-600">Month grid hooks to site holidays + blackout days (UI placeholder).</p>
          </SectionCard>
        </div>
      </div>
      <Modal
        open={!!approve}
        onClose={() => setApprove(null)}
        title="Admin validation — leave"
        footer={
          <div className="flex justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-gray-500">Impacts attendance → salary inputs if unpaid/LOP</span>
            <div className="flex gap-2">
              <button type="button" className="h-8 px-3 rounded border text-xs" onClick={() => setApprove(null)}>
                Reject
              </button>
              <button type="button" className="h-8 px-3 rounded bg-[#1F3A8A] text-white text-xs" onClick={() => setApprove(null)}>
                Validate & post
              </button>
            </div>
          </div>
        }
      >
        {approve && (
          <div className="text-xs space-y-2">
            <p>
              <strong>{approve.emp}</strong> · {approve.type} · {approve.from} → {approve.to}
            </p>
            <LinkedChip label="Attendance impact" toHint="marked absent / LOP" />
            <LinkedChip label="Payroll" toHint={approve.payrollImpact || "No LOP"} />
          </div>
        )}
      </Modal>
    </>
  );
}

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
    <SectionCard title="Salary inputs (admin layer)" right={<Badge tone="bg-gray-100 text-gray-700">Export-ready</Badge>}>
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

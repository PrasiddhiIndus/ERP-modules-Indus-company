import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, FileStack, RefreshCw, UserX, X } from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Drawer,
  KpiTile,
  CollapsibleHelp,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  generateAllExitDocuments,
  generateExitDocument,
  isInactiveEmployeeStatus,
  mapInactiveEmployeeRow,
} from "../../../lib/employeeExitDocuments";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const INACTIVE_SELECT_FIELDS = [
  "id",
  "employee_code",
  "full_name",
  "department",
  "designation",
  "date_of_joining",
  "date_of_leaving",
  "status",
  "status_reason",
  "status_changed_at",
  "gender",
  "address",
  "full_address",
  "location",
  "employment_type",
].join(",");

const COL_MIN = "min-w-[120px]";
const COL_NAME = "min-w-[200px]";
const COL_DATE = "min-w-[130px]";

function statusSeverity(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "left") return "high";
  return "critical";
}

function compareInactiveRows(a, b, field, direction) {
  const mul = direction === "asc" ? 1 : -1;

  if (field === "employee_code") {
    const va = String(a.employee_code || "");
    const vb = String(b.employee_code || "");
    return mul * va.localeCompare(vb, undefined, { numeric: true });
  }

  if (field === "experience_label") {
    const score = (row) =>
      (row.experience_years || 0) * 372 + (row.experience_months || 0) * 31 + (row.experience_days || 0);
    return mul * (score(a) - score(b));
  }

  if (field === "date_of_joining" || field === "date_of_resignation" || field === "date_of_leaving") {
    const va = a[field] || "";
    const vb = b[field] || "";
    if (!va && !vb) return 0;
    if (!va) return mul;
    if (!vb) return -mul;
    return mul * String(va).localeCompare(String(vb));
  }

  const va = String(a[field] || "").toLowerCase();
  const vb = String(b[field] || "").toLowerCase();
  return mul * va.localeCompare(vb);
}

export function InactiveEmployeesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("date_of_leaving");
  const [sortDirection, setSortDirection] = useState("desc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [generatingKey, setGeneratingKey] = useState("");
  const [docError, setDocError] = useState("");

  const loadInactiveEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: fetchError } = await supabase
        .from("admin_ifsp_employee_master")
        .select(INACTIVE_SELECT_FIELDS)
        .in("status", ["Inactive", "Left"])
        .order("date_of_leaving", { ascending: false, nullsFirst: false })
        .order("full_name", { ascending: true });

      if (fetchError) throw fetchError;

      const mapped = (data || [])
        .filter((row) => isInactiveEmployeeStatus(row.status))
        .map(mapInactiveEmployeeRow);

      setRows(mapped);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load inactive employees.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInactiveEmployees();
  }, [loadInactiveEmployees]);

  const departmentCount = useMemo(() => {
    const set = new Set();
    for (const row of rows) {
      if (row.department) set.add(row.department);
    }
    return set.size;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.full_name,
        row.employee_code,
        row.department,
        row.designation,
        row.status,
        row.experience_label,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => compareInactiveRows(a, b, sortField, sortDirection));
    return list;
  }, [filteredRows, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, sortField, sortDirection]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }, [sortField]);

  const sortIndicator = useCallback(
    (field) => {
      const active = sortField === field;
      const ascActive = active && sortDirection === "asc";
      const descActive = active && sortDirection === "desc";
      return (
        <span className="inline-flex flex-col ml-0.5 leading-none align-middle">
          <span className={`text-[8px] ${ascActive ? "text-accent" : "text-gray-300"}`}>▲</span>
          <span className={`text-[8px] -mt-0.5 ${descActive ? "text-accent" : "text-gray-300"}`}>▼</span>
        </span>
      );
    },
    [sortDirection, sortField]
  );

  const sortableHeader = useCallback(
    (field, label) => (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={`inline-flex items-center font-semibold text-left hover:text-accent w-full ${
          sortField === field ? "text-accent" : ""
        }`}
        title={`Sort by ${label}`}
      >
        {label}
        {sortIndicator(field)}
      </button>
    ),
    [sortField, sortIndicator, toggleSort]
  );

  const columns = useMemo(
    () => [
      {
        key: "full_name",
        label: "Name",
        headerClassName: COL_NAME,
        cellClassName: COL_NAME,
        headerRender: () => sortableHeader("full_name", "Name"),
        render: (row) => <span className="font-medium text-gray-900">{row.full_name || "—"}</span>,
      },
      {
        key: "employee_code",
        label: "Employee Code",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        headerRender: () => sortableHeader("employee_code", "Employee Code"),
        render: (row) => (
          <span className="font-mono text-[11px] tabular-nums">{row.employee_code || "—"}</span>
        ),
      },
      {
        key: "department",
        label: "Department",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        headerRender: () => sortableHeader("department", "Department"),
        render: (row) => row.department || "—",
      },
      {
        key: "designation",
        label: "Designation",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        headerRender: () => sortableHeader("designation", "Designation"),
        render: (row) => row.designation || "—",
      },
      {
        key: "date_of_joining",
        label: "DOJ",
        headerClassName: COL_DATE,
        cellClassName: COL_DATE,
        headerRender: () => sortableHeader("date_of_joining", "DOJ"),
        render: (row) => formatDateDdMmYyyy(row.date_of_joining) || "—",
      },
      {
        key: "date_of_resignation",
        label: "Date of Resignation",
        headerClassName: COL_DATE,
        cellClassName: COL_DATE,
        headerRender: () => sortableHeader("date_of_resignation", "Resignation"),
        render: (row) => formatDateDdMmYyyy(row.date_of_resignation) || "—",
      },
      {
        key: "date_of_leaving",
        label: "DOL / LWD",
        headerClassName: COL_DATE,
        cellClassName: COL_DATE,
        headerRender: () => sortableHeader("date_of_leaving", "DOL / LWD"),
        render: (row) => formatDateDdMmYyyy(row.date_of_leaving) || "—",
      },
      {
        key: "experience_label",
        label: "Total Experience",
        headerClassName: "min-w-[160px]",
        cellClassName: "min-w-[160px]",
        headerRender: () => sortableHeader("experience_label", "Experience"),
        render: (row) => <span className="text-gray-700">{row.experience_label || "—"}</span>,
      },
      {
        key: "status",
        label: "Status",
        headerClassName: "min-w-[100px]",
        cellClassName: "min-w-[100px]",
        headerRender: () => sortableHeader("status", "Status"),
        render: (row) => (
          <StatusChip label={row.status || "Inactive"} severity={statusSeverity(row.status)} />
        ),
      },
    ],
    [sortableHeader]
  );

  const handleGenerate = async (documentKey) => {
    if (!selected) return;
    setDocError("");
    setGeneratingKey(documentKey || "all");
    try {
      if (documentKey === "all") {
        await generateAllExitDocuments(selected);
      } else {
        await generateExitDocument(documentKey, selected);
      }
    } catch (err) {
      console.error(err);
      setDocError(err?.message || "Document generation failed.");
    } finally {
      setGeneratingKey("");
    }
  };

  const drawerSubtitle = selected
    ? `${selected.employee_code || "—"} · ${selected.department || "—"}`
    : "";

  const missingLeavingDateCount = rows.filter((r) => !r.date_of_leaving).length;

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-[1680px] mx-auto min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 border border-rose-100">
          <UserX className="h-5 w-5 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTaskHeader
            title="Inactive Employees"
            subtitle="Review exited staff and generate No Due Certificate, Experience Letter, and Relieving Letter from Employee Master data."
          >
            <button
              type="button"
              onClick={loadInactiveEmployees}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </PageTaskHeader>
          <CollapsibleHelp label="how this works">
            Employees appear here when status is set to <strong>Inactive</strong> or <strong>Left</strong> in Employee
            Master. Click a row to open details and generate exit documents. Use column headers to sort the list.
          </CollapsibleHelp>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile label="Inactive / Left" value={String(rows.length)} tone="border-rose-100" />
        <KpiTile
          label="With leaving date"
          value={String(rows.filter((r) => r.date_of_leaving).length)}
          tone="border-emerald-100"
          sub={missingLeavingDateCount ? `${missingLeavingDateCount} missing DOL` : undefined}
        />
        <KpiTile label="Departments" value={String(departmentCount)} tone="border-sky-100" />
        <KpiTile
          label="Showing"
          value={String(sortedRows.length)}
          tone="border-gray-100"
          sub={search ? "Filtered view" : "All records"}
        />
      </div>

      <SectionCard
        title={`Inactive employee register (${sortedRows.length})`}
        right={
          search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              <X className="h-3 w-3" />
              Clear search
            </button>
          ) : null
        }
      >
        <FilterBar>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5 flex-1 min-w-[200px]">
            Quick search
            <TinyInput
              placeholder="Name, employee code, department, designation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Sort
            <TinySelect
              value={`${sortField}:${sortDirection}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split(":");
                setSortField(field);
                setSortDirection(dir);
              }}
              className="min-w-[160px]"
            >
              <option value="date_of_leaving:desc">Leaving date (newest)</option>
              <option value="date_of_leaving:asc">Leaving date (oldest)</option>
              <option value="full_name:asc">Name (A–Z)</option>
              <option value="full_name:desc">Name (Z–A)</option>
              <option value="date_of_joining:asc">DOJ (oldest)</option>
              <option value="date_of_joining:desc">DOJ (newest)</option>
              <option value="department:asc">Department (A–Z)</option>
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Rows
            <TinySelect value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </TinySelect>
          </label>
        </FilterBar>

        {error ? (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">{error}</p>
        ) : null}

        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-gray-300 animate-spin mb-2" />
            <p className="text-xs text-gray-500">Loading inactive employees…</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="py-12 text-center">
            <UserX className="h-10 w-10 mx-auto text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-700">No matching employees</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {rows.length === 0
                ? "Employees appear here when status is set to Inactive or Left in Employee Master."
                : "Try adjusting your search."}
            </p>
            {rows.length > 0 && search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-3 text-xs font-medium text-accent hover:underline"
              >
                Clear search
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-3 min-w-0">
              <DenseTable
                columns={columns}
                rows={pageRows}
                rowKey="id"
                activeRowId={selected?.id ?? null}
                onRowClick={(row) => {
                  setSelected(row);
                  setDocError("");
                }}
                stickyHeader
                scrollMaxHeight="calc(100dvh - 20rem)"
                serialOffset={(page - 1) * pageSize}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
              <span className="tabular-nums">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedRows.length)} of{" "}
                {sortedRows.length}
                {sortedRows.length !== rows.length ? ` (${rows.length} total)` : ""}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-0.5 h-8 px-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span className="px-2 tabular-nums min-w-[88px] text-center">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-0.5 h-8 px-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </SectionCard>

      <Drawer
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setDocError("");
        }}
        title={selected?.full_name || "Employee"}
        widthClass="max-w-lg"
      >
        {selected ? (
          <div className="space-y-4 text-xs">
            {drawerSubtitle ? (
              <p className="text-[11px] text-gray-500 -mt-1 pb-2 border-b border-gray-100">{drawerSubtitle}</p>
            ) : null}

            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
              <DetailField label="Employee Code" value={selected.employee_code} />
              <DetailField
                label="Status"
                value={<StatusChip label={selected.status} severity={statusSeverity(selected.status)} />}
              />
              <DetailField label="Department" value={selected.department} />
              <DetailField label="Designation" value={selected.designation} />
              <DetailField label="Date of joining" value={formatDateDdMmYyyy(selected.date_of_joining)} />
              <DetailField label="Date of resignation" value={formatDateDdMmYyyy(selected.date_of_resignation)} />
              <DetailField label="Last working date" value={formatDateDdMmYyyy(selected.date_of_leaving)} />
              <DetailField label="Total experience" value={selected.experience_label} />
              <DetailField label="Address" value={selected.display_address} className="col-span-2" />
              {selected.status_reason ? (
                <DetailField label="Status reason" value={selected.status_reason} className="col-span-2" />
              ) : null}
            </div>

            <div className="rounded-lg border border-accent/15 bg-accent/[0.03] p-3">
              <p className="text-xs font-semibold text-gray-900 mb-1">Exit documents</p>
              <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                Original Word templates are preserved exactly. Only employee-specific fields are filled in.
              </p>

              {docError ? (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mb-2">
                  {docError}
                </p>
              ) : null}

              <div className="flex flex-col gap-2">
                <DocButton
                  label="Generate No Due Certificate"
                  loading={generatingKey === "noDueCertificate"}
                  disabled={Boolean(generatingKey)}
                  onClick={() => handleGenerate("noDueCertificate")}
                />
                <DocButton
                  label="Generate Experience Letter"
                  loading={generatingKey === "experienceLetter"}
                  disabled={Boolean(generatingKey)}
                  onClick={() => handleGenerate("experienceLetter")}
                />
                <DocButton
                  label="Generate Relieving Letter"
                  loading={generatingKey === "relievingLetter"}
                  disabled={Boolean(generatingKey)}
                  onClick={() => handleGenerate("relievingLetter")}
                />
                <button
                  type="button"
                  disabled={Boolean(generatingKey)}
                  onClick={() => handleGenerate("all")}
                  className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-deep disabled:opacity-50 mt-1"
                >
                  <FileStack className="h-4 w-4 shrink-0" />
                  {generatingKey === "all" ? "Generating all…" : "Generate All Documents"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function DetailField({ label, value, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-gray-900 mt-0.5">{value || "—"}</dd>
    </div>
  );
}

function DocButton({ label, onClick, loading, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium disabled:opacity-50 shadow-sm"
    >
      <FileDown className="h-3.5 w-3.5 shrink-0 text-gray-600" />
      {loading ? "Generating…" : label}
    </button>
  );
}

export default InactiveEmployeesPage;

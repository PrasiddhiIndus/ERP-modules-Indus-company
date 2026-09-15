/** F & F — full and final settlement worklist for exited employees. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileSpreadsheet, RefreshCw, X } from "lucide-react";
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
import { isInactiveEmployeeStatus, mapInactiveEmployeeRow } from "../../../lib/employeeExitDocuments";
import { fetchLoansAndAdvancesForEmployees } from "../../admin/employeeMaster/deductions/deductionsDb";
import { useAuth } from "../../../contexts/AuthContext";
import { canAccessSalaryAdmin } from "../salaryAdmin/salaryAccess";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const SELECT_FIELDS = [
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
  "bank_name",
  "bank_account_no",
  "ifsc_code",
].join(",");

const COL_MIN = "min-w-[120px]";
const COL_NAME = "min-w-[200px]";
const COL_DATE = "min-w-[130px]";

function formatInr(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function sumOutstanding(list) {
  return (list || []).reduce((sum, row) => {
    const status = String(row.status || "").toLowerCase();
    if (status === "closed" || status === "settled") return sum;
    return sum + (Number(row.balance_outstanding) || 0);
  }, 0);
}

function settlementLabel({ missingDol, recoveries }) {
  if (missingDol) return "Needs last working date";
  if (recoveries > 0) return "Recoveries pending";
  return "Ready to settle";
}

function settlementSeverity(label) {
  if (label === "Needs last working date") return "high";
  if (label === "Recoveries pending") return "warning";
  return "info";
}

function employeeMasterPath(id, tab) {
  const base = `/app/admin/employee/master/${id}`;
  return tab ? `${base}?tab=${tab}` : base;
}

export function EmployeeFnfPage() {
  const { user, userProfile } = useAuth();
  const salaryAdmin = canAccessSalaryAdmin(userProfile, user);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const loadFnf = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: fetchError } = await supabase
        .from("admin_ifsp_employee_master")
        .select(SELECT_FIELDS)
        .in("status", ["Inactive", "Left"])
        .order("date_of_leaving", { ascending: false, nullsFirst: false })
        .order("full_name", { ascending: true });

      if (fetchError) throw fetchError;

      let mapped = (data || [])
        .filter((row) => isInactiveEmployeeStatus(row.status))
        .map(mapInactiveEmployeeRow)
        .map((row) => ({
          ...row,
          loan_outstanding: 0,
          advance_outstanding: 0,
          unpaid_outstanding: 0,
          recoveries: 0,
        }));

      if (salaryAdmin && mapped.length) {
        try {
          const ids = mapped.map((row) => row.id);
          const { loansByEmployee, advancesByEmployee, unpaidByEmployee } =
            await fetchLoansAndAdvancesForEmployees(ids);
          mapped = mapped.map((row) => {
            const key = String(row.id);
            const loan_outstanding = sumOutstanding(loansByEmployee.get(key));
            const advance_outstanding = sumOutstanding(advancesByEmployee.get(key));
            const unpaid_outstanding = sumOutstanding(unpaidByEmployee.get(key));
            const recoveries = loan_outstanding + advance_outstanding + unpaid_outstanding;
            return { ...row, loan_outstanding, advance_outstanding, unpaid_outstanding, recoveries };
          });
        } catch (recoveryErr) {
          console.error(recoveryErr);
        }
      }

      mapped = mapped.map((row) => {
        const missingDol = !row.date_of_leaving;
        const label = settlementLabel({ missingDol, recoveries: row.recoveries });
        return { ...row, missingDol, settlementLabel: label };
      });

      setRows(mapped);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load full and final cases.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [salaryAdmin]);

  useEffect(() => {
    loadFnf();
  }, [loadFnf]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "needs-dol" && !row.missingDol) return false;
      if (statusFilter === "recoveries" && !(row.recoveries > 0)) return false;
      if (statusFilter === "ready" && row.settlementLabel !== "Ready to settle") return false;
      if (!q) return true;
      const hay = [row.full_name, row.employee_code, row.department, row.designation, row.status, row.settlementLabel]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const missingDolCount = rows.filter((row) => row.missingDol).length;
  const recoveriesCount = rows.filter((row) => row.recoveries > 0).length;
  const readyCount = rows.filter((row) => row.settlementLabel === "Ready to settle").length;
  const recoveryTotal = rows.reduce((sum, row) => sum + (Number(row.recoveries) || 0), 0);

  const columns = useMemo(() => {
    const cols = [
      {
        key: "full_name",
        label: "Employee",
        headerClassName: COL_NAME,
        cellClassName: COL_NAME,
        render: (row) => <span className="font-medium text-gray-900">{row.full_name || "—"}</span>,
      },
      {
        key: "employee_code",
        label: "Code",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => <span className="font-mono text-[11px] tabular-nums">{row.employee_code || "—"}</span>,
      },
      {
        key: "department",
        label: "Department",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => row.department || "—",
      },
      {
        key: "date_of_leaving",
        label: "Last working day",
        headerClassName: COL_DATE,
        cellClassName: COL_DATE,
        render: (row) => formatDateDdMmYyyy(row.date_of_leaving) || "—",
      },
      {
        key: "status",
        label: "Status",
        headerClassName: "min-w-[100px]",
        cellClassName: "min-w-[100px]",
        render: (row) => (
          <StatusChip label={row.status || "Inactive"} severity={row.status === "Left" ? "high" : "critical"} />
        ),
      },
      {
        key: "settlementLabel",
        label: "F&F",
        headerClassName: "min-w-[170px]",
        cellClassName: "min-w-[170px]",
        render: (row) => <StatusChip label={row.settlementLabel} severity={settlementSeverity(row.settlementLabel)} />,
      },
    ];
    if (salaryAdmin) {
      cols.splice(5, 0, {
        key: "recoveries",
        label: "Recoveries",
        headerClassName: "min-w-[110px]",
        cellClassName: "min-w-[110px]",
        render: (row) => (
          <span className={`tabular-nums ${row.recoveries > 0 ? "text-amber-800 font-medium" : "text-gray-600"}`}>
            {formatInr(row.recoveries)}
          </span>
        ),
      });
    }
    return cols;
  }, [salaryAdmin]);

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-[1680px] mx-auto min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 border border-rose-100">
          <FileSpreadsheet className="h-5 w-5 text-rose-700" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTaskHeader
            title="F & F"
            subtitle="Settle full and final dues for employees who have left — last working date, recoveries, and handoff to exit documents."
          >
            <Link
              to="/app/admin/employee/inactive"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              Exit documents
            </Link>
            <button
              type="button"
              onClick={loadFnf}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </PageTaskHeader>
          <CollapsibleHelp label="how this works">
            Employees appear here when status is Inactive or Left in Employee Master. Open a row to review last working
            date and outstanding recoveries, then continue on the employee record. Use Inactive Employees to generate
            relieving papers.
          </CollapsibleHelp>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile label="Exit cases" value={String(rows.length)} tone="border-rose-100" />
        <KpiTile
          label="Ready to settle"
          value={String(readyCount)}
          tone="border-emerald-100"
          sub={missingDolCount ? `${missingDolCount} missing last working date` : undefined}
        />
        <KpiTile
          label="Recoveries pending"
          value={String(recoveriesCount)}
          tone="border-amber-100"
          sub={salaryAdmin && recoveryTotal > 0 ? formatInr(recoveryTotal) : undefined}
        />
        <KpiTile
          label="Showing"
          value={String(filteredRows.length)}
          tone="border-gray-100"
          sub={search || statusFilter !== "all" ? "Filtered view" : "All cases"}
        />
      </div>

      <SectionCard
        title={`Full & final register (${filteredRows.length})`}
        right={
          search || statusFilter !== "all" ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
            >
              <X className="h-3 w-3" />
              Reset filters
            </button>
          ) : null
        }
      >
        <FilterBar>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5 flex-1 min-w-[200px]">
            Quick search
            <TinyInput
              placeholder="Name, code, department, F&F status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Settlement
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[180px]">
              <option value="all">All cases</option>
              <option value="ready">Ready to settle</option>
              <option value="needs-dol">Needs last working date</option>
              {salaryAdmin ? <option value="recoveries">Recoveries pending</option> : null}
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
            <p className="text-xs text-gray-500">Loading F&F cases…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-700">No matching cases</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {rows.length === 0
                ? "Cases appear here when an employee is marked Inactive or Left in Employee Master."
                : "Try adjusting search or settlement filters."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 min-w-0">
              <DenseTable
                columns={columns}
                rows={pageRows}
                rowKey="id"
                activeRowId={selected?.id ?? null}
                onRowClick={(row) => setSelected(row)}
                stickyHeader
                scrollMaxHeight="calc(100dvh - 20rem)"
                serialOffset={(page - 1) * pageSize}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
              <span className="tabular-nums">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of{" "}
                {filteredRows.length}
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
        onClose={() => setSelected(null)}
        title={selected?.full_name || "Employee"}
        widthClass="max-w-lg"
      >
        {selected ? (
          <div className="space-y-4 text-xs">
            <p className="text-[11px] text-gray-500 -mt-1 pb-2 border-b border-gray-100">
              {selected.employee_code || "—"} · {selected.department || "—"}
            </p>
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
              <DetailField label="Last working day" value={formatDateDdMmYyyy(selected.date_of_leaving)} />
              <DetailField
                label="F&F"
                value={
                  <StatusChip
                    label={selected.settlementLabel}
                    severity={settlementSeverity(selected.settlementLabel)}
                  />
                }
              />
              <DetailField label="Date of joining" value={formatDateDdMmYyyy(selected.date_of_joining)} />
              <DetailField label="Status" value={selected.status} />
              {selected.status_reason ? (
                <div className="col-span-2">
                  <DetailField label="Reason" value={selected.status_reason} />
                </div>
              ) : null}
            </div>

            {salaryAdmin ? (
              <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-900">Outstanding recoveries</p>
                <RowLine label="Loans" value={formatInr(selected.loan_outstanding)} />
                <RowLine label="Salary advances" value={formatInr(selected.advance_outstanding)} />
                <RowLine label="Unpaid / paid salary" value={formatInr(selected.unpaid_outstanding)} />
                <RowLine label="Total" value={formatInr(selected.recoveries)} strong />
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                Recovery amounts are shown to salary administrators. Open the employee record to complete personal and
                exit details.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Link
                to={employeeMasterPath(selected.id, salaryAdmin ? "fnf" : "personal")}
                className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-deep"
              >
                Open employee record
              </Link>
              <Link
                to="/app/admin/employee/inactive"
                className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50"
              >
                Generate exit documents
              </Link>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-gray-900 mt-0.5">{value || "—"}</dd>
    </div>
  );
}

function RowLine({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={strong ? "font-semibold text-gray-900" : "text-gray-600"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-gray-900" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

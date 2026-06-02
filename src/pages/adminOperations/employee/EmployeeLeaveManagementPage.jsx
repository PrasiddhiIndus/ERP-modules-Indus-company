import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import { fetchActiveEmployees, normalizeAttendanceEmpCode } from "../../../lib/attendanceDaily";
import {
  fetchLeaveBalancesForYear,
  fetchPlEncashPrefs,
  getLeaveCarryForwardRules,
  processLeaveBalancesYear,
  upsertLeaveCarryForwardRules,
  upsertPlEncashPrefs,
} from "../../../lib/leaveManagement";

const YEAR_DEFAULT = new Date().getFullYear();
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const LEAVE_TABS = [
  { id: "overview", label: "Overview & Rules" },
  { id: "ledger", label: "Yearly Balance Ledger" },
  { id: "encash", label: "PL Encashment Preferences" },
];

function fmtNum(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return "0";
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1);
}

function MetricCard({ label, value, hint, tone = "bg-white" }) {
  return (
    <div className={`rounded-xl border border-gray-200 px-3 py-2.5 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

function Pager({
  totalRows,
  pageSize,
  page,
  onPageChange,
  onPageSizeChange,
  label = "rows",
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const current = Math.min(page, totalPages);
  const from = totalRows ? (current - 1) * pageSize + 1 : 0;
  const to = Math.min(current * pageSize, totalRows);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2">
      <span className="text-[11px] text-gray-600">
        Showing {from}-{to} of {totalRows} {label}
      </span>
      <div className="flex items-center gap-2">
        <TinySelect value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="w-[110px]">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </TinySelect>
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={current <= 1}
          className="h-8 px-2 rounded border border-gray-300 bg-white text-xs disabled:opacity-50"
        >
          First
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, current - 1))}
          disabled={current <= 1}
          className="h-8 px-3 rounded border border-gray-300 bg-white text-xs disabled:opacity-50"
        >
          Prev
        </button>
        <span className="text-[11px] text-gray-700">
          Page {current} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, current + 1))}
          disabled={current >= totalPages}
          className="h-8 px-3 rounded border border-gray-300 bg-white text-xs disabled:opacity-50"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={current >= totalPages}
          className="h-8 px-2 rounded border border-gray-300 bg-white text-xs disabled:opacity-50"
        >
          Last
        </button>
      </div>
    </div>
  );
}

export function EmployeeLeaveManagementPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [year, setYear] = useState(YEAR_DEFAULT);

  const [employees, setEmployees] = useState([]);
  const [rules, setRules] = useState({
    pl_carry_forward_max: 7,
    sl_carry_forward_max: 8,
    cl_carry_forward_max: 0,
  });

  const [plEncashPrefs, setPlEncashPrefs] = useState({});
  const [balances, setBalances] = useState([]);
  const [processingStatus, setProcessingStatus] = useState("");

  const [search, setSearch] = useState("");
  const [encashPage, setEncashPage] = useState(1);
  const [encashPageSize, setEncashPageSize] = useState(25);
  const [balancesPage, setBalancesPage] = useState(1);
  const [balancesPageSize, setBalancesPageSize] = useState(25);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSort, setLedgerSort] = useState({ key: "empCode", direction: "asc" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [emps, r, prefs] = await Promise.all([
          fetchActiveEmployees(supabase),
          getLeaveCarryForwardRules(supabase),
          fetchPlEncashPrefs(supabase),
        ]);
        if (cancelled) return;

        setEmployees(emps || []);
        setRules({
          pl_carry_forward_max: Number(r.pl_carry_forward_max || 0),
          sl_carry_forward_max: Number(r.sl_carry_forward_max || 0),
          cl_carry_forward_max: Number(r.cl_carry_forward_max || 0),
        });
        setPlEncashPrefs(prefs || {});
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load leave management data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const rows = await fetchLeaveBalancesForYear(supabase, year);
        if (cancelled) return;
        setBalances(rows || []);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load balances");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const saveRules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await upsertLeaveCarryForwardRules(supabase, {
        pl_carry_forward_max: Number(rules.pl_carry_forward_max),
        sl_carry_forward_max: Number(rules.sl_carry_forward_max),
      });
      const r = await getLeaveCarryForwardRules(supabase);
      setRules({
        pl_carry_forward_max: Number(r.pl_carry_forward_max || 0),
        sl_carry_forward_max: Number(r.sl_carry_forward_max || 0),
        cl_carry_forward_max: Number(r.cl_carry_forward_max || 0),
      });
    } catch (e) {
      setError(e?.message || "Could not save carry forward rules");
    } finally {
      setLoading(false);
    }
  }, [rules.pl_carry_forward_max, rules.sl_carry_forward_max]);

  const savePrefs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await upsertPlEncashPrefs(supabase, plEncashPrefs);
    } catch (e) {
      setError(e?.message || "Could not save PL encash preferences");
    } finally {
      setLoading(false);
    }
  }, [plEncashPrefs]);

  const doProcessYear = useCallback(async () => {
    setLoading(true);
    setError("");
    setProcessingStatus("Processing…");
    try {
      await processLeaveBalancesYear(supabase, year);
      const rows = await fetchLeaveBalancesForYear(supabase, year);
      setBalances(rows || []);
      setProcessingStatus("Processed successfully");
    } catch (e) {
      setError(e?.message || "Failed to process leave balances");
      setProcessingStatus("");
    } finally {
      setLoading(false);
      setTimeout(() => setProcessingStatus(""), 4000);
    }
  }, [year, plEncashPrefs, rules]);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return employees;
    return (employees || []).filter((e) => {
      const hay = [e.employeeName, e.empCode, e.employeeId, e.department].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [employees, search]);

  const balanceByCode = useMemo(() => {
    const out = {};
    for (const b of balances || []) {
      const code = normalizeAttendanceEmpCode(b.emp_code);
      if (!code) continue;
      out[code] = b;
    }
    return out;
  }, [balances]);

  const encashRows = useMemo(
    () =>
      filteredEmployees.map((e) => {
        const code = normalizeAttendanceEmpCode(e.empCode);
        return {
          id: code,
          empCode: code,
          employeeName: e.employeeName || "",
          encash_pl_on_carry_forward: !!plEncashPrefs[code],
        };
      }),
    [filteredEmployees, plEncashPrefs]
  );

  const balancesRows = useMemo(
    () =>
      filteredEmployees.map((e) => {
        const code = normalizeAttendanceEmpCode(e.empCode);
        const b = balanceByCode[code] || {};
        return {
          id: code || e.empCode || e.employeeId || e.employeeName || "unknown-employee",
          empCode: code || e.empCode,
          employeeName: e.employeeName,
          opening_pl: b.opening_pl ?? 0,
          used_pl: b.used_pl ?? 0,
          carried_pl: b.carried_pl ?? 0,
          expired_pl: b.expired_pl ?? 0,
          encashed_pl: b.encashed_pl ?? 0,
          opening_sl: b.opening_sl ?? 0,
          used_sl: b.used_sl ?? 0,
          carried_sl: b.carried_sl ?? 0,
          expired_sl: b.expired_sl ?? 0,
          opening_cl: b.opening_cl ?? 0,
          used_cl: b.used_cl ?? 0,
          expired_cl: b.expired_cl ?? 0,
        };
      }),
    [filteredEmployees, balanceByCode]
  );

  const ledgerRows = useMemo(() => {
    const needle = ledgerSearch.trim().toLowerCase();
    const filtered = !needle
      ? balancesRows
      : balancesRows.filter((row) => {
          const hay = [
            row.empCode,
            row.employeeName,
            row.opening_pl,
            row.used_pl,
            row.carried_pl,
            row.encashed_pl,
            row.expired_pl,
            row.opening_sl,
            row.used_sl,
            row.carried_sl,
            row.expired_sl,
            row.opening_cl,
            row.used_cl,
            row.expired_cl,
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        });

    const toSortValue = (row, key) => {
      if (key === "empCode" || key === "employeeName") return String(row[key] || "").toLowerCase();
      return Number(row[key] || 0);
    };

    const sorted = [...filtered].sort((a, b) => {
      const av = toSortValue(a, ledgerSort.key);
      const bv = toSortValue(b, ledgerSort.key);
      if (av === bv) return 0;
      if (typeof av === "number" && typeof bv === "number") {
        return ledgerSort.direction === "asc" ? av - bv : bv - av;
      }
      return ledgerSort.direction === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return sorted;
  }, [balancesRows, ledgerSearch, ledgerSort]);

  const encashTotalPages = Math.max(1, Math.ceil(encashRows.length / encashPageSize));
  const encashCurrentPage = Math.min(encashPage, encashTotalPages);
  const encashStartIndex = (encashCurrentPage - 1) * encashPageSize;
  const encashPageRows = encashRows.slice(encashStartIndex, encashStartIndex + encashPageSize);
  const encashFrom = encashRows.length ? encashStartIndex + 1 : 0;
  const encashTo = Math.min(encashStartIndex + encashPageSize, encashRows.length);

  const balancesTotalPages = Math.max(1, Math.ceil(ledgerRows.length / balancesPageSize));
  const balancesCurrentPage = Math.min(balancesPage, balancesTotalPages);
  const balancesStartIndex = (balancesCurrentPage - 1) * balancesPageSize;
  const balancesPageRows = ledgerRows.slice(balancesStartIndex, balancesStartIndex + balancesPageSize);
  const balancesFrom = ledgerRows.length ? balancesStartIndex + 1 : 0;
  const balancesTo = Math.min(balancesStartIndex + balancesPageSize, ledgerRows.length);

  const totalEncashSelected = useMemo(
    () => Object.values(plEncashPrefs || {}).filter(Boolean).length,
    [plEncashPrefs]
  );

  useEffect(() => {
    setEncashPage(1);
    setBalancesPage(1);
  }, [search, year, encashPageSize, balancesPageSize]);

  useEffect(() => {
    setBalancesPage(1);
  }, [ledgerSearch, ledgerSort.key, ledgerSort.direction]);

  const toggleLedgerSort = useCallback((key) => {
    setLedgerSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }, []);

  const sortLabel = useCallback(
    (label, key) => (
      <button type="button" onClick={() => toggleLedgerSort(key)} className="inline-flex items-center gap-1 hover:text-gray-900">
        <span>{label}</span>
        <span className="text-[10px] text-gray-500">
          {ledgerSort.key === key ? (ledgerSort.direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    ),
    [ledgerSort.direction, ledgerSort.key, toggleLedgerSort]
  );

  const exportLedgerToExcel = useCallback(() => {
    const rows = ledgerRows.map((r) => ({
      "Employee Code": r.empCode || "",
      Employee: r.employeeName || "",
      "PL Open": Number(r.opening_pl || 0),
      "PL Used": Number(r.used_pl || 0),
      "PL Carried": Number(r.carried_pl || 0),
      "PL Encashed": Number(r.encashed_pl || 0),
      "PL Expired": Number(r.expired_pl || 0),
      "SL Open": Number(r.opening_sl || 0),
      "SL Used": Number(r.used_sl || 0),
      "SL Carried": Number(r.carried_sl || 0),
      "SL Expired": Number(r.expired_sl || 0),
      "CL Open": Number(r.opening_cl || 0),
      "CL Used": Number(r.used_cl || 0),
      "CL Expired": Number(r.expired_cl || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Leave Ledger ${year}`);
    XLSX.writeFile(wb, `leave-balance-ledger-${year}.xlsx`);
  }, [ledgerRows, year]);

  const balanceTotals = useMemo(
    () =>
      balancesRows.reduce(
        (acc, r) => {
          acc.carried_pl += Number(r.carried_pl || 0);
          acc.carried_sl += Number(r.carried_sl || 0);
          acc.expired_pl += Number(r.expired_pl || 0);
          acc.expired_sl += Number(r.expired_sl || 0);
          acc.encashed_pl += Number(r.encashed_pl || 0);
          return acc;
        },
        { carried_pl: 0, carried_sl: 0, expired_pl: 0, expired_sl: 0, encashed_pl: 0 }
      ),
    [balancesRows]
  );

  const yearQualityState = useMemo(() => {
    if (!balancesRows.length) return "pending";
    const hasProcessedRow = balancesRows.some((r) => {
      const hasUsage = Number(r.used_pl || 0) > 0 || Number(r.used_sl || 0) > 0 || Number(r.used_cl || 0) > 0;
      const hasOutcome =
        Number(r.carried_pl || 0) > 0 ||
        Number(r.carried_sl || 0) > 0 ||
        Number(r.expired_pl || 0) > 0 ||
        Number(r.expired_sl || 0) > 0 ||
        Number(r.encashed_pl || 0) > 0;
      return hasUsage || hasOutcome;
    });
    return hasProcessedRow ? "processed" : "loaded";
  }, [balancesRows]);

  return (
    <div className="space-y-4">
      <SectionCard
        title={`Leave Management · ${year}`}
        right={
          <div className="flex items-center gap-2">
            <StatusChip
              label={
                yearQualityState === "processed"
                  ? "Processed data"
                  : yearQualityState === "loaded"
                  ? "Loaded data"
                  : "Awaiting process"
              }
              severity={yearQualityState === "processed" ? "high" : "info"}
            />
            {processingStatus ? <StatusChip label={processingStatus} severity="warning" /> : null}
          </div>
        }
      >
        <FilterBar>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Search employee</label>
            <TinyInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, name, employee ID, department…"
              className="min-w-[280px]"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Year</label>
            <TinyInput type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-[120px]" />
          </div>
          <button
            type="button"
            onClick={doProcessYear}
            disabled={loading}
            className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-60"
          >
            {loading ? "Processing..." : "Process Yearly Balances"}
          </button>
          <button
            type="button"
            onClick={() => setYear(YEAR_DEFAULT)}
            disabled={loading}
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold disabled:opacity-60"
          >
            Current Year
          </button>
        </FilterBar>

        {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div> : null}

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Employees" value={filteredEmployees.length} hint="After search filter" />
          <MetricCard label="PL Encash Selected" value={totalEncashSelected} tone="bg-emerald-50/50" />
          <MetricCard label="PL Carry Cap" value={fmtNum(rules.pl_carry_forward_max)} />
          <MetricCard label="SL Carry Cap" value={fmtNum(rules.sl_carry_forward_max)} />
          <MetricCard label="Total PL Carried" value={fmtNum(balanceTotals.carried_pl)} tone="bg-blue-50/50" />
          <MetricCard label="Total PL Encashed" value={fmtNum(balanceTotals.encashed_pl)} tone="bg-purple-50/50" />
        </div>
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-2">
          <div className="flex flex-wrap gap-2">
            {LEAVE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold border transition ${
                  activeTab === tab.id
                    ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "overview" && (
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <SectionCard title="Carry Forward Rules" className="xl:col-span-1" right={null}>
              <div className="space-y-3">
                <label className="block text-[11px] text-gray-600">
                  PL carry-forward max
                  <TinyInput
                    type="number"
                    step="0.5"
                    value={rules.pl_carry_forward_max}
                    onChange={(e) => setRules((p) => ({ ...p, pl_carry_forward_max: Number(e.target.value) }))}
                    className="mt-1 w-full"
                    disabled={loading}
                  />
                </label>
                <label className="block text-[11px] text-gray-600">
                  SL carry-forward max
                  <TinyInput
                    type="number"
                    step="0.5"
                    value={rules.sl_carry_forward_max}
                    onChange={(e) => setRules((p) => ({ ...p, sl_carry_forward_max: Number(e.target.value) }))}
                    className="mt-1 w-full"
                    disabled={loading}
                  />
                </label>
                <label className="block text-[11px] text-gray-600">
                  CL carry-forward max (fixed)
                  <TinyInput type="number" value={0} className="mt-1 w-full bg-gray-50" disabled />
                </label>
                <button
                  type="button"
                  onClick={saveRules}
                  disabled={loading}
                  className="h-8 w-full rounded-lg bg-gray-900 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Save Rules
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Processing Guide" className="xl:col-span-2" right={null}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-800">Recommended sequence</p>
                  <ol className="mt-2 space-y-1 text-[11px] text-slate-700 list-decimal list-inside">
                    <li>Set carry-forward caps.</li>
                    <li>Maintain PL encashment preferences in the dedicated tab.</li>
                    <li>Run yearly processing for the selected year.</li>
                    <li>Validate carried/expired balances in ledger tab.</li>
                  </ol>
                </div>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                  <p className="text-xs font-semibold text-indigo-900">Year quick stats</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-indigo-900">
                    <div>PL expired: {fmtNum(balanceTotals.expired_pl)}</div>
                    <div>SL carried: {fmtNum(balanceTotals.carried_sl)}</div>
                    <div>SL expired: {fmtNum(balanceTotals.expired_sl)}</div>
                    <div>Rows loaded: {balancesRows.length}</div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === "ledger" && (
          <SectionCard title={`Yearly Leave Balance Ledger (${year})`} right={null} className="mt-4">
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
              <MetricCard label="Total PL Expired" value={fmtNum(balanceTotals.expired_pl)} tone="bg-rose-50/50" />
              <MetricCard label="Total SL Carried" value={fmtNum(balanceTotals.carried_sl)} tone="bg-sky-50/50" />
              <MetricCard label="Total SL Expired" value={fmtNum(balanceTotals.expired_sl)} tone="bg-orange-50/50" />
              <MetricCard label="Rows Loaded" value={balancesRows.length} />
              <MetricCard label="Data Year" value={year} />
            </div>
            <div className="space-y-3">
              <FilterBar>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase">Search in ledger</label>
                  <TinyInput
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Employee code, name, or any value..."
                    className="min-w-[280px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={exportLedgerToExcel}
                  className="h-8 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                >
                  Export to Excel
                </button>
                <span className="text-[11px] text-gray-500">
                  Sorted by {ledgerSort.key} ({ledgerSort.direction})
                </span>
              </FilterBar>
              <Pager
                totalRows={ledgerRows.length}
                pageSize={balancesPageSize}
                page={balancesCurrentPage}
                onPageChange={setBalancesPage}
                onPageSizeChange={setBalancesPageSize}
                label="employees"
              />
              <DenseTable
                rows={balancesPageRows}
                rowKey="id"
                frozenColumnCount={0}
                columns={[
                  {
                    key: "empCode",
                    label: sortLabel("Employee code", "empCode"),
                    render: (r) => r.empCode || "—",
                    headerClassName: "min-w-[130px]",
                    cellClassName: "min-w-[130px]",
                  },
                  {
                    key: "employeeName",
                    label: sortLabel("Employee", "employeeName"),
                    render: (r) => r.employeeName || "—",
                    headerClassName: "min-w-[220px]",
                    cellClassName: "min-w-[220px]",
                  },
                  { key: "opening_pl", label: sortLabel("PL (open)", "opening_pl"), render: (r) => fmtNum(r.opening_pl), headerClassName: "min-w-[95px]", cellClassName: "text-right tabular-nums min-w-[95px]" },
                  { key: "used_pl", label: sortLabel("PL (used)", "used_pl"), render: (r) => fmtNum(r.used_pl), headerClassName: "min-w-[95px]", cellClassName: "text-right tabular-nums min-w-[95px]" },
                  { key: "carried_pl", label: sortLabel("PL (carried)", "carried_pl"), render: (r) => fmtNum(r.carried_pl), headerClassName: "min-w-[105px]", cellClassName: "text-right tabular-nums min-w-[105px]" },
                  { key: "encashed_pl", label: sortLabel("PL (encash)", "encashed_pl"), render: (r) => fmtNum(r.encashed_pl), headerClassName: "min-w-[105px]", cellClassName: "text-right tabular-nums min-w-[105px]" },
                  { key: "expired_pl", label: sortLabel("PL (expired)", "expired_pl"), render: (r) => fmtNum(r.expired_pl), headerClassName: "min-w-[105px]", cellClassName: "text-right tabular-nums min-w-[105px]" },
                  { key: "opening_sl", label: sortLabel("SL (open)", "opening_sl"), render: (r) => fmtNum(r.opening_sl), headerClassName: "min-w-[95px]", cellClassName: "text-right tabular-nums min-w-[95px]" },
                  { key: "used_sl", label: sortLabel("SL (used)", "used_sl"), render: (r) => fmtNum(r.used_sl), headerClassName: "min-w-[95px]", cellClassName: "text-right tabular-nums min-w-[95px]" },
                  { key: "carried_sl", label: sortLabel("SL (carried)", "carried_sl"), render: (r) => fmtNum(r.carried_sl), headerClassName: "min-w-[105px]", cellClassName: "text-right tabular-nums min-w-[105px]" },
                  { key: "expired_sl", label: sortLabel("SL (expired)", "expired_sl"), render: (r) => fmtNum(r.expired_sl), headerClassName: "min-w-[105px]", cellClassName: "text-right tabular-nums min-w-[105px]" },
                  { key: "opening_cl", label: sortLabel("CL (open)", "opening_cl"), render: (r) => fmtNum(r.opening_cl), headerClassName: "min-w-[95px]", cellClassName: "text-right tabular-nums min-w-[95px]" },
                  { key: "used_cl", label: sortLabel("CL (used)", "used_cl"), render: (r) => fmtNum(r.used_cl), headerClassName: "min-w-[95px]", cellClassName: "text-right tabular-nums min-w-[95px]" },
                  { key: "expired_cl", label: sortLabel("CL (expired)", "expired_cl"), render: (r) => fmtNum(r.expired_cl), headerClassName: "min-w-[105px]", cellClassName: "text-right tabular-nums min-w-[105px]" },
                ]}
              />
              <Pager
                totalRows={ledgerRows.length}
                pageSize={balancesPageSize}
                page={balancesCurrentPage}
                onPageChange={setBalancesPage}
                onPageSizeChange={setBalancesPageSize}
                label="employees"
              />
            </div>
          </SectionCard>
        )}

        {activeTab === "encash" && (
          <SectionCard title="PL Encashment Preferences" className="mt-4" right={null}>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricCard label="Total Employees" value={encashRows.length} />
                <MetricCard label="Selected for Encash" value={totalEncashSelected} tone="bg-emerald-50/50" />
                <MetricCard label="Selected Year" value={year} />
              </div>
              <Pager
                totalRows={encashRows.length}
                pageSize={encashPageSize}
                page={encashCurrentPage}
                onPageChange={setEncashPage}
                onPageSizeChange={setEncashPageSize}
                label="employees"
              />
              <DenseTable
                rows={encashPageRows}
                rowKey="id"
                frozenColumnCount={2}
                frozenColumnWidths={[150, 220]}
                columns={[
                  { key: "empCode", label: "Employee code", render: (r) => r.empCode || "—" },
                  { key: "employeeName", label: "Employee", render: (r) => r.employeeName || "—" },
                  {
                    key: "encash_pl_on_carry_forward",
                    label: "Encash PL on carry forward",
                    cellClassName: "text-center",
                    render: (r) => (
                      <input
                        type="checkbox"
                        checked={!!r.encash_pl_on_carry_forward}
                        onChange={(e) => {
                          const code = r.empCode;
                          setPlEncashPrefs((p) => ({ ...p, [code]: e.target.checked }));
                        }}
                      />
                    ),
                  },
                ]}
              />
              <Pager
                totalRows={encashRows.length}
                pageSize={encashPageSize}
                page={encashCurrentPage}
                onPageChange={setEncashPage}
                onPageSizeChange={setEncashPageSize}
                label="employees"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={savePrefs}
                  disabled={loading}
                  className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-60"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          </SectionCard>
        )}
      </SectionCard>
    </div>
  );
}


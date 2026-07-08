import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Modal,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import { fetchActiveEmployees, normalizeAttendanceEmpCode } from "../../../lib/attendanceDaily";
import { ledgerDisplayRowToEditForm, downloadLeaveBalanceSampleSheet } from "../../../lib/leaveLedgerExcel";
import { LeaveBalanceImportModal } from "./LeaveBalanceImportModal";
import {
  fetchLeaveBalancesForYear,
  fetchLeaveUsageFromDailyRegister,
  fetchPlEncashPrefs,
  getLeaveCarryForwardRules,
  processLeaveBalancesYear,
  upsertLeaveBalanceYearly,
  upsertLeaveCarryForwardRules,
  upsertPlEncashPrefs,
} from "../../../lib/leaveManagement";
import { subscribeLeaveWorkflowRealtime } from "../../../lib/adminLeaveRequests";
import { isSupabaseRealtimeEnabled } from "../../../lib/supabaseConfig";

const YEAR_DEFAULT = new Date().getFullYear();
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const LEAVE_TABS = [
  { id: "overview", label: "Overview & Rules" },
  { id: "ledger", label: "Yearly Balance Ledger" },
  { id: "encash", label: "PL Encashment Preferences" },
];

const LEDGER_SUB_TABS = [
  { id: "opening", label: "Opening" },
  { id: "used", label: "Used" },
  { id: "balance", label: "Balance" },
];

const LEDGER_LEAVE_TYPES = [
  { key: "cl", label: "CL", opening: "opening_cl", used: "used_cl", balance: "unused_cl" },
  { key: "pl", label: "PL", opening: "opening_pl", used: "used_pl", balance: "unused_pl" },
  { key: "sl", label: "SL", opening: "opening_sl", used: "used_sl", balance: "unused_sl" },
  { key: "sbel", label: "S BeL", opening: "opening_sbel", used: "used_sbel", balance: "unused_sbel" },
  { key: "spla", label: "SPLA", opening: "opening_spla", used: "used_spla", balance: "unused_spla" },
  { key: "splb", label: "SPLB", opening: "opening_splb", used: "used_splb", balance: "unused_splb" },
  { key: "splm", label: "SPLM", opening: "opening_splm", used: "used_splm", balance: "unused_splm" },
  { key: "coff", label: "C/OFF" },
  { key: "paternity", label: "Paternity", opening: "opening_paternity", used: "used_paternity", balance: "unused_paternity" },
];

const LEDGER_TAB_PREFIX = {
  opening: "opening",
  used: "used",
  balance: "balance",
};

const LEDGER_TAB_FIELD_KEYS = {
  opening: LEDGER_LEAVE_TYPES.map((t) => `opening_${t.key}`),
  used: LEDGER_LEAVE_TYPES.map((t) => `used_${t.key}`),
  balance: LEDGER_LEAVE_TYPES.map((t) => `balance_${t.key}`),
};

function mapLedgerLeaveFields(b = {}) {
  const out = {};
  for (const t of LEDGER_LEAVE_TYPES) {
    const opening = t.opening ? Number(b[t.opening] ?? 0) : 0;
    const used = t.used ? Number(b[t.used] ?? 0) : 0;
    out[`opening_${t.key}`] = opening;
    out[`used_${t.key}`] = used;
    out[`balance_${t.key}`] = t.balance ? Math.max(0, opening - used) : 0;
  }
  return out;
}

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

const LEDGER_EDIT_FIELDS = [
  { key: "opening_pl", label: "PL Open" },
  { key: "used_pl", label: "PL Used" },
  { key: "carried_pl", label: "PL Carried" },
  { key: "encashed_pl", label: "PL Encashed" },
  { key: "expired_pl", label: "PL Expired" },
  { key: "opening_sl", label: "SL Open" },
  { key: "used_sl", label: "SL Used" },
  { key: "carried_sl", label: "SL Carried" },
  { key: "expired_sl", label: "SL Expired" },
  { key: "opening_cl", label: "CL Open" },
  { key: "used_cl", label: "CL Used" },
  { key: "expired_cl", label: "CL Expired" },
];

function LeaveLedgerEditModal({ open, row, year, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ledgerDisplayRowToEditForm(row || {}));

  useEffect(() => {
    if (open && row) setForm(ledgerDisplayRowToEditForm(row));
  }, [open, row]);

  if (!open || !row) return null;

  return (
    <Modal
      open={open}
      title={`Edit leave ledger · ${row.empCode || ""} (${year})`}
      onClose={onClose}
      widthClass="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 rounded border border-gray-300 bg-white text-xs disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={saving}
            className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <p>
            <span className="font-semibold text-gray-900">{row.employeeName || "—"}</span>
          </p>
          <p className="mt-0.5 text-gray-500">Employee code: {row.empCode || "—"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {LEDGER_EDIT_FIELDS.map((f) => (
            <label key={f.key} className="block text-[11px] text-gray-600">
              {f.label}
              <TinyInput
                type="number"
                step="0.5"
                value={form[f.key]}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: Number(e.target.value) }))}
                className="mt-1 w-full"
                disabled={saving}
              />
            </label>
          ))}
        </div>
      </div>
    </Modal>
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
  const [registerUsageByCode, setRegisterUsageByCode] = useState({});
  const [processingStatus, setProcessingStatus] = useState("");

  const [search, setSearch] = useState("");
  const [encashPage, setEncashPage] = useState(1);
  const [encashPageSize, setEncashPageSize] = useState(25);
  const [balancesPage, setBalancesPage] = useState(1);
  const [balancesPageSize, setBalancesPageSize] = useState(25);
  const [ledgerSubTab, setLedgerSubTab] = useState("opening");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSort, setLedgerSort] = useState({ key: "empCode", direction: "asc" });
  const [ledgerEditRow, setLedgerEditRow] = useState(null);
  const [ledgerEditSaving, setLedgerEditSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [realtimeLive, setRealtimeLive] = useState(false);

  const reloadBalances = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [rows, usageByCode] = await Promise.all([
        fetchLeaveBalancesForYear(supabase, year),
        fetchLeaveUsageFromDailyRegister(supabase, year),
      ]);
      setBalances(rows || []);
      setRegisterUsageByCode(usageByCode || {});
    } catch (e) {
      setError(e?.message || "Failed to load balances");
    } finally {
      setLoading(false);
    }
  }, [year]);

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
      if (cancelled) return;
      await reloadBalances();
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadBalances]);

  useEffect(() => {
    let debounce = null;
    const schedule = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => reloadBalances(), 400);
    };
    const unsubscribe = subscribeLeaveWorkflowRealtime(schedule);
    setRealtimeLive(isSupabaseRealtimeEnabled());
    return () => {
      if (debounce) window.clearTimeout(debounce);
      unsubscribe();
    };
  }, [reloadBalances]);

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
      const [rows, usageByCode] = await Promise.all([
        fetchLeaveBalancesForYear(supabase, year),
        fetchLeaveUsageFromDailyRegister(supabase, year),
      ]);
      setBalances(rows || []);
      setRegisterUsageByCode(usageByCode || {});
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
      const code = normalizeAttendanceEmpCode(b.employee_code);
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
        const b = { ...(balanceByCode[code] || {}), ...(registerUsageByCode[code] || {}) };
        return {
          id: code || e.empCode || e.employeeId || e.employeeName || "unknown-employee",
          empCode: code || e.empCode,
          employeeName: e.employeeName,
          ...mapLedgerLeaveFields(b),
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
          carried_cl: b.carried_cl ?? 0,
          expired_cl: b.expired_cl ?? 0,
        };
      }),
    [filteredEmployees, balanceByCode, registerUsageByCode]
  );

  const ledgerRows = useMemo(() => {
    const needle = ledgerSearch.trim().toLowerCase();
    const tabFields = LEDGER_TAB_FIELD_KEYS[ledgerSubTab] || [];
    const filtered = !needle
      ? balancesRows
      : balancesRows.filter((row) => {
          const hay = [row.empCode, row.employeeName, ...tabFields.map((k) => row[k])]
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
  }, [balancesRows, ledgerSearch, ledgerSort, ledgerSubTab]);

  const ledgerTabTotals = useMemo(() => {
    const fields = LEDGER_TAB_FIELD_KEYS[ledgerSubTab] || [];
    const totals = Object.fromEntries(fields.map((k) => [k, 0]));
    for (const row of balancesRows) {
      for (const key of fields) {
        totals[key] += Number(row[key] || 0);
      }
    }
    return totals;
  }, [balancesRows, ledgerSubTab]);

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
  }, [ledgerSearch, ledgerSort.key, ledgerSort.direction, ledgerSubTab]);

  useEffect(() => {
    const validKeys = new Set(["empCode", "employeeName", ...(LEDGER_TAB_FIELD_KEYS[ledgerSubTab] || [])]);
    if (!validKeys.has(ledgerSort.key)) {
      setLedgerSort({ key: "empCode", direction: "asc" });
    }
  }, [ledgerSubTab, ledgerSort.key]);

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

  const numCol = useCallback(
    (key, label, minW = "min-w-[100px]") => ({
      key,
      label: sortLabel(label, key),
      render: (r) => fmtNum(r[key]),
      headerClassName: minW,
      cellClassName: `text-right tabular-nums ${minW}`,
    }),
    [sortLabel]
  );

  const ledgerEmployeeColumns = useMemo(
    () => [
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
    ],
    [sortLabel]
  );

  const ledgerActionsColumn = useMemo(
    () => ({
      key: "actions",
      label: "Actions",
      headerClassName: "min-w-[88px]",
      cellClassName: "min-w-[88px]",
      render: (r) => (
        <button
          type="button"
          onClick={() => setLedgerEditRow(r)}
          disabled={!r.empCode || loading || importOpen}
          className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50"
        >
          Edit
        </button>
      ),
    }),
    [importOpen, loading]
  );

  const ledgerLeaveColumnsForTab = useCallback(
    (tabId) =>
      LEDGER_LEAVE_TYPES.map((t) =>
        numCol(`${LEDGER_TAB_PREFIX[tabId]}_${t.key}`, t.label, "min-w-[72px]")
      ),
    [numCol]
  );

  const ledgerColumnsByTab = useMemo(
    () => ({
      opening: [...ledgerEmployeeColumns, ...ledgerLeaveColumnsForTab("opening"), ledgerActionsColumn],
      used: [...ledgerEmployeeColumns, ...ledgerLeaveColumnsForTab("used"), ledgerActionsColumn],
      balance: [...ledgerEmployeeColumns, ...ledgerLeaveColumnsForTab("balance"), ledgerActionsColumn],
    }),
    [ledgerActionsColumn, ledgerEmployeeColumns, ledgerLeaveColumnsForTab]
  );

  const ledgerTabDescriptions = {
    opening: "Opening leave balances by type (CL, PL, SL, and other leave categories).",
    used: "Leave days used during the selected year, by leave type.",
    balance: "Current leave balance by type (CL, PL, SL from ledger; other types shown when available).",
  };

  const ledgerTabMetricLabels = {
    opening: LEDGER_LEAVE_TYPES.map((t) => ({
      key: `opening_${t.key}`,
      label: `Total ${t.label} Opening`,
      tone: "bg-blue-50/50",
    })),
    used: LEDGER_LEAVE_TYPES.map((t) => ({
      key: `used_${t.key}`,
      label: `Total ${t.label} Used`,
      tone: "bg-amber-50/50",
    })),
    balance: LEDGER_LEAVE_TYPES.map((t) => ({
      key: `balance_${t.key}`,
      label: `Total ${t.label} Balance`,
      tone: "bg-emerald-50/50",
    })),
  };

  const handleImportComplete = useCallback(
    async (message) => {
      setImportMessage(message);
      setTimeout(() => setImportMessage(""), 6000);
      await reloadBalances();
    },
    [reloadBalances]
  );

  const downloadSampleSheet = useCallback(() => {
    const rows = filteredEmployees
      .filter((e) => e.employeeName || e.empCode)
      .map((e) => ({
        empCode: normalizeAttendanceEmpCode(e.empCode) || e.empCode || "",
        employeeName: e.employeeName || "",
        department: e.department || "",
      }));
    downloadLeaveBalanceSampleSheet(year, rows);
  }, [filteredEmployees, year]);

  const saveLedgerEdit = useCallback(
    async (form) => {
      setLedgerEditSaving(true);
      setError("");
      try {
        await upsertLeaveBalanceYearly(supabase, form, year);
        await reloadBalances();
        setLedgerEditRow(null);
        setImportMessage("Ledger row saved.");
        setTimeout(() => setImportMessage(""), 4000);
      } catch (e) {
        setError(e?.message || "Could not save ledger row.");
      } finally {
        setLedgerEditSaving(false);
      }
    },
    [reloadBalances, year]
  );

  const exportLedgerToExcel = useCallback(() => {
    const tabPrefix = LEDGER_TAB_PREFIX[ledgerSubTab] || "opening";
    const rows = ledgerRows.map((r) => {
      const out = {
        "Employee Code": r.empCode || "",
        Employee: r.employeeName || "",
      };
      for (const t of LEDGER_LEAVE_TYPES) {
        out[t.label] = Number(r[`${tabPrefix}_${t.key}`] || 0);
      }
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Leave Ledger ${year}`);
    XLSX.writeFile(wb, `leave-balance-ledger-${year}-${ledgerSubTab}.xlsx`);
  }, [ledgerRows, ledgerSubTab, year]);

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
            {realtimeLive ? <StatusChip label="Live" severity="info" /> : null}
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
            <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200 pb-2">
              {LEDGER_SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLedgerSubTab(tab.id)}
                  className={`h-9 px-4 rounded-t-lg text-xs font-semibold border-b-2 transition ${
                    ledgerSubTab === tab.id
                      ? "border-[#1F3A8A] text-[#1F3A8A] bg-[#1F3A8A]/5"
                      : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
              {(ledgerTabMetricLabels[ledgerSubTab] || []).map((metric) => (
                <MetricCard
                  key={metric.key}
                  label={metric.label}
                  value={fmtNum(ledgerTabTotals[metric.key])}
                  tone={metric.tone}
                />
              ))}
              <MetricCard label="Employees" value={ledgerRows.length} />
              <MetricCard label="Data Year" value={year} />
            </div>

            <div className="space-y-3">
              <FilterBar>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase">Search employee</label>
                  <TinyInput
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Code, name, or values in this tab..."
                    className="min-w-[280px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={downloadSampleSheet}
                  disabled={loading}
                  className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                >
                  Download Sample Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  disabled={loading}
                  className="h-8 px-3 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-900 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-60"
                >
                  Import
                </button>
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
              {importMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  {importMessage}
                </div>
              ) : null}
              <p className="text-[11px] text-gray-500">{ledgerTabDescriptions[ledgerSubTab]}</p>
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
                frozenColumnCount={2}
                frozenColumnWidths={[130, 220]}
                columns={ledgerColumnsByTab[ledgerSubTab] || []}
              />
              <LeaveLedgerEditModal
                open={!!ledgerEditRow}
                row={ledgerEditRow}
                year={year}
                saving={ledgerEditSaving}
                onClose={() => setLedgerEditRow(null)}
                onSave={saveLedgerEdit}
              />
              <LeaveBalanceImportModal
                open={importOpen}
                year={year}
                employees={filteredEmployees}
                onClose={() => setImportOpen(false)}
                onImported={handleImportComplete}
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


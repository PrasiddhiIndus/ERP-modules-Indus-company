import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FormDateInput from "../../../components/FormDateInput";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Moon,
  RefreshCw,
  Search,
  Sun,
  X,
} from "lucide-react";
import {
  SectionCard,
  KpiTile,
  Badge,
  FilterBar,
  DenseTable,
  Drawer,
  Modal,
  Timeline,
  TinyInput,
  TinySelect,
  StatusChip,
} from "../../adminOperations/components/AdminUi";
import { formatStatus, statusTone } from "../data/mockOperationsData";

export {
  SectionCard,
  KpiTile,
  Badge,
  FilterBar,
  DenseTable,
  Drawer,
  Modal,
  Timeline,
  TinyInput,
  TinySelect,
};

const toneMap = {
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  danger: "bg-red-50 text-red-900 border-red-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};

export function OpsStatusBadge({ status }) {
  const tone = statusTone(status);
  const sev = tone === "success" ? "info" : tone === "danger" ? "critical" : tone === "warning" ? "warning" : "info";
  if (toneMap[tone]) {
    return (
      <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-medium ${toneMap[tone]}`}>
        {formatStatus(status)}
      </span>
    );
  }
  return <StatusChip label={formatStatus(status)} severity={sev} />;
}

export function useThemeClasses(theme) {
  const dark = theme === "dark";
  return {
    dark,
    shell: dark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-gray-900",
    sidebar: dark ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200",
    header: dark ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200",
    card: dark ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100",
    muted: dark ? "text-slate-400" : "text-gray-500",
    input: dark
      ? "bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
      : "bg-white border-gray-300 text-gray-900",
    navActive: dark ? "bg-blue-950 text-blue-300 border-blue-600" : "bg-blue-50 text-[#1F3A8A] border-[#1F3A8A]",
    navIdle: dark ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
    tableHead: dark ? "bg-slate-800 text-slate-300" : "bg-gray-50 text-gray-600",
    tableRow: dark ? "hover:bg-slate-800/60" : "hover:bg-blue-50/40",
  };
}

export function Breadcrumbs({ items, theme }) {
  const t = useThemeClasses(theme);
  return (
    <nav className="flex flex-wrap items-center gap-1 text-[11px] mb-3" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className={t.muted}>/</span>}
          {item.path && i < items.length - 1 ? (
            <Link to={item.path} className={`${t.muted} hover:text-[#1F3A8A] font-medium`}>
              {item.label}
            </Link>
          ) : (
            <span className={i === items.length - 1 ? "font-semibold text-[#1F3A8A]" : t.muted}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function PageHeader({ title, subtitle, onRefresh, onExport, primaryAction, theme = "light" }) {
  const t = useThemeClasses(theme);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div>
        <h2 className={`text-lg font-bold ${t.dark ? "text-slate-100" : "text-gray-900"}`}>{title}</h2>
        {subtitle && <p className={`text-xs mt-0.5 ${t.muted}`}>{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs border rounded-lg ${t.input}`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs border rounded-lg ${t.input}`}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        )}
        {primaryAction}
      </div>
    </div>
  );
}

export function PrimaryButton({ children, onClick, icon: Icon, disabled, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-[#1F3A8A] rounded-lg hover:bg-[#172554] disabled:opacity-50"
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function FormField({ label, error, required, children, hint }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
      {error && <p className="text-[10px] text-red-600 mt-0.5">{error}</p>}
    </label>
  );
}

export function FormInput({ error, className = "", type, value, onChange, ...props }) {
  if (type === "date") {
    return (
      <FormDateInput
        value={value}
        onChange={onChange}
        className={`w-full h-9 border rounded-lg px-2.5 text-sm ${
          error ? "border-red-400 bg-red-50/30" : "border-gray-300"
        } ${className}`}
        compact
        {...props}
      />
    );
  }
  return (
    <input
      {...props}
      type={type}
      value={value}
      onChange={onChange}
      className={`w-full h-9 border rounded-lg px-2.5 text-sm ${
        error ? "border-red-400 bg-red-50/30" : "border-gray-300"
      } ${className}`}
    />
  );
}

export function FormSelect({ error, children, className = "", ...props }) {
  return (
    <select
      {...props}
      className={`w-full h-9 border rounded-lg px-2.5 text-sm bg-white ${
        error ? "border-red-400 bg-red-50/30" : "border-gray-300"
      } ${className}`}
    >
      {children}
    </select>
  );
}

export function FormTextarea({ error, className = "", ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full border rounded-lg px-2.5 py-2 text-sm min-h-[72px] ${
        error ? "border-red-400 bg-red-50/30" : "border-gray-300"
      } ${className}`}
    />
  );
}

export function LoadingSkeleton({ rows = 4, theme = "light" }) {
  const t = useThemeClasses(theme);
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`h-10 rounded-lg ${t.dark ? "bg-slate-800" : "bg-gray-100"}`} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-12 px-4">
      {Icon && <Icon className="w-10 h-10 mx-auto text-gray-300 mb-3" />}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="text-center py-12 px-4 border border-red-200 bg-red-50 rounded-xl">
      <p className="text-sm font-medium text-red-800">{message || "Something went wrong"}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-xs text-[#1F3A8A] font-medium">
          Try again
        </button>
      )}
    </div>
  );
}

export function LinkedSiteChip({ site, onClick }) {
  if (!site) return <span className="text-gray-400">—</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-[11px] text-blue-800 hover:bg-blue-100"
    >
      {site.site_code} · {site.site_name}
    </button>
  );
}

export function LinkedEmployeeChip({ employee, onClick }) {
  if (!employee) return <span className="text-gray-400">—</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-violet-200 bg-violet-50 text-[11px] text-violet-800 hover:bg-violet-100"
    >
      {employee.employeeCode} · {employee.name}
    </button>
  );
}

function SortIndicator({ active, direction }) {
  return (
    <ChevronsUpDown
      className={`w-3 h-3 ml-0.5 inline ${active ? "text-[#1F3A8A]" : "text-gray-300"}`}
      style={active ? { transform: direction === "desc" ? "rotate(180deg)" : undefined } : undefined}
    />
  );
}

export function EnterpriseDataTable({
  columns,
  rows,
  rowKey = "id",
  onRowClick,
  loading,
  emptyTitle = "No records found",
  emptyDescription,
  pageSize: initialPageSize = 10,
  enableBulk = false,
  onExport,
  theme = "light",
}) {
  const t = useThemeClasses(theme);
  const [sort, setSort] = useState({ key: null, direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [visibleKeys, setVisibleKeys] = useState(() => columns.map((c) => c.key));
  const [selected, setSelected] = useState(new Set());
  const [showColumns, setShowColumns] = useState(false);

  const visibleColumns = columns.filter((c) => visibleKeys.includes(c.key));

  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    return [...rows].sort((a, b) => {
      const av = col?.sortValue ? col.sortValue(a) : a[sort.key];
      const bv = col?.sortValue ? col.sortValue(b) : b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );
  };

  const toggleAll = () => {
    if (selected.size === pagedRows.length) setSelected(new Set());
    else setSelected(new Set(pagedRows.map((r) => r[rowKey])));
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <LoadingSkeleton rows={6} theme={theme} />;

  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${t.card}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b ${t.dark ? "border-slate-700" : "border-gray-200"}`}>
        <div className="flex items-center gap-2">
          {enableBulk && selected.size > 0 && (
            <span className="text-[11px] text-[#1F3A8A] font-medium">{selected.size} selected</span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumns((v) => !v)}
              className={`inline-flex items-center gap-1 h-7 px-2 text-[11px] border rounded ${t.input}`}
            >
              <Columns3 className="w-3 h-3" />
              Columns
            </button>
            {showColumns && (
              <div className={`absolute left-0 top-full mt-1 z-20 min-w-[160px] rounded-lg border shadow-lg p-2 ${t.card}`}>
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-[11px] py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleKeys.includes(c.key)}
                      onChange={() =>
                        setVisibleKeys((keys) =>
                          keys.includes(c.key) ? keys.filter((k) => k !== c.key) : [...keys, c.key]
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {onExport && (
            <button type="button" onClick={() => onExport(sortedRows)} className={`inline-flex items-center gap-1 h-7 px-2 text-[11px] border rounded ${t.input}`}>
              <Download className="w-3 h-3" />
              Export
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={t.muted}>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className={`h-7 border rounded px-1 ${t.input}`}
          >
            {[5, 10, 25, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className={t.tableHead}>
            <tr>
              {enableBulk && (
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" checked={selected.size === pagedRows.length && pagedRows.length > 0} onChange={toggleAll} />
                </th>
              )}
              {visibleColumns.map((c) => (
                <th key={c.key} className="px-2 py-2 text-left font-semibold whitespace-nowrap">
                  {c.sortable !== false ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center hover:text-[#1F3A8A]">
                      {c.label}
                      <SortIndicator active={sort.key === c.key} direction={sort.direction} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${t.dark ? "divide-slate-700" : "divide-gray-100"}`}>
            {pagedRows.map((row, idx) => (
              <tr
                key={row[rowKey]}
                className={`${onRowClick ? "cursor-pointer" : ""} ${t.tableRow}`}
                onClick={() => onRowClick?.(row)}
              >
                {enableBulk && (
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(row[rowKey])} onChange={() => toggleRow(row[rowKey])} />
                  </td>
                )}
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5 whitespace-nowrap">
                    {c.render ? c.render(row, idx) : row[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`flex items-center justify-between px-3 py-2 border-t text-[11px] ${t.dark ? "border-slate-700" : "border-gray-200"}`}>
        <span className={t.muted}>
          {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedRows.length)} of {sortedRows.length}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)} className="p-1 rounded disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className={t.muted}>Page {currentPage} / {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1 rounded disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function GlobalSearchBar({ value, onChange, onClear, theme = "light" }) {
  const t = useThemeClasses(theme);
  return (
    <div className="relative flex-1 max-w-md">
      <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${t.muted}`} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search expenses, advances, employees, sites…"
        className={`w-full h-8 pl-8 pr-8 text-xs border rounded-lg ${t.input}`}
      />
      {value && (
        <button type="button" onClick={onClear} className={`absolute right-2 top-1/2 -translate-y-1/2 ${t.muted}`}>
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
    </button>
  );
}

export function NotificationPanel({ open, onClose, notifications, onMarkRead, onMarkAllRead, theme = "light" }) {
  const t = useThemeClasses(theme);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close notifications" />
      <div className={`relative w-full max-w-sm h-full shadow-2xl border-l flex flex-col ${t.sidebar}`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${t.dark ? "border-slate-700" : "border-gray-200"}`}>
          <h4 className="text-sm font-semibold">Notifications</h4>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onMarkAllRead} className="text-[11px] text-[#1F3A8A]">Mark all read</button>
            <button type="button" onClick={onClose} className={t.muted}><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onMarkRead(n.id)}
              className={`w-full text-left rounded-lg border px-3 py-2 text-xs ${
                n.unread
                  ? t.dark ? "bg-blue-950/40 border-blue-800" : "bg-blue-50 border-blue-200"
                  : t.dark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-100"
              }`}
            >
              <p className="font-semibold">{n.title}</p>
              <p className={`mt-0.5 ${t.muted}`}>{n.body}</p>
              <p className={`mt-1 text-[10px] ${t.muted}`}>{n.time}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 mb-3">
      UI preview mode — data linked to People Master & Site Master (mock operations records).
    </div>
  );
}

export function QuickActions({ actions }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-[#1F3A8A]/30 text-[#1F3A8A] rounded-lg bg-blue-50/50 hover:bg-blue-50"
        >
          {a.icon && <a.icon className="w-3.5 h-3.5" />}
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function ChartCard({ title, children, theme = "light" }) {
  const t = useThemeClasses(theme);
  return (
    <div className={`rounded-xl border shadow-sm ${t.card}`}>
      <div className={`px-4 py-2.5 border-b ${t.dark ? "border-slate-700" : "border-gray-200"}`}>
        <h3 className={`text-sm font-semibold ${t.dark ? "text-slate-100" : "text-gray-900"}`}>{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

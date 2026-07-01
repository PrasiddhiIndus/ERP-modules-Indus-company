import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ClipboardList,
  Filter,
  IndianRupee,
  Loader2,
  RefreshCw,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DateInput } from "../../components/DateInput";
import { supabase } from "../../lib/supabase";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  formatInquiryCellValue,
  getExcelInquiryFields,
  INQUIRY_DB_COLUMNS,
  MODE_OF_SUBMISSION_OPTIONS,
  VERTICAL_OPTIONS,
} from "./utils/manpowerEnquiryExcelFields";
import {
  activeDashboardFilterCount,
  applyDashboardFilters,
  CHART_PALETTE,
  computeDashboardStats,
  countByField,
  countByMonth,
  countByStatus,
  countByVertical,
  DASHBOARD_EMPTY_FILTERS,
  DASHBOARD_TABLE_COLUMNS,
  getAttentionRows,
  getInquiryFilterOptions,
  INQUIRY_STATUS_OPTIONS,
  manpowerByVertical,
  sortInquiries,
  STATUS_CHART_COLORS,
  valueByVertical,
} from "./utils/manpowerInquiryDashboard";
import ManpowerNavbar from "./ManpowerNavbar";
import "./manpowerEnquiryDashboard.css";

const MANPOWER_BASE = "/app/commercial/manpower-training/manpower-management";

const selectCls =
  "w-full min-h-[38px] py-2 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const labelStyle = { fontSize: 11, fontWeight: 600, fill: "#374151" };

const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 1400,
  animationEasing: "ease-out",
};

const DEFAULT_TABLE_SORT = { key: "srNo", dir: "desc" };

function ChartDefs() {
  return (
    <defs>
      <linearGradient id="mpBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
      <linearGradient id="mpLineGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="mpValueGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a78bfa" />
        <stop offset="100%" stopColor="#6d28d9" />
      </linearGradient>
      <filter id="mpPieGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#3b82f6" floodOpacity="0.35" />
      </filter>
      <filter id="mpBarShadow" x="-10%" y="-10%" width="130%" height="140%">
        <feDropShadow dx="2" dy="5" stdDeviation="4" floodColor="#1e40af" floodOpacity="0.28" />
      </filter>
    </defs>
  );
}

function renderPieLabel({ value, percent }) {
  if (!value) return null;
  return `${value} (${Math.round(percent * 100)}%)`;
}

function renderActivePieShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g filter="url(#mpPieGlow)">
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 14}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.35}
      />
    </g>
  );
}

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <div className={`mp-chart-card ${className}`}>
      <div className="mp-chart-head">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="mp-chart-body">{children}</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
  };
  return (
    <div className={`mp-kpi-card ${tones[tone] || tones.blue}`}>
      <div className="mp-kpi-head">
        <p className="mp-kpi-label">{label}</p>
        <div className="mp-kpi-icon">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="mp-kpi-value">{value}</p>
      <p className="mp-kpi-sub">{sub || "\u00a0"}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, labelKey = "name", valueKey = "value", total, suffix = "enquiries" }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const val = payload[0]?.value ?? row[valueKey];
  const pct = total && val ? Math.round((val / total) * 100) : null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{row[labelKey] ?? payload[0]?.name}</p>
      <p className="text-gray-600 mt-0.5">
        {typeof val === "number" ? val.toLocaleString("en-IN") : val} {suffix}
        {pct != null ? ` · ${pct}%` : ""}
      </p>
    </div>
  );
}

function SortIcon({ columnKey, sortConfig }) {
  if (sortConfig.key !== columnKey) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />;
  return sortConfig.dir === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />;
}

function formatCurrencyShort(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)} Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)} L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} K`;
  return n.toLocaleString("en-IN");
}

export default function ManpowerEnquiryDashboard({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DASHBOARD_EMPTY_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusPie, setActiveStatusPie] = useState(null);
  const [activeVerticalPie, setActiveVerticalPie] = useState(null);
  const [tableSort, setTableSort] = useState(DEFAULT_TABLE_SORT);
  const [showRegister, setShowRegister] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: e } = await supabase
        .from("manpower_enquiries")
        .select(INQUIRY_DB_COLUMNS.join(", "))
        .order("created_at", { ascending: false });
      if (e) throw e;
      setRows(data || []);
    } catch (err) {
      setError(err?.message || "Failed to load manpower enquiry data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filterOptions = useMemo(() => getInquiryFilterOptions(rows), [rows]);

  const filteredRows = useMemo(
    () => applyDashboardFilters(rows, { searchQuery, filters }),
    [rows, searchQuery, filters]
  );

  const filterCount = activeDashboardFilterCount({ ...filters, search: searchQuery });

  const stats = useMemo(() => computeDashboardStats(filteredRows), [filteredRows]);

  const statusData = useMemo(() => countByStatus(filteredRows), [filteredRows]);
  const verticalData = useMemo(() => countByVertical(filteredRows), [filteredRows]);
  const assigneeData = useMemo(() => countByField(filteredRows, "enquiryAssignedTo"), [filteredRows]);
  const modeData = useMemo(() => countByField(filteredRows, "modeOfSubmission", "Not specified"), [filteredRows]);
  const trendData = useMemo(() => countByMonth(filteredRows), [filteredRows]);
  const manpowerData = useMemo(() => manpowerByVertical(filteredRows), [filteredRows]);
  const valueData = useMemo(() => valueByVertical(filteredRows), [filteredRows]);

  const statusTotal = useMemo(() => statusData.reduce((s, d) => s + d.value, 0), [statusData]);
  const verticalTotal = useMemo(() => verticalData.reduce((s, d) => s + d.value, 0), [verticalData]);

  const attentionRows = useMemo(() => getAttentionRows(filteredRows, 12), [filteredRows]);

  const sortedRegister = useMemo(() => sortInquiries(filteredRows, tableSort), [filteredRows, tableSort]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clearFilters = () => {
    setFilters(DASHBOARD_EMPTY_FILTERS);
    setSearchQuery("");
  };

  const toggleTableSort = (key) => {
    setTableSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  if (loading) {
    return (
      <div className={embedded ? "py-12" : "p-6"}>
        {!embedded && <ManpowerNavbar />}
        <div className="flex items-center justify-center py-24 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "p-4 sm:p-6"}>
      {!embedded && <ManpowerNavbar />}

      <div className={`mp-enquiry-analytics space-y-5 ${embedded ? "" : "max-w-[1680px] mx-auto"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className={`font-semibold text-gray-900 flex items-center gap-2 ${embedded ? "text-base" : "text-lg"}`}>
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Manpower Enquiry Analytics
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Advanced charts, filters, and sorting across verticals, submission modes, assignment, and pipeline value.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!embedded && (
              <Link
                to={MANPOWER_BASE}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <ClipboardList className="w-4 h-4" />
                Enquiry List
              </Link>
            )}
            <button
              type="button"
              onClick={fetchRows}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4 mp-filter-panel">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
              {filterCount > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {filterCount} active
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>
                Showing <strong className="text-gray-900">{filteredRows.length}</strong> of{" "}
                <strong className="text-gray-900">{rows.length}</strong> enquiries
              </span>
              {filterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium"
                >
                  <X className="w-3 h-3" />
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="mp-filter-grid">
            <label className="mp-filter-search">
              <span>Search</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Client, location, remarks, enquiry no…"
                className={selectCls}
              />
            </label>
            <label>
              <span>Received from</span>
              <DateInput
                value={filters.receivedFrom}
                onChange={(v) => setFilter("receivedFrom", v)}
                className={selectCls}
                placeholder="dd/mm/yyyy"
              />
            </label>
            <label>
              <span>Received to</span>
              <DateInput
                value={filters.receivedTo}
                onChange={(v) => setFilter("receivedTo", v)}
                className={selectCls}
                placeholder="dd/mm/yyyy"
              />
            </label>
            <label>
              <span>Due from</span>
              <DateInput
                value={filters.dueFrom}
                onChange={(v) => setFilter("dueFrom", v)}
                className={selectCls}
                placeholder="dd/mm/yyyy"
              />
            </label>
            <label>
              <span>Due to</span>
              <DateInput
                value={filters.dueTo}
                onChange={(v) => setFilter("dueTo", v)}
                className={selectCls}
                placeholder="dd/mm/yyyy"
              />
            </label>
            <label>
              <span>Status</span>
              <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
                <option value="">All statuses</option>
                {INQUIRY_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                {filterOptions.status
                  .filter((s) => !INQUIRY_STATUS_OPTIONS.includes(s))
                  .map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Vertical</span>
              <select value={filters.vertical} onChange={(e) => setFilter("vertical", e.target.value)} className={selectCls}>
                <option value="">All verticals</option>
                {VERTICAL_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Mode of submission</span>
              <select
                value={filters.modeOfSubmission}
                onChange={(e) => setFilter("modeOfSubmission", e.target.value)}
                className={selectCls}
              >
                <option value="">All modes</option>
                {MODE_OF_SUBMISSION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Assigned to</span>
              <select
                value={filters.enquiryAssignedTo}
                onChange={(e) => setFilter("enquiryAssignedTo", e.target.value)}
                className={selectCls}
              >
                <option value="">All assignees</option>
                <option value="__unassigned__">Unassigned</option>
                {filterOptions.enquiryAssignedTo.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Offer submitted</span>
              <select
                value={filters.offerSubmitted}
                onChange={(e) => setFilter("offerSubmitted", e.target.value)}
                className={selectCls}
              >
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mp-kpi-grid">
          <KpiCard icon={ClipboardList} label="Total" value={stats.total} tone="blue" />
          <KpiCard icon={Users} label="Pending" value={stats.pending} tone="amber" />
          <KpiCard icon={CheckCircle2} label="Approved" value={stats.approved} tone="green" />
          <KpiCard icon={AlertTriangle} label="Rejected" value={stats.rejected} tone="red" />
          <KpiCard icon={UserCheck} label="Quoted" value={stats.quoted} tone="sky" />
          <KpiCard icon={Users} label="Unassigned" value={stats.unassigned} sub="No assignee" tone="slate" />
          <KpiCard icon={AlertTriangle} label="Overdue" value={stats.overdue} sub="Past due date" tone="red" />
          <KpiCard icon={AlertTriangle} label="Due in 7 days" value={stats.dueSoon} sub="Open enquiries" tone="amber" />
          <KpiCard icon={Users} label="Manpower" value={stats.totalManpower.toLocaleString("en-IN")} sub="Headcount sum" tone="violet" />
          <KpiCard
            icon={IndianRupee}
            label="Pipeline value"
            value={formatCurrencyShort(stats.totalValue)}
            sub={`₹${stats.totalValue.toLocaleString("en-IN")} approx.`}
            tone="violet"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Approval Status" subtitle="Workflow status of filtered enquiries">
            {statusData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <ChartDefs />
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={90}
                    paddingAngle={3}
                    label={renderPieLabel}
                    labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                    activeIndex={activeStatusPie}
                    activeShape={renderActivePieShape}
                    onMouseEnter={(_, i) => setActiveStatusPie(i)}
                    onMouseLeave={() => setActiveStatusPie(null)}
                    {...CHART_ANIM}
                  >
                    {statusData.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={entry.fill}
                        stroke="#fff"
                        strokeWidth={2}
                        style={{ filter: "url(#mpBarShadow)", animationDelay: `${i * 80}ms` }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip total={statusTotal} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500 py-16 text-center">No enquiries match the current filters.</p>
            )}
          </ChartCard>

          <ChartCard title="Vertical Split" subtitle="Fire Tender · Manpower · Training">
            {verticalData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <ChartDefs />
                  <Pie
                    data={verticalData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={92}
                    paddingAngle={3}
                    label={renderPieLabel}
                    labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                    activeIndex={activeVerticalPie}
                    activeShape={renderActivePieShape}
                    onMouseEnter={(_, i) => setActiveVerticalPie(i)}
                    onMouseLeave={() => setActiveVerticalPie(null)}
                    {...CHART_ANIM}
                  >
                    {verticalData.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={entry.fill}
                        stroke="#fff"
                        strokeWidth={2}
                        style={{ filter: "url(#mpBarShadow)", animationDelay: `${i * 90}ms` }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip total={verticalTotal} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500 py-16 text-center">No vertical data for current filters.</p>
            )}
          </ChartCard>

          <ChartCard title="Assigned to" subtitle="Workload by team member">
            {assigneeData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={assigneeData.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 28 }}>
                  <ChartDefs />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip valueKey="value" total={stats.total} />} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} {...CHART_ANIM}>
                    {assigneeData.slice(0, 12).map((_, i) => (
                      <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} style={{ filter: "url(#mpBarShadow)" }} />
                    ))}
                    <LabelList dataKey="value" position="right" style={labelStyle} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500 py-16 text-center">No assignment data.</p>
            )}
          </ChartCard>

          <ChartCard title="Mode of Submission" subtitle="How enquiries were received (top 10)">
            {modeData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={modeData.slice(0, 10)} margin={{ bottom: 48, top: 16 }}>
                  <ChartDefs />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} height={70} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip valueKey="value" total={stats.total} />} />
                  <Bar dataKey="value" fill="url(#mpBarGrad)" radius={[6, 6, 0, 0]} style={{ filter: "url(#mpBarShadow)" }} {...CHART_ANIM}>
                    <LabelList dataKey="value" position="top" style={labelStyle} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500 py-16 text-center">No submission mode data.</p>
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Manpower Demand by Vertical" subtitle="Sum of headcount requested">
            {manpowerData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={manpowerData} margin={{ bottom: 24, top: 16 }}>
                  <ChartDefs />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip valueKey="manpower" suffix="people" />} />
                  <Bar dataKey="manpower" fill="#8b5cf6" radius={[6, 6, 0, 0]} style={{ filter: "url(#mpBarShadow)" }} {...CHART_ANIM}>
                    <LabelList dataKey="manpower" position="top" style={labelStyle} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500 py-16 text-center">No manpower counts in filtered set.</p>
            )}
          </ChartCard>

          <ChartCard title="Approx Value by Vertical" subtitle="Pipeline value (WO taxes) — filtered">
            {valueData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={valueData} margin={{ bottom: 24, top: 16 }}>
                  <ChartDefs />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrencyShort(v)}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const val = payload[0].value;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
                          <p className="font-semibold text-gray-900">{payload[0].payload.name}</p>
                          <p className="text-gray-600 mt-0.5">₹{Number(val).toLocaleString("en-IN")}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="value" fill="url(#mpValueGrad)" radius={[6, 6, 0, 0]} style={{ filter: "url(#mpBarShadow)" }} {...CHART_ANIM}>
                    <LabelList dataKey="value" position="top" formatter={(v) => formatCurrencyShort(v)} style={labelStyle} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500 py-16 text-center">No value data in filtered set.</p>
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_.9fr] gap-4">
          <ChartCard title="Enquiries Over Time" subtitle="Monthly count by received date (last 12 months)">
            {trendData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={trendData} margin={{ top: 20, right: 12 }}>
                  <ChartDefs />
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
                          <p className="font-semibold text-gray-900">{payload[0].payload.name}</p>
                          <p className="text-gray-600 mt-0.5">{payload[0].value} enquiries</p>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="count" fill="url(#mpLineGrad)" stroke="none" {...CHART_ANIM} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 5, strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 8, strokeWidth: 0, fill: "#1d4ed8" }}
                    {...CHART_ANIM}
                  >
                    <LabelList dataKey="count" position="top" offset={8} style={labelStyle} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-500 py-16 text-center">No receipt dates in filtered set.</p>
            )}
          </ChartCard>

          <ChartCard title="Status Legend" subtitle="Counts for filtered selection">
            <div className="space-y-2">
              {INQUIRY_STATUS_OPTIONS.map((status) => (
                <div key={status} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-4 h-4 rounded border border-gray-200 shrink-0"
                      style={{ backgroundColor: STATUS_CHART_COLORS[status] }}
                    />
                    <span className="text-gray-800 truncate">{status}</span>
                  </div>
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {statusData.find((d) => d.name === status)?.value ?? 0}
                  </span>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-600">Offers submitted</span>
                <span className="font-semibold text-gray-900 tabular-nums">{stats.offerSubmitted}</span>
              </div>
            </div>
          </ChartCard>
        </div>

        {attentionRows.length > 0 && (
          <ChartCard title="Overdue & Due Today" subtitle="Open filtered enquiries at or past submission due date">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4 font-semibold">Sr.</th>
                    <th className="py-2 pr-4 font-semibold">Client</th>
                    <th className="py-2 pr-4 font-semibold">Vertical</th>
                    <th className="py-2 pr-4 font-semibold">Assigned To</th>
                    <th className="py-2 pr-4 font-semibold">Due Date</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attentionRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-red-50/30">
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{row.srNo ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-gray-800">
                        <Link to={`${MANPOWER_BASE}/${row.id}`} className="text-blue-700 hover:underline">
                          {row.client}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-700">{row.vertical}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{row.assignee}</td>
                      <td className="py-2.5 pr-4 text-red-700 font-medium">{formatDateDdMmYyyy(row.dueDate)}</td>
                      <td className="py-2.5 text-gray-700">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}

        <ChartCard
          title="Filtered Register"
          subtitle={`Sortable table — ${sortedRegister.length} row(s). Click column headers to sort.`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowRegister((v) => !v)}
              className="text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              {showRegister ? "Hide table" : "Show table"}
            </button>
            {!embedded && (
              <Link to={MANPOWER_BASE} className="text-xs font-medium text-blue-700 hover:underline">
                Open full enquiry list →
              </Link>
            )}
          </div>
          {showRegister && (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto border border-gray-100 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    {DASHBOARD_TABLE_COLUMNS.map((col) => (
                      <th key={col.id} className="py-2 px-3 font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleTableSort(col.id)}
                          className="inline-flex items-center gap-1 hover:text-gray-900"
                        >
                          {col.label}
                          <SortIcon columnKey={col.id} sortConfig={tableSort} />
                        </button>
                      </th>
                    ))}
                    <th className="py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRegister.length === 0 ? (
                    <tr>
                      <td colSpan={DASHBOARD_TABLE_COLUMNS.length + 1} className="py-8 text-center text-gray-500">
                        No enquiries match the current filters.
                      </td>
                    </tr>
                  ) : (
                    sortedRegister.map((row) => {
                      const fields = getExcelInquiryFields(row);
                      return (
                        <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/40">
                          {DASHBOARD_TABLE_COLUMNS.map((col) => (
                            <td
                              key={col.id}
                              className={`py-2 px-3 text-gray-800 whitespace-nowrap ${
                                col.align === "right" ? "text-right tabular-nums" : ""
                              }`}
                            >
                              {col.id === "clientName" ? (
                                <Link to={`${MANPOWER_BASE}/${row.id}`} className="text-blue-700 hover:underline">
                                  {formatInquiryCellValue(fields[col.id], col.valueType, formatDateDdMmYyyy)}
                                </Link>
                              ) : (
                                formatInquiryCellValue(fields[col.id], col.valueType, formatDateDdMmYyyy)
                              )}
                            </td>
                          ))}
                          <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{row.status || "Pending"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

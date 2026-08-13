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
  BarChart3,
  ClipboardList,
  Loader2,
  Percent,
  RefreshCw,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { INQUIRY_DB_COLUMNS, VERTICAL_OPTIONS } from "./utils/manpowerEnquiryExcelFields";
import {
  activeDashboardFilterCount,
  ANALYTICS_STATUS_OPTIONS,
  applyDashboardFilters,
  buildConversionFunnel,
  CHART_PALETTE,
  computeDashboardStats,
  countAwardTrend,
  countByOutcome,
  countByStatus,
  countByVertical,
  countMonthlyVolume,
  DASHBOARD_EMPTY_FILTERS,
  formatReceivedMonthLabel,
  getReceivedMonthOptions,
  STATUS_CHART_COLORS,
} from "./utils/manpowerInquiryDashboard";
import { TOKENS } from "../../theme/tokens";
import {
  FilterBar,
  KpiTile,
  SectionCard,
  TinySelect,
} from "../adminOperations/components/AdminUi";
import ManpowerNavbar from "./ManpowerNavbar";
import "./manpowerEnquiryDashboard.css";

const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: "ease-out",
};

const labelStyle = { fontSize: 11, fontWeight: 600, fill: "var(--text-strong)" };

const VIEW_OPTIONS = [
  { id: "all", label: "All Records" },
  { id: "enquiries", label: "Enquiries" },
  { id: "tenders", label: "Tenders" },
];

function formatCurrencyShort(n) {
  if (!Number.isFinite(n) || n <= 0) return "₹ 0";
  if (n >= 10000000) return `₹ ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹ ${(n / 100000).toFixed(2)} L`;
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatStrikeRate(rate) {
  if (rate == null) return "—";
  return `${rate}%`;
}

function renderPieLabel({ value, percent }) {
  if (!value) return null;
  return `${value} (${Math.round(percent * 100)}%)`;
}

function renderActivePieShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
}

function ChartTooltip({ active, payload, label, valueKey = "value", suffix = "records" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-ink">{label || payload[0]?.payload?.name}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey || entry.name} className="mt-0.5 text-ink-secondary">
          {entry.name}:{" "}
          {typeof entry.value === "number" ? entry.value.toLocaleString("en-IN") : entry.value}
          {valueKey === "rate" ? "%" : ` ${suffix}`}
        </p>
      ))}
    </div>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <SectionCard
      title={title}
      right={subtitle ? <span className="type-meta text-ink-muted hidden sm:inline">{subtitle}</span> : null}
      className="h-full"
    >
      {children}
    </SectionCard>
  );
}

export default function ManpowerEnquiryDashboard({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DASHBOARD_EMPTY_FILTERS);
  const [activeOutcomePie, setActiveOutcomePie] = useState(null);
  const [activeVerticalPie, setActiveVerticalPie] = useState(null);
  const [activeStatusPie, setActiveStatusPie] = useState(null);

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

  const monthOptions = useMemo(() => getReceivedMonthOptions(rows), [rows]);

  const filteredRows = useMemo(
    () => applyDashboardFilters(rows, { filters }),
    [rows, filters]
  );

  const filterCount = activeDashboardFilterCount(filters);
  const stats = useMemo(() => computeDashboardStats(filteredRows), [filteredRows]);

  const outcomeData = useMemo(() => countByOutcome(filteredRows), [filteredRows]);
  const verticalData = useMemo(() => countByVertical(filteredRows), [filteredRows]);
  const statusData = useMemo(() => countByStatus(filteredRows), [filteredRows]);
  const monthlyVolume = useMemo(() => countMonthlyVolume(filteredRows), [filteredRows]);
  const awardTrend = useMemo(() => countAwardTrend(filteredRows), [filteredRows]);
  const funnelData = useMemo(() => buildConversionFunnel(filteredRows), [filteredRows]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters({ ...DASHBOARD_EMPTY_FILTERS });

  if (loading) {
    return (
      <div className={embedded ? "py-12" : "p-6"}>
        {!embedded && <ManpowerNavbar />}
        <div className="flex items-center justify-center py-24 text-ink-muted">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "p-4 sm:p-6"}>
      {!embedded && <ManpowerNavbar />}

      <div className={`mp-enquiry-analytics space-y-4 ${embedded ? "" : "mx-auto max-w-[1680px]"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="type-card-title flex items-center gap-2 text-ink">
              <BarChart3 className="h-5 w-5 text-accent" />
              Enquiry Analytics
            </h2>
            <p className="type-meta mt-1 text-ink-secondary">
              Volume, outcomes, pipeline value, and strike rates from the enquiry register.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchRows}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-raised"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical">
            {error}
          </div>
        ) : null}

        <FilterBar>
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="mb-1 text-[11px] font-medium text-ink-secondary">View</p>
                <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                  {VIEW_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFilter("view", opt.id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        filters.view === opt.id
                          ? "bg-accent text-white"
                          : "text-ink-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-secondary">Month</span>
                <TinySelect
                  value={filters.receivedMonth || ""}
                  onChange={(e) => setFilter("receivedMonth", e.target.value)}
                  className="min-w-[140px]"
                >
                  <option value="">All months</option>
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatReceivedMonthLabel(m)}
                    </option>
                  ))}
                </TinySelect>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-secondary">Vertical</span>
                <TinySelect
                  value={filters.vertical || ""}
                  onChange={(e) => setFilter("vertical", e.target.value)}
                  className="min-w-[140px]"
                >
                  <option value="">All verticals</option>
                  {VERTICAL_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </TinySelect>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-secondary">Status</span>
                <TinySelect
                  value={filters.analyticsStatus || ""}
                  onChange={(e) => setFilter("analyticsStatus", e.target.value)}
                  className="min-w-[160px]"
                >
                  <option value="">All status</option>
                  {ANALYTICS_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </TinySelect>
              </label>

              <button
                type="button"
                onClick={clearFilters}
                disabled={filterCount === 0 && filters.view === "all"}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-raised disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary lg:self-end">
              <ClipboardList className="h-3.5 w-3.5 text-accent" />
              <span>
                Total Records: <strong className="text-ink">{filteredRows.length}</strong>
                {filteredRows.length !== rows.length ? (
                  <span className="text-ink-muted"> / {rows.length}</span>
                ) : null}
              </span>
            </div>
          </div>
        </FilterBar>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Total Enquiries"
            value={String(stats.total)}
            sub={`${stats.enquiryTotal} Enquiries · ${stats.tenderTotal} Tenders`}
            tone="border-border"
          />
          <KpiTile
            label="Awarded to IFSPL"
            value={String(stats.awarded)}
            sub={
              stats.winRate == null
                ? "No decided outcomes yet"
                : `${stats.winRate}% Win Rate`
            }
            tone="border-success-border"
          />
          <KpiTile
            label="Not Awarded"
            value={String(stats.notAwarded)}
            sub="Competed & not allotted"
            tone="border-critical-border"
          />
          <KpiTile
            label="Budgetary"
            value={String(stats.budgetary)}
            sub="Quoted — awaiting outcome"
            tone="border-warning-border"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Pipeline Value"
            value={formatCurrencyShort(stats.pipelineValue)}
            sub="Approx. value of open records"
            tone="border-accent-border"
          />
          <KpiTile
            label="Enquiry Strike Rate"
            value={formatStrikeRate(stats.enquiryStrikeRate)}
            sub={
              stats.enquiryTotal
                ? `${stats.enquiryAwarded} won out of ${stats.enquiryTotal} enquiries`
                : "No enquiries in filter"
            }
            tone="border-border"
          />
          <KpiTile
            label="Tender Strike Rate"
            value={formatStrikeRate(stats.tenderStrikeRate)}
            sub={
              stats.tenderTotal
                ? `${stats.tenderAwarded} won out of ${stats.tenderTotal} tenders`
                : "No tenders in filter"
            }
            tone="border-border"
          />
          <KpiTile
            label="Overall Strike Rate"
            value={formatStrikeRate(stats.overallStrikeRate)}
            sub={
              stats.total
                ? `${stats.awarded} total wins out of ${stats.total} records`
                : "No records in filter"
            }
            tone="border-success-border"
          />
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Volume &amp; Outcome Analysis
          </p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartPanel title="Monthly Volume" subtitle="Enquiries vs tenders received">
              {monthlyVolume.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyVolume} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={TOKENS.chartGrid} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="enquiries" name="Enquiries" fill={TOKENS.info} radius={[4, 4, 0, 0]} stackId="vol" {...CHART_ANIM} />
                    <Bar dataKey="tenders" name="Tenders" fill={CHART_PALETTE[2]} radius={[4, 4, 0, 0]} stackId="vol" {...CHART_ANIM} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-sm text-ink-muted">No receipt dates in the filtered set.</p>
              )}
            </ChartPanel>

            <ChartPanel title="Outcome Distribution" subtitle="Business status of filtered records">
              {outcomeData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={outcomeData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      label={renderPieLabel}
                      activeIndex={activeOutcomePie}
                      activeShape={renderActivePieShape}
                      onMouseEnter={(_, i) => setActiveOutcomePie(i)}
                      onMouseLeave={() => setActiveOutcomePie(null)}
                      {...CHART_ANIM}
                    >
                      {outcomeData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} stroke="var(--surface)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-sm text-ink-muted">No outcomes to chart.</p>
              )}
            </ChartPanel>

            <ChartPanel title="Vertical Split" subtitle="By service category">
              {verticalData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={verticalData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      paddingAngle={2}
                      label={renderPieLabel}
                      activeIndex={activeVerticalPie}
                      activeShape={renderActivePieShape}
                      onMouseEnter={(_, i) => setActiveVerticalPie(i)}
                      onMouseLeave={() => setActiveVerticalPie(null)}
                      {...CHART_ANIM}
                    >
                      {verticalData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} stroke="var(--surface)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-sm text-ink-muted">No vertical data.</p>
              )}
            </ChartPanel>

            <ChartPanel title="Status Distribution" subtitle="Workflow status (Pending / Quoted / …)">
              {statusData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={88}
                      paddingAngle={2}
                      label={renderPieLabel}
                      activeIndex={activeStatusPie}
                      activeShape={renderActivePieShape}
                      onMouseEnter={(_, i) => setActiveStatusPie(i)}
                      onMouseLeave={() => setActiveStatusPie(null)}
                      {...CHART_ANIM}
                    >
                      {statusData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.fill || STATUS_CHART_COLORS.Unknown}
                          stroke="var(--surface)"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-sm text-ink-muted">No status data.</p>
              )}
            </ChartPanel>

            <ChartPanel title="Award Trend" subtitle="Awarded to IFSPL by receipt month">
              {awardTrend.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={awardTrend} margin={{ top: 16, right: 8, left: 0, bottom: 8 }}>
                    <defs>
                      <linearGradient id="mpAwardArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={TOKENS.success} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={TOKENS.success} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip suffix="awards" />} />
                    <Area type="monotone" dataKey="awarded" fill="url(#mpAwardArea)" stroke="none" {...CHART_ANIM} />
                    <Line
                      type="monotone"
                      dataKey="awarded"
                      name="Awarded"
                      stroke={TOKENS.success}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "var(--surface)", strokeWidth: 2 }}
                      {...CHART_ANIM}
                    >
                      <LabelList dataKey="awarded" position="top" style={labelStyle} />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-sm text-ink-muted">No awarded records in the filtered set.</p>
              )}
            </ChartPanel>

            <ChartPanel title="Conversion Funnel" subtitle="Total → open → decided → awarded">
              {funnelData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 28, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={TOKENS.chartGrid} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} {...CHART_ANIM}>
                      {funnelData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="value" position="right" style={labelStyle} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-sm text-ink-muted">No records to build a funnel.</p>
              )}
            </ChartPanel>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card">
            <div className="mb-1 flex items-center gap-2 text-ink-secondary">
              <Percent className="h-4 w-4 text-accent" />
              <span className="type-mono-caption">Enquiry wins</span>
            </div>
            <p className="type-figure text-ink">
              {stats.enquiryAwarded}
              <span className="type-meta text-ink-muted"> / {stats.enquiryTotal}</span>
            </p>
          </div>
          <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card">
            <div className="mb-1 flex items-center gap-2 text-ink-secondary">
              <ClipboardList className="h-4 w-4 text-accent" />
              <span className="type-mono-caption">Tender wins</span>
            </div>
            <p className="type-figure text-ink">
              {stats.tenderAwarded}
              <span className="type-meta text-ink-muted"> / {stats.tenderTotal}</span>
            </p>
          </div>
          <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card">
            <div className="mb-1 flex items-center gap-2 text-ink-secondary">
              <Trophy className="h-4 w-4 text-accent" />
              <span className="type-mono-caption">Open pipeline</span>
            </div>
            <p className="type-figure text-ink">{stats.pipeline}</p>
            <p className="type-meta text-ink-muted">{formatCurrencyShort(stats.pipelineValue)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

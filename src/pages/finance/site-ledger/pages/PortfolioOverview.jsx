/**
 * Portfolio overview — one task: see how the whole site portfolio is performing for a period
 * and spot the sites that need attention.
 *
 * Extracted from SiteLedgerApp.jsx (Overview). Filters, charts and calculations are unchanged;
 * presentation uses the shared erpUi kit. Legacy chart/legend CSS classes still come from the
 * parent `<Styles />` block.
 */
import React, { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Building2, TrendingUp, History, ChevronDown, ChevronRight } from "lucide-react";
import {
  SectionCard,
  KpiTile,
  FilterBar,
  DenseTable,
  StatusChip,
  EmptyState,
  InlineAlert,
} from "../../../../components/erpUi";
import { PeriodMonthSelect } from "../../components/PeriodMonthSelect";
import { SiteClientAutocomplete } from "../../components/SiteClientAutocomplete";
import {
  prevPeriodKey,
  periodAbsoluteIndex as monthIdx,
  indexToPeriodKey,
  periodKeysBetween,
} from "../../lib/periods";
import { PARENTS, WARN_MARGIN, MONTHS, parentLabel } from "../domain/constants.js";
import { isSiteActive, versionLabel, pendingMonths, inContract } from "../domain/siteLifecycle.js";
import { inr, inrShort, pct } from "../domain/formatMoney.js";
import { calcSite, calcSiteOverPeriodKeys, parentTotalsSite } from "../calculations/siteLedgerCalcs.js";
import {
  usePlMargins,
  StatusPill,
  TipBox,
  SiteLedgerPageStyles,
  monthLabelOf,
} from "../components/SiteLedgerShared.jsx";

export const PORTFOLIO_FILTERS_INIT = {
  search: "", status: "all", contract: "all",
  revMin: "", revMax: "",
};

export function portfolioDelta(cur, prev) {
  if (prev == null || prev === 0) return null;
  return { val: ((cur - prev) / Math.abs(prev)) * 100, dir: cur - prev >= 0 ? "up" : "down" };
}

export function applyPortfolioFilters(rows, filters, month) {
  let list = rows;
  const q = filters.search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.ocNumber || "").toLowerCase().includes(q) ||
        (r.wo || "").toLowerCase().includes(q) ||
        (r.client || "").toLowerCase().includes(q),
    );
  }
  if (filters.contract === "in") list = list.filter((r) => inContract(r, month));
  if (filters.contract === "out") list = list.filter((r) => !inContract(r, month));
  if (filters.status === "reporting") list = list.filter((r) => r.hasData);
  if (filters.status === "pending") list = list.filter((r) => r.pending);
  if (filters.status === "loss") list = list.filter((r) => r.hasData && r.profit < 0);
  if (filters.status === "thin") list = list.filter((r) => r.hasData && r.profit >= 0 && r.margin < (filters._warnMargin ?? WARN_MARGIN));
  if (filters.status === "below-est") list = list.filter((r) => r.hasData && r.est && r.profit < r.est.profit);
  if (filters.revMin !== "") list = list.filter((r) => r.hasData && r.revenue >= Number(filters.revMin));
  if (filters.revMax !== "") list = list.filter((r) => r.hasData && r.revenue <= Number(filters.revMax));
  return list;
}

const trendText = (d) => (d ? `${d.val >= 0 ? "+" : ""}${d.val.toFixed(1)}% vs last period` : null);
const toneClass = (tone) => (tone ? `slp-tone-${tone}` : undefined);
const KpiValue = ({ children, tone }) => <span className={toneClass(tone)}>{children}</span>;

export default function PortfolioOverview({
  rows,
  sitesL,
  sitesAll,
  records,
  month,
  periodFrom,
  periodTo,
  setPeriodFrom,
  setPeriodTo,
  mLabel,
  chartMonths,
  periodKeys,
  activeMonths,
  siteCount,
  totalSiteCount,
  showHistorical,
  setShowHistorical,
  openSite,
  goEntry,
  onViewHistory,
  marginCtx,
}) {
  const ctxMargins = usePlMargins();
  const { targetMargin, warnMargin } = marginCtx || ctxMargins;
  const [filters, setFilters] = useState(PORTFOLIO_FILTERS_INIT);
  const [showThresholds, setShowThresholds] = useState(false);
  const setF = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const filteredRows = useMemo(
    () => applyPortfolioFilters(rows, { ...filters, _warnMargin: warnMargin }, month),
    [rows, filters, month, warnMargin],
  );

  const withData = useMemo(() => filteredRows.filter((r) => r.hasData), [filteredRows]);
  const pendingSites = useMemo(
    () => filteredRows.filter((r) => r.pending).sort((a, b) => b.pendingCount - a.pendingCount),
    [filteredRows],
  );

  const totals = useMemo(() => {
    const t = withData.reduce(
      (a, r) => ({ revenue: a.revenue + r.revenue, expense: a.expense + r.expense, profit: a.profit + r.profit }),
      { revenue: 0, expense: 0, profit: 0 },
    );
    t.margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
    return t;
  }, [withData]);

  const avgSiteMargin = useMemo(
    () => (withData.length ? withData.reduce((a, r) => a + r.margin, 0) / withData.length : null),
    [withData],
  );

  const estAgg = useMemo(() => {
    const arr = withData.filter((r) => r.est);
    if (!arr.length) return null;
    return arr.reduce(
      (a, r) => ({ revenue: a.revenue + r.est.revenue, expense: a.expense + r.est.expense, profit: a.profit + r.est.profit }),
      { revenue: 0, expense: 0, profit: 0 },
    );
  }, [withData]);

  const belowEst = useMemo(() => withData.filter((r) => r.est && r.profit < r.est.profit).length, [withData]);
  const lossCount = useMemo(() => withData.filter((r) => r.profit < 0).length, [withData]);
  const thinCount = useMemo(() => withData.filter((r) => r.profit >= 0 && r.margin < warnMargin).length, [withData, warnMargin]);

  /* Incomplete periods: months owed (in contract, no figures) across the filtered sites. */
  const pendingPeriods = useMemo(() => {
    const byId = new Map(sitesL.map((s) => [s.id, s]));
    let months = 0;
    let sites = 0;
    filteredRows.forEach((r) => {
      const site = byId.get(r.id);
      if (!site) return;
      const n = pendingMonths(site, records, month).length;
      if (n > 0) { months += n; sites += 1; }
    });
    return { months, sites };
  }, [filteredRows, sitesL, records, month]);

  const prevComparisonKeys = useMemo(() => {
    if (periodFrom === periodTo) {
      const pk = prevPeriodKey(periodFrom, MONTHS);
      return pk ? [pk] : [];
    }
    const len = periodKeys.length;
    const startIdx = monthIdx(periodFrom);
    if (startIdx - len < 0) return [];
    const prevTo = indexToPeriodKey(startIdx - 1);
    const prevFrom = indexToPeriodKey(startIdx - len);
    return periodKeysBetween(prevFrom, prevTo);
  }, [periodFrom, periodTo, periodKeys]);

  const prevTotals = useMemo(() => {
    if (!prevComparisonKeys.length) return null;
    const ids = new Set(filteredRows.map((r) => r.id));
    const arr = sitesL
      .filter((s) => ids.has(s.id))
      .map((s) => calcSiteOverPeriodKeys(s, prevComparisonKeys, records))
      .filter((c) => c.revenue || c.expense);
    if (!arr.length) return null;
    return arr.reduce((a, c) => ({ revenue: a.revenue + c.revenue, profit: a.profit + c.profit }), { revenue: 0, profit: 0 });
  }, [filteredRows, sitesL, records, prevComparisonKeys]);

  const revD = prevTotals && portfolioDelta(totals.revenue, prevTotals.revenue);
  const proD = prevTotals && portfolioDelta(totals.profit, prevTotals.profit);
  const estVar = estAgg ? totals.profit - estAgg.profit : null;
  const estVarPct = estAgg && estAgg.profit !== 0 ? (estVar / Math.abs(estAgg.profit)) * 100 : null;
  const pendCount = pendingSites.length;

  const performersChart = useMemo(() => {
    const sorted = [...withData].sort((a, b) => b.profit - a.profit);
    if (!sorted.length) return [];
    if (sorted.length <= 16) return sorted.map((r) => ({ name: r.name, profit: r.profit }));
    return [...sorted.slice(0, 8), ...sorted.slice(-8)].map((r) => ({ name: r.name, profit: r.profit }));
  }, [withData]);

  const trendMonths = chartMonths?.length ? chartMonths : activeMonths;

  const trendData = useMemo(() => {
    const ids = new Set(filteredRows.map((r) => r.id));
    const sites = sitesL.filter((s) => ids.has(s.id));
    return trendMonths.map((m) => {
      const arr = sites.map((s) => calcSite(s, m.key, records)).filter((c) => c.revenue || c.expense);
      const t = arr.reduce(
        (a, c) => ({ revenue: a.revenue + c.revenue, expense: a.expense + c.expense, profit: a.profit + c.profit }),
        { revenue: 0, expense: 0, profit: 0 },
      );
      return { name: m.label, ...t };
    });
  }, [trendMonths, filteredRows, sitesL, records]);

  const expenseBreakdown = useMemo(() => {
    const agg = Object.fromEntries(PARENTS.map((p) => [p.key, 0]));
    const keys = periodKeys?.length ? periodKeys : [month];
    withData.forEach((r) => {
      const site = sitesL.find((s) => s.id === r.id);
      if (!site) return;
      keys.forEach((mk) => {
        const pt = parentTotalsSite(site, mk, records);
        PARENTS.forEach((p) => { agg[p.key] += pt[p.key] || 0; });
      });
    });
    return PARENTS
      .map((p) => ({ name: parentLabel(p.key), value: agg[p.key], color: p.color }))
      .filter((d) => d.value > 0);
  }, [withData, sitesL, records, periodKeys, month]);

  const attention = useMemo(
    () => [...withData].filter((r) => r.profit < 0 || r.margin < warnMargin).sort((a, b) => a.profit - b.profit),
    [withData, warnMargin],
  );

  const hasActiveFilters = filters.search || filters.status !== "all"
    || filters.contract !== "all" || filters.revMin || filters.revMax;

  const siteOptions = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  const rangeMonthCount = periodKeys?.length || 1;
  const attentionColumns = useMemo(() => {
    const versionCount = (r) => sitesAll.filter((s) => s.siteGroup === r.siteGroup).length;
    return [
    {
      key: "name",
      label: "Site",
      render: (r) => (
        <span className="strong">
          {r.name}
          {!isSiteActive(r) && <span className="ver-pill inactive">Inactive · {versionLabel(r)}</span>}
          {isSiteActive(r) && versionCount(r) > 1 && <span className="ver-pill">{versionLabel(r)}</span>}
        </span>
      ),
    },
    { key: "revenue", label: "Revenue", headerClassName: "text-right", cellClassName: "text-right mono", render: (r) => inr(r.revenue) },
    {
      key: "profit",
      label: "Profit",
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (r) => <span style={{ color: r.profit < 0 ? "var(--loss)" : "var(--ink)" }}>{inr(r.profit)}</span>,
    },
    {
      key: "margin",
      label: "Margin",
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (r) => (
        <span style={{ color: r.margin < 0 ? "var(--loss)" : r.margin < warnMargin ? "var(--warn)" : "var(--ink)" }}>{pct(r.margin)}</span>
      ),
    },
    { key: "status", label: "Status", render: (r) => <StatusPill margin={r.margin} profit={r.profit} /> },
    {
      key: "actions",
      label: "",
      cellClassName: "text-right",
      render: (r) => (
        <span className="nowrap">
          {versionCount(r) > 1 && (
            <button type="button" className="link hist-link" onClick={() => onViewHistory(r.siteGroup)}>History</button>
          )}
          <button type="button" className="link" onClick={() => openSite(r.id)}>View →</button>
        </span>
      ),
    },
    ];
  }, [warnMargin, sitesAll, onViewHistory, openSite]);

  const thresholdColumns = useMemo(() => [
    { key: "name", label: "Site", render: (r) => <span className="strong">{r.name}</span> },
    { key: "target", label: "Target margin", headerClassName: "text-right", cellClassName: "text-right mono", render: () => `${targetMargin}%` },
    { key: "warn", label: "Warning margin", headerClassName: "text-right", cellClassName: "text-right mono", render: () => `${warnMargin}%` },
    {
      key: "actual",
      label: "Actual margin",
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (r) => (
        <span style={{ color: !r.hasData ? "var(--muted)" : r.margin < warnMargin ? "var(--warn)" : "var(--profit)" }}>
          {r.hasData ? pct(r.margin) : "—"}
        </span>
      ),
    },
  ], [targetMargin, warnMargin]);

  return (
    <div className="slp-stack">
      <SiteLedgerPageStyles />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-meta text-ink-secondary">
          Period <b>{mLabel}</b>
          {rangeMonthCount > 1 ? ` · ${rangeMonthCount} months aggregated` : ""}
        </p>
        <div className="flex items-center gap-2">
          <StatusChip label={`Target ${targetMargin}%`} severity="neutral" />
          <StatusChip label={`Warning below ${warnMargin}%`} severity="high" />
        </div>
      </div>

      <FilterBar>
        <div className="slp-filters">
          <label className="ov-filter range">
            <span>From month / year</span>
            <PeriodMonthSelect
              className="ov-period-pick"
              selectClassName="ov-period-sel"
              value={periodFrom}
              onChange={setPeriodFrom}
            />
          </label>
          <label className="ov-filter range">
            <span>To month / year</span>
            <PeriodMonthSelect
              className="ov-period-pick"
              selectClassName="ov-period-sel"
              value={periodTo}
              onChange={setPeriodTo}
            />
          </label>
          <div className="ov-filter ov-filter-ac slp-span-2">
            <SiteClientAutocomplete
              sites={siteOptions}
              value=""
              filterQuery={filters.search}
              onChange={(id) => {
                const site = siteOptions.find((s) => s.id === id);
                if (site) setF({ search: site.name });
              }}
              onSearchChange={(q) => setF({ search: q })}
              label="Search site / client"
              id="portfolio-overview-search"
              placeholder="Type site or client name…"
            />
          </div>
          <label className="ov-filter">
            <span>Status</span>
            <select value={filters.status} onChange={(e) => setF({ status: e.target.value })}>
              <option value="all">All</option>
              <option value="reporting">Reporting</option>
              <option value="pending">Pending data</option>
              <option value="loss">Loss-making</option>
              <option value="thin">Thin margin</option>
              <option value="below-est">Below estimate</option>
            </select>
          </label>
          <label className="ov-filter">
            <span>Contract</span>
            <select value={filters.contract} onChange={(e) => setF({ contract: e.target.value })}>
              <option value="all">All</option>
              <option value="in">In contract</option>
              <option value="out">Out of contract</option>
            </select>
          </label>
          <label className="ov-filter range slp-span-2">
            <span>Revenue (₹)</span>
            <div className="ov-range">
              <input type="number" value={filters.revMin} onChange={(e) => setF({ revMin: e.target.value })} placeholder="Min" />
              <span>–</span>
              <input type="number" value={filters.revMax} onChange={(e) => setF({ revMax: e.target.value })} placeholder="Max" />
            </div>
          </label>
          <div className="slp-filters-foot">
            <button
              type="button"
              className={"hist-scope-btn" + (showHistorical ? " on" : "")}
              onClick={() => setShowHistorical((v) => !v)}
            >
              <History size={13} />
              {showHistorical ? "Including historical" : "Active sites only"}
            </button>
            {hasActiveFilters && (
              <button type="button" className="ghost-d ov-clear" onClick={() => setFilters(PORTFOLIO_FILTERS_INIT)}>Clear filters</button>
            )}
          </div>
        </div>
      </FilterBar>

      <p className="type-meta text-ink-muted">
        {filteredRows.length} of {showHistorical ? totalSiteCount : siteCount} site{showHistorical ? " versions" : "s"} · {withData.length} reporting for {mLabel}
        {!showHistorical && totalSiteCount > siteCount && (
          <span> · {totalSiteCount - siteCount} inactive version{(totalSiteCount - siteCount) === 1 ? "" : "s"} hidden</span>
        )}
      </p>

      <div className="slp-kpis">
        <KpiTile
          label="Total revenue"
          value={inrShort(totals.revenue)}
          sub={trendText(revD) || `${withData.length} site${withData.length === 1 ? "" : "s"} reporting`}
        />
        <KpiTile
          label="Total expenses"
          value={inrShort(totals.expense)}
          sub={totals.revenue > 0 ? `${pct((totals.expense / totals.revenue) * 100)} of revenue` : "—"}
        />
        <KpiTile
          label="Net profit"
          value={<KpiValue tone={totals.profit >= 0 ? "profit" : "loss"}>{inrShort(totals.profit)}</KpiValue>}
          sub={trendText(proD) || (estVar != null
            ? `${estVar >= 0 ? "+" : ""}${inrShort(estVar)} vs estimate${estVarPct != null ? ` (${estVarPct >= 0 ? "+" : ""}${estVarPct.toFixed(0)}%)` : ""}`
            : "no estimate set")}
        />
        <KpiTile
          label="Average margin"
          value={<KpiValue tone={!withData.length ? undefined : totals.margin >= targetMargin ? "profit" : totals.margin >= warnMargin ? "warn" : "loss"}>{withData.length ? pct(totals.margin) : "—"}</KpiValue>}
          sub={avgSiteMargin != null ? `site average ${pct(avgSiteMargin)} · target ${targetMargin}%` : `target ${targetMargin}%`}
        />
        <KpiTile
          label="Negative-margin sites"
          value={<KpiValue tone={lossCount ? "loss" : "profit"}>{lossCount}</KpiValue>}
          sub={`${thinCount} thin · ${belowEst} below estimate`}
          onClick={() => setF({ status: "loss" })}
        />
        <KpiTile
          label="Pending periods"
          value={<KpiValue tone={pendingPeriods.months ? "warn" : "profit"}>{pendingPeriods.months}</KpiValue>}
          sub={pendingPeriods.sites
            ? `${pendingPeriods.sites} site${pendingPeriods.sites === 1 ? "" : "s"} incomplete as of ${monthLabelOf(month)}`
            : "all periods complete"}
          onClick={() => setF({ status: "pending" })}
        />
      </div>

      {!withData.length && (
        <InlineAlert tone="info">
          No figures for <b>{mLabel}</b> in the current filter. Adjust the period range above or enter figures in <b>Enter Figures</b>.
        </InlineAlert>
      )}

      {pendCount > 0 && (
        <SectionCard
          title={`Awaiting data · ${mLabel}`}
          right={<span className="type-meta text-ink-muted">{pendCount} site{pendCount > 1 ? "s" : ""} in contract with no figures yet</span>}
        >
          <div className="pend-grid">
            {pendingSites.map((s) => (
              <button key={s.id} type="button" className="pend-item" onClick={() => goEntry(s.id)} title="Enter figures">
                <span className="pend-dot" />
                <span className="pend-name">{s.name}</span>
                {s.pendingCount > 1 && <span className="pend-badge">{s.pendingCount} mo behind</span>}
                <span className="pend-cta">Enter →</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="grid-2">
        <SectionCard title={`Profit / loss by site · ${mLabel}`} right={<span className="type-meta text-ink-muted">top &amp; bottom performers</span>}>
          {performersChart.length ? (
            <ResponsiveContainer width="100%" height={Math.max(260, performersChart.length * 28)}>
              <BarChart data={performersChart} layout="vertical" margin={{ left: 4, right: 24, top: 8, bottom: 4 }}>
                <CartesianGrid horizontal stroke="var(--line)" vertical={false} />
                <XAxis type="number" tickFormatter={inrShort} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" />
                <YAxis type="category" dataKey="name" width={148} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} stroke="var(--line)" />
                <Tooltip content={<TipBox fmt={inr} />} cursor={{ fill: "var(--row-hover)" }} />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]} barSize={16}>
                  {performersChart.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? "var(--profit)" : "var(--loss)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState className="py-8" title="No site profit data" message="Nothing to chart for this period." />
          )}
        </SectionCard>
        <SectionCard title={`Expense breakdown · ${mLabel}`} right={<span className="type-meta text-ink-muted">by parent head</span>}>
          {expenseBreakdown.length ? (
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                    {expenseBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<TipBox fmt={inr} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {[...expenseBreakdown].sort((a, b) => b.value - a.value).map((d) => (
                  <div key={d.name} className="legend-row">
                    <span className="legend-dot" style={{ background: d.color }} />
                    <span className="legend-name">{d.name}</span>
                    <span className="legend-val">{inrShort(d.value)}</span>
                    <span className="legend-pct">{totals.expense > 0 ? pct((d.value / totals.expense) * 100) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState className="py-8" title="No expense data" message="Nothing to chart for this period." />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Revenue · expense · profit trend" right={<span className="type-meta text-ink-muted">filtered sites · {mLabel}</span>}>
        {trendData.some((d) => d.revenue || d.expense) ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ left: 8, right: 20, top: 12, bottom: 4 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" />
                <YAxis tickFormatter={inrShort} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" width={68} />
                <Tooltip content={<TipBox fmt={inr} />} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="var(--profit)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--profit)" }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="expense" name="Expense" stroke="var(--loss)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: "var(--loss)" }} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="var(--gold)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--gold)" }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="trend-legend">
              <span><i style={{ background: "var(--profit)" }} />Revenue</span>
              <span><i style={{ background: "var(--loss)" }} />Expense</span>
              <span><i style={{ background: "var(--gold)" }} />Profit</span>
            </div>
          </>
        ) : (
          <EmptyState className="py-8" title="No trend yet" message="Enter monthly figures to see the trend chart." />
        )}
      </SectionCard>

      <SectionCard
        title="Sites needing attention"
        right={<span className="type-meta text-ink-muted">{attention.length} flagged · loss or margin &lt; {warnMargin}%</span>}
      >
        {attention.length === 0 ? (
          <InlineAlert tone="success">
            <span className="inline-flex items-center gap-1.5"><TrendingUp size={14} /> Every reporting site cleared the {warnMargin}% margin floor this period.</span>
          </InlineAlert>
        ) : (
          <DenseTable
            columns={attentionColumns}
            rows={attention}
            rowKey="id"
            showSerialNumber={false}
            stickyHeader
            scrollMaxHeight="26rem"
            density="comfortable"
          />
        )}
      </SectionCard>

      <SectionCard
        title="Margin thresholds by site"
        right={(
          <button type="button" className="link" onClick={() => setShowThresholds((v) => !v)} aria-expanded={showThresholds}>
            {showThresholds ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {showThresholds ? "Hide" : `Show ${filteredRows.length} site${filteredRows.length === 1 ? "" : "s"}`}
          </button>
        )}
      >
        {showThresholds ? (
          <DenseTable
            columns={thresholdColumns}
            rows={filteredRows}
            rowKey="id"
            showSerialNumber={false}
            stickyHeader
            scrollMaxHeight="24rem"
          />
        ) : (
          <p className="type-meta text-ink-muted flex items-center gap-1.5">
            <Building2 size={13} /> Target {targetMargin}% · warning {warnMargin}% — expand to compare every site against these thresholds for {mLabel}.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

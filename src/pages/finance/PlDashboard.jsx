import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Building2, AlertTriangle, TrendingUp, Wallet, Receipt,
  Percent, IndianRupee, ArrowUpRight, ArrowDownRight,
  Target, AlertCircle,
} from "lucide-react";
import { useFinance } from "./contexts/FinanceContext";
import FinanceDashboardStyles from "./components/FinanceDashboardStyles";
import { StatusPill, EmptyState, LoadingState, ErrorState, PeriodMonthSelect } from "./components/FinanceUi";
import { inr, inrShort, pct } from "./lib/formatters";
import { monthLabelOf, prevPeriodKey } from "./lib/periods";
import { calcSite } from "./lib/calculations";
import { financePath } from "./navConfig";

function Kpi({ icon: Icon, label, value, sub, tone = "ink", trend }) {
  const c =
    tone === "profit"
      ? "var(--profit)"
      : tone === "loss"
        ? "var(--loss)"
        : tone === "warn"
          ? "var(--warn)"
          : "var(--ink)";
  return (
    <div className="fin-kpi">
      <div className="fin-kpi-top">
        <span style={{ color: c }}><Icon size={17} /></span>
        <span className="fin-kpi-label">{label}</span>
      </div>
      <div className="fin-kpi-value" style={{ color: c }}>{value}</div>
      {sub != null && (
        <div className="fin-kpi-sub">
          {trend === "up" && <ArrowUpRight size={13} style={{ color: "var(--profit)" }} />}
          {trend === "down" && <ArrowDownRight size={13} style={{ color: "var(--loss)" }} />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

function Card({ title, right, children }) {
  return (
    <div className="fin-card">
      {(title || right) && (
        <div className="fin-card-head">
          {title && <h3>{title}</h3>}
          {right}
        </div>
      )}
      <div className="fin-card-body">{children}</div>
    </div>
  );
}

function TipBox({ active, payload, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="fin-tip">
      {payload[0].payload?.name && (
        <div className="fin-tip-title">{payload[0].payload.name}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="fin-tip-row">
          <span className="fin-tip-dot" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <strong>{fmt ? fmt(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function delta(cur, prev) {
  if (prev == null || prev === 0) return null;
  return { val: ((cur - prev) / Math.abs(prev)) * 100, dir: cur - prev >= 0 ? "up" : "down" };
}

export default function PlDashboard() {
  const navigate = useNavigate();
  const {
    loading,
    error,
    refresh,
    data,
    months,
    periodMode,
    periodKey,
    periodKeys,
    setFilters,
    portfolio,
    siteRows,
    expenseBreakdown,
    trendData,
    warnMargin,
    targetMargin,
  } = useFinance();

  const mLabel = useMemo(() => {
    if (periodMode === "monthly") return monthLabelOf(periodKey, months);
    if (periodMode === "quarterly") return `Q${Math.ceil((months.find((m) => m.key === periodKey)?.month || 1) / 3)} ${periodKeys[0]?.slice(0, 4)}`;
    return periodKey.slice(0, 4);
  }, [periodMode, periodKey, periodKeys, months]);

  const prevTotals = useMemo(() => {
    if (!data || periodMode !== "monthly") return null;
    const prevKey = prevPeriodKey(periodKey, months);
    if (!prevKey) return null;
    const arr = data.sites
      .map((s) => calcSite(s, prevKey, data.records, data.revenueHeads, data.spreads, months))
      .filter((c) => c.revenue || c.expense);
    if (!arr.length) return null;
    return arr.reduce(
      (a, c) => ({ revenue: a.revenue + c.revenue, profit: a.profit + c.profit }),
      { revenue: 0, profit: 0 },
    );
  }, [data, periodKey, periodMode, months]);

  const performersChart = useMemo(() => {
    const sorted = [...portfolio.withData].sort((a, b) => b.profit - a.profit);
    if (sorted.length <= 16) return sorted.map((r) => ({ name: r.name, profit: r.profit }));
    return [...sorted.slice(0, 8), ...sorted.slice(-8)].map((r) => ({
      name: r.name,
      profit: r.profit,
    }));
  }, [portfolio.withData]);

  const attention = useMemo(
    () =>
      [...portfolio.withData]
        .filter((r) => r.profit < 0 || r.margin < warnMargin)
        .sort((a, b) => a.profit - b.profit),
    [portfolio.withData, warnMargin],
  );

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const { totals, withData, estAgg, lossCount, thinCount, belowEst, pendingSites } = portfolio;
  const revD = prevTotals && delta(totals.revenue, prevTotals.revenue);
  const proD = prevTotals && delta(totals.profit, prevTotals.profit);
  const estVar = estAgg ? totals.profit - estAgg.profit : null;
  const estVarPct =
    estAgg && estAgg.profit !== 0 ? (estVar / Math.abs(estAgg.profit)) * 100 : null;
  const pendCount = pendingSites.length;

  return (
    <div className="fin-dash">
      <FinanceDashboardStyles />
      <div className="fin-topbar">
        <div>
          <h1>Portfolio Overview</h1>
          <p>
            Income–Expenditure monitoring · {data?.sites?.length || 0} sites
            {periodMode !== "monthly" && ` · ${periodMode} view`}
          </p>
        </div>
        <div className="fin-filters">
          <label>
            View
            <div className="fin-seg">
              {["monthly", "quarterly", "yearly"].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={periodMode === m ? "on" : ""}
                  onClick={() => setFilters({ periodMode: m })}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </label>
          <label>
            Period
            <PeriodMonthSelect
              className="gap-1"
              selectClassName="h-8 px-2 text-xs border border-gray-300 rounded-lg bg-white font-semibold"
              value={periodKey}
              onChange={(v) => setFilters({ period: v })}
            />
          </label>
        </div>
      </div>

      {!withData.length ? (
        <EmptyState
          icon={Building2}
          title={`No figures for ${mLabel} yet`}
          message="Add sites and enter revenue/expense figures, or pick another period."
          action={
            <button
              type="button"
              className="fin-link mt-3"
              onClick={() => navigate(financePath("expenses"))}
            >
              Go to Expense Entries →
            </button>
          }
        />
      ) : (
        <>
          <div className="fin-kpi-row">
            <Kpi
              icon={IndianRupee}
              label={`Total Revenue · ${mLabel}`}
              value={inrShort(totals.revenue)}
              sub={
                revD
                  ? `${revD.val >= 0 ? "+" : ""}${revD.val.toFixed(1)}% vs last period`
                  : `${withData.length} sites reporting`
              }
              trend={revD?.dir}
            />
            <Kpi
              icon={Receipt}
              label="Total Expenses"
              value={inrShort(totals.expense)}
              sub={totals.revenue ? `${pct((totals.expense / totals.revenue) * 100)} of revenue` : null}
            />
            <Kpi
              icon={Wallet}
              label="Net Profit"
              value={inrShort(totals.profit)}
              tone={totals.profit >= 0 ? "profit" : "loss"}
              sub={
                proD
                  ? `${proD.val >= 0 ? "+" : ""}${proD.val.toFixed(1)}% vs last period`
                  : null
              }
              trend={proD?.dir}
            />
            <Kpi
              icon={Target}
              label="Profit vs Estimate"
              value={estVar == null ? "—" : `${estVar >= 0 ? "+" : ""}${inrShort(estVar)}`}
              tone={estVar == null ? "ink" : estVar >= 0 ? "profit" : "loss"}
              sub={
                estAgg
                  ? `est ${inrShort(estAgg.profit)}${estVarPct != null ? ` · ${estVarPct >= 0 ? "+" : ""}${estVarPct.toFixed(0)}%` : ""}`
                  : "no estimate set"
              }
              trend={estVar == null ? undefined : estVar >= 0 ? "up" : "down"}
            />
            <Kpi
              icon={Percent}
              label="Portfolio Margin"
              value={pct(totals.margin)}
              tone={totals.margin >= targetMargin ? "profit" : totals.margin >= warnMargin ? "warn" : "loss"}
              sub={`target ${targetMargin}%`}
            />
            <Kpi
              icon={AlertTriangle}
              label="Need attention"
              value={`${lossCount + thinCount}`}
              tone={lossCount ? "loss" : thinCount ? "warn" : "profit"}
              sub={`${lossCount} loss · ${thinCount} thin · ${belowEst} below est`}
            />
            <Kpi
              icon={AlertCircle}
              label="Data pending"
              value={`${pendCount}`}
              tone={pendCount ? "warn" : "profit"}
              sub={pendCount ? `site${pendCount > 1 ? "s" : ""} missing ${mLabel}` : "all sites reported"}
            />
          </div>

          {pendCount > 0 && (
            <Card
              title={`Awaiting Data · ${mLabel}`}
              right={
                <span className="fin-muted">
                  {pendCount} site{pendCount > 1 ? "s" : ""} in-contract with no figures yet
                </span>
              }
            >
              <div className="fin-pend-grid">
                {pendingSites.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="fin-pend-item"
                    onClick={() => navigate(`${financePath("expenses")}?siteId=${s.id}`)}
                  >
                    <span className="fin-pend-dot" />
                    <span className="fin-pend-name">{s.name}</span>
                    {s.pendingCount > 1 && (
                      <span className="fin-pend-badge">{s.pendingCount} mo behind</span>
                    )}
                    <span className="fin-pend-cta">Enter →</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <div className="fin-grid-2">
            <Card
              title={`Profit / Loss by Site · ${mLabel}`}
              right={<span className="fin-muted">top &amp; bottom performers</span>}
            >
              {performersChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(240, performersChart.length * 26)}>
                  <BarChart data={performersChart} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} stroke="var(--line)" />
                    <XAxis type="number" tickFormatter={inrShort} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                    <Tooltip content={<TipBox fmt={inr} />} />
                    <Bar dataKey="profit" radius={[0, 4, 4, 0]} barSize={15}>
                      {performersChart.map((d, i) => (
                        <Cell key={i} fill={d.profit >= 0 ? "var(--profit)" : "var(--loss)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="fin-muted py-6 text-center">No site performance data.</p>
              )}
            </Card>

            <Card title={`Expense Breakdown · ${mLabel}`} right={<span className="fin-muted">by parent head</span>}>
              {expenseBreakdown.length > 0 ? (
                <div className="fin-donut-wrap">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {expenseBreakdown.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<TipBox fmt={inr} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="fin-legend">
                    {[...expenseBreakdown]
                      .sort((a, b) => b.value - a.value)
                      .map((d) => (
                        <div key={d.name} className="fin-legend-row">
                          <span className="fin-legend-dot" style={{ background: d.color }} />
                          <span className="fin-legend-name">{d.name}</span>
                          <span className="fin-legend-val">{inrShort(d.value)}</span>
                          <span className="fin-legend-pct">
                            {pct(totals.expense ? (d.value / totals.expense) * 100 : 0)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="fin-muted py-6 text-center">No expense data for this period.</p>
              )}
            </Card>
          </div>

          <Card title="Revenue · Expense · Profit Trend">
            {trendData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ left: 6, right: 18, top: 12, bottom: 4 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <YAxis tickFormatter={inrShort} tick={{ fontSize: 11, fill: "var(--muted)" }} width={62} />
                    <Tooltip content={<TipBox fmt={inr} />} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="var(--green)" strokeWidth={2.4} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="expense" name="Expense" stroke="var(--loss)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5 }} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="var(--gold)" strokeWidth={2.4} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="fin-trend-legend">
                  <span><i style={{ background: "var(--green)" }} />Revenue</span>
                  <span><i style={{ background: "var(--loss)" }} />Expense</span>
                  <span><i style={{ background: "var(--gold)" }} />Profit</span>
                </div>
              </>
            ) : (
              <p className="fin-muted py-6 text-center">Trend data will appear once entries are recorded.</p>
            )}
          </Card>

          <Card
            title="Sites Needing Attention"
            right={
              <span className="fin-muted">
                {attention.length} flagged · loss or margin &lt; {warnMargin}%
              </span>
            }
          >
            {attention.length === 0 ? (
              <div className="fin-all-clear">
                <TrendingUp size={16} />
                Every reporting site cleared the {warnMargin}% margin floor this period.
              </div>
            ) : (
              <table className="fin-tbl">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Service</th>
                    <th className="r">Revenue</th>
                    <th className="r">Profit</th>
                    <th className="r">Margin</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attention.map((r) => (
                    <tr key={r.id}>
                      <td className="fin-strong">{r.name}</td>
                      <td className="fin-muted">{r.service || "—"}</td>
                      <td className="r fin-mono">{inr(r.revenue)}</td>
                      <td className="r fin-mono" style={{ color: r.profit < 0 ? "var(--loss)" : "var(--ink)" }}>
                        {inr(r.profit)}
                      </td>
                      <td
                        className="r fin-mono"
                        style={{
                          color:
                            r.margin < 0
                              ? "var(--loss)"
                              : r.margin < warnMargin
                                ? "var(--warn)"
                                : "var(--ink)",
                        }}
                      >
                        {pct(r.margin)}
                      </td>
                      <td>
                        <StatusPill
                          margin={r.margin}
                          profit={r.profit}
                          warnMargin={warnMargin}
                          targetMargin={targetMargin}
                        />
                      </td>
                      <td className="r">
                        <button
                          type="button"
                          className="fin-link"
                          onClick={() => navigate(`${financePath("budget-vs-actual")}?siteId=${r.id}`)}
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title={`Site-wise P&L · ${mLabel}`}>
            <table className="fin-tbl">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Service</th>
                  <th className="r">Revenue</th>
                  <th className="r">Expense</th>
                  <th className="r">Profit</th>
                  <th className="r">Margin</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...siteRows]
                  .filter((r) => r.hasData || r.pending)
                  .sort((a, b) => b.profit - a.profit)
                  .map((r) => (
                    <tr key={r.id} className={r.pending ? "row-pending" : ""}>
                      <td className="fin-strong">{r.name}</td>
                      <td className="fin-muted">{r.service || "—"}</td>
                      {r.hasData ? (
                        <>
                          <td className="r fin-mono">{inr(r.revenue)}</td>
                          <td className="r fin-mono">{inr(r.expense)}</td>
                          <td className="r fin-mono" style={{ color: r.profit < 0 ? "var(--loss)" : "var(--profit)" }}>
                            {inr(r.profit)}
                          </td>
                          <td className="r fin-mono">{pct(r.margin)}</td>
                          <td>
                            <StatusPill margin={r.margin} profit={r.profit} warnMargin={warnMargin} targetMargin={targetMargin} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={4} className="fin-muted text-center">
                            {r.pending ? `awaiting ${mLabel}` : `not in contract for ${mLabel}`}
                          </td>
                          <td>
                            {r.pending ? (
                              <span className="pill pill-pending">Pending</span>
                            ) : (
                              <span className="fin-muted">—</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

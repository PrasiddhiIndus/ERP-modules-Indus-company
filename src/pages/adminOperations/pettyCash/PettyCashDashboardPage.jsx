import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState, InlineAlert, LoadingBlock } from "../../../components/erpUi";
import {
  AreaTrendChart,
  BarCompareChart,
  ChartPanel,
  SparkKpi,
  makeMoneyAxisFormatter,
} from "../../../components/charts/DashboardCharts";
import { PETTY_CASH_APP_PATH } from "../../../config/roles";
import {
  formatDate,
  formatInr,
  listRecentVouchers,
  listVouchersBetween,
  todayIst,
  usePettyCashMasters,
} from "./pettyCashApi";
import { PC_INPUT, Panel, TableWrap } from "./pettyCashUi";

const pad = (n) => String(n).padStart(2, "0");

/** { from, to, days } for a "YYYY-MM" month. */
function monthBounds(ym) {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(days)}`, days, y, m };
}

function previousMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

const sum = (rows) => rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
const shortInr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function PettyCashDashboardPage() {
  const { overheads } = usePettyCashMasters();
  const today = todayIst();
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);

  const [vouchers, setVouchers] = useState(null);
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState("");

  const prev = previousMonth(month);
  const cur = monthBounds(month);
  const prevB = monthBounds(prev);

  useEffect(() => {
    let cancelled = false;
    setVouchers(null);
    setError("");
    listVouchersBetween(prevB.from, cur.to)
      .then((rows) => !cancelled && setVouchers(rows))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [prevB.from, cur.to]);

  useEffect(() => {
    let cancelled = false;
    listRecentVouchers(10)
      .then((rows) => !cancelled && setRecent(rows))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const ohName = (id) => overheads.find((o) => o.id === id)?.name || "—";

  const stats = useMemo(() => {
    if (!vouchers) return null;
    const thisMonth = vouchers.filter((v) => v.expense_date >= cur.from && v.expense_date <= cur.to);
    const lastMonth = vouchers.filter((v) => v.expense_date >= prevB.from && v.expense_date <= prevB.to);
    const isCurrent = month === currentMonth;
    const lastDay = isCurrent ? Number(today.slice(8, 10)) : cur.days;

    const daily = Array.from({ length: lastDay }, (_, i) => {
      const iso = `${month}-${pad(i + 1)}`;
      return { iso, name: String(i + 1), fullName: formatDate(iso), spend: 0 };
    });
    for (const v of thisMonth) {
      const d = daily[Number(v.expense_date.slice(8, 10)) - 1];
      if (d) d.spend += Number(v.amount) || 0;
    }
    let cumulative = 0;
    const cumulativeSeries = daily.map((d) => (cumulative += d.spend));

    const byOverhead = new Map();
    for (const v of thisMonth) byOverhead.set(v.overhead_category_id, (byOverhead.get(v.overhead_category_id) || 0) + Number(v.amount));
    const byOverheadPrev = new Map();
    for (const v of lastMonth) byOverheadPrev.set(v.overhead_category_id, (byOverheadPrev.get(v.overhead_category_id) || 0) + Number(v.amount));
    const byCategory = new Map();
    for (const v of thisMonth) {
      const label = String(v.expense_category_name || "").trim() || "—";
      byCategory.set(label, (byCategory.get(label) || 0) + Number(v.amount));
    }

    const total = sum(thisMonth);
    const prevTotal = sum(lastMonth);
    const overheadIds = new Set([...byOverhead.keys(), ...byOverheadPrev.keys()]);
    const overheadRows = [...overheadIds]
      .map((id) => {
        const now = byOverhead.get(id) || 0;
        const before = byOverheadPrev.get(id) || 0;
        return { id, now, before, change: before ? ((now - before) / before) * 100 : null, share: total ? (now / total) * 100 : 0 };
      })
      .sort((a, b) => b.now - a.now || b.before - a.before);

    const topCategories = [...byCategory.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const peak = daily.reduce((best, d) => (d.spend > (best?.spend || 0) ? d : best), null);
    const todaySpend = isCurrent ? daily[lastDay - 1]?.spend || 0 : 0;

    return {
      isCurrent,
      thisMonth,
      total,
      prevTotal,
      count: thisMonth.length,
      avg: thisMonth.length ? total / thisMonth.length : 0,
      change: prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null,
      daily,
      dailySeries: daily.map((d) => d.spend),
      cumulativeSeries,
      overheadRows,
      topCategories,
      peak,
      todaySpend,
    };
  }, [vouchers, month, currentMonth, today, cur.from, cur.to, cur.days, prevB.from, prevB.to]);

  const moneyAxis = useMemo(() => makeMoneyAxisFormatter(stats?.dailySeries || []), [stats]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-secondary">Reporting month</span>
          <input
            type="month"
            value={month}
            max={currentMonth}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className={`${PC_INPUT} w-48`}
          />
        </label>
        <Link
          to={`${PETTY_CASH_APP_PATH}/daily-entry`}
          className="erp-btn-primary inline-flex h-9 items-center gap-1.5 rounded-control px-4 text-[13px] font-medium"
        >
          <Plus className="h-4 w-4" /> New Expense
        </Link>
      </div>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {!stats ? (
        error ? null : <LoadingBlock rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SparkKpi
              label={`Spent in ${monthLabel(month)}`}
              value={formatInr(stats.total)}
              sub={`Last month ${shortInr(stats.prevTotal)}`}
              series={stats.cumulativeSeries}
            />
            {stats.isCurrent ? (
              <SparkKpi label="Spent today" value={formatInr(stats.todaySpend)} sub={formatDate(today)} series={stats.dailySeries.slice(-7)} />
            ) : (
              <SparkKpi
                label="Highest day"
                value={formatInr(stats.peak?.spend || 0)}
                sub={stats.peak ? stats.peak.fullName : "No expenses"}
                series={stats.dailySeries}
              />
            )}
            <SparkKpi
              label="Vouchers"
              value={stats.count.toLocaleString("en-IN")}
              sub={stats.count ? `Average ${formatInr(stats.avg)}` : "No vouchers this month"}
            />
            <div className="rounded-card border border-border bg-surface px-4 py-3.5 shadow-card">
              <p className="type-mono-caption text-ink-muted">Change vs last month</p>
              {stats.change === null ? (
                <>
                  <p className="type-figure mt-1.5 text-ink">—</p>
                  <p className="type-meta mt-1 text-ink-muted">No spend last month to compare</p>
                </>
              ) : (
                <>
                  <p
                    className={`type-figure mt-1.5 inline-flex items-center gap-1.5 ${
                      stats.change > 0 ? "text-critical" : "text-success"
                    }`}
                  >
                    {stats.change > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {stats.change > 0 ? "+" : ""}
                    {stats.change.toFixed(1)}%
                  </p>
                  <p className="type-meta mt-1 text-ink-muted">
                    {stats.change > 0 ? "Higher" : "Lower"} than {monthLabel(prev)}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ChartPanel title="Daily spend" subtitle={monthLabel(month)} height={260}>
              {stats.total ? (
                <AreaTrendChart
                  data={stats.daily}
                  series={[{ key: "spend", name: "Spend" }]}
                  height={260}
                  formatter={(v) => formatInr(v)}
                  yTickFormatter={moneyAxis}
                />
              ) : (
                <EmptyChart />
              )}
            </ChartPanel>
            <ChartPanel title="Spend by overhead" subtitle="This month" height={260}>
              {stats.overheadRows.some((r) => r.now) ? (
                <BarCompareChart
                  layout="horizontal"
                  data={stats.overheadRows
                    .filter((r) => r.now)
                    .slice(0, 8)
                    .map((r) => ({ name: ohName(r.id), fullName: ohName(r.id), value: r.now }))}
                  series={[{ key: "value", name: "Spend" }]}
                  height={260}
                  categoryWidth={120}
                  formatter={(v) => formatInr(v)}
                />
              ) : (
                <EmptyChart />
              )}
            </ChartPanel>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel
              title="Overhead spend summary"
              subtitle={`${monthLabel(month)} compared with ${monthLabel(prev)}`}
              bodyClassName="!pt-4"
            >
              {!stats.overheadRows.length ? (
                <p className="py-8 text-center text-[13px] text-ink-muted">No expenses in these two months.</p>
              ) : (
                <TableWrap minWidth={540}>
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th>Overhead</th>
                        <th className="text-right">This month</th>
                        <th className="text-right">Last month</th>
                        <th className="text-right">Change</th>
                        <th className="w-40">Share of month</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.overheadRows.map((r) => (
                        <tr key={r.id}>
                          <td className="font-medium text-ink-strong">{ohName(r.id)}</td>
                          <td className="erp-numeric whitespace-nowrap text-right tabular-nums">{formatInr(r.now)}</td>
                          <td className="erp-numeric whitespace-nowrap text-right tabular-nums text-ink-secondary">{formatInr(r.before)}</td>
                          <td
                            className={`erp-numeric whitespace-nowrap text-right tabular-nums ${
                              r.change === null ? "text-ink-muted" : r.change > 0 ? "text-critical" : "text-success"
                            }`}
                          >
                            {r.change === null ? "New" : `${r.change > 0 ? "+" : ""}${r.change.toFixed(1)}%`}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, r.share)}%` }} />
                              </div>
                              <span className="w-12 text-right text-[12px] tabular-nums text-ink-secondary">{r.share.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Panel>
            <ChartPanel title="Top expense categories" subtitle="This month" height={280}>
              {stats.topCategories.length ? (
                <BarCompareChart
                  layout="horizontal"
                  data={stats.topCategories.map((c) => ({ name: c.name, fullName: c.name, value: c.value }))}
                  series={[{ key: "value", name: "Spend" }]}
                  height={280}
                  categoryWidth={120}
                  formatter={(v) => formatInr(v)}
                />
              ) : (
                <EmptyChart />
              )}
            </ChartPanel>
          </div>
        </>
      )}

      <Panel
        title="Recent transactions"
        subtitle="Latest 10 petty cash vouchers"
        right={
          <Link to={`${PETTY_CASH_APP_PATH}/daily-entry`} className="text-[13px] font-medium text-accent hover:underline">
            Go to Daily Expense Entry →
          </Link>
        }
      >
        {recent === null ? (
          <LoadingBlock rows={4} />
        ) : !recent.length ? (
          <EmptyState icon={Receipt} title="No vouchers yet" message="Expenses submitted in Daily Expense Entry appear here." />
        ) : (
          <TableWrap minWidth={720}>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Date</th>
                  <th>Expense / Overhead</th>
                  <th>Paid to</th>
                  <th>Mode</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((v) => (
                  <tr key={v.id} title={v.description}>
                    <td className="whitespace-nowrap font-mono font-semibold text-accent">{v.voucher_no}</td>
                    <td className="whitespace-nowrap text-ink-secondary">{formatDate(v.expense_date)}</td>
                    <td>
                      <span className="block text-ink-strong">{v.expense_category_name || "—"}</span>
                      <span className="block text-[12px] text-ink-muted">{ohName(v.overhead_category_id)}</span>
                    </td>
                    <td className="text-ink-secondary">{v.paid_to}</td>
                    <td className="text-ink-secondary">{v.payment_mode}</td>
                    <td className="erp-numeric whitespace-nowrap text-right font-semibold tabular-nums">{formatInr(v.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center rounded-card border border-dashed border-border text-[13px] text-ink-muted">
      No expenses recorded for this period
    </div>
  );
}

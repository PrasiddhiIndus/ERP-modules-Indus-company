import React, { useEffect, useMemo, useState } from "react";
import {
  BarCompareChart,
  ChartPanel,
  ComposedTrendChart,
  makeMoneyAxisFormatter,
} from "../../components/charts/DashboardCharts";
import { inrShort } from "../finance/lib/formatters";

export default function CompanyBooks({ pl, rangeLabel, canOpen, onOpen, onOpenMonth, onOpenSite }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const trend = pl?.trend || [];
  const sites = useMemo(() => {
    const rows = pl?.siteRows || [];
    const profitable = rows.filter((row) => row.profit > 0);
    return (profitable.length ? profitable : rows).slice(0, 8);
  }, [pl?.siteRows]);

  const axis = useMemo(() => {
    const values = [];
    for (const row of trend) values.push(row.revenue, row.expense, row.profit);
    return makeMoneyAxisFormatter(values);
  }, [trend]);

  const siteAxis = useMemo(() => makeMoneyAxisFormatter(sites.map((row) => row.profit)), [sites]);
  const open = canOpen ? onOpen : undefined;

  return (
    <section className="cp-books" aria-label="Ledger">
      <ChartPanel
        title="Revenue · expense · profit"
        subtitle={`Monthly trend · ${rangeLabel}`}
        height={248}
        onOpen={open}
        openLabel="Ledger"
      >
        {ready && trend.length ? (
          <ComposedTrendChart
            data={trend}
            areas={[{ key: "revenue", name: "Revenue", color: "var(--cp-info)" }]}
            bars={[{ key: "expense", name: "Expense", color: "var(--cp-risk)" }]}
            lines={[{ key: "profit", name: "Profit", color: "var(--cp-good)" }]}
            height={230}
            formatter={(value) => inrShort(value)}
            yTickFormatter={axis}
            onPointClick={onOpenMonth}
          />
        ) : ready ? (
          <p className="cp-note">No ledger movement in this range.</p>
        ) : (
          <div className="cp-chart-hold" />
        )}
      </ChartPanel>

      <ChartPanel title="Profit by site" subtitle="Top contributors" height={248} onOpen={open} openLabel="Ledger">
        {ready && sites.length ? (
          <BarCompareChart
            data={sites}
            layout="horizontal"
            xKey="name"
            series={[{ key: "profit", name: "Profit", color: "var(--cp-good)" }]}
            height={230}
            categoryWidth={118}
            formatter={(value) => inrShort(value)}
            yTickFormatter={siteAxis}
            onBarClick={onOpenSite}
          />
        ) : ready ? (
          <p className="cp-note">No site profit in this range.</p>
        ) : (
          <div className="cp-chart-hold" />
        )}
      </ChartPanel>
    </section>
  );
}

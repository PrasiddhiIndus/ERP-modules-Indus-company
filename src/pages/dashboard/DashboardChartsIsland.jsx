/**
 * Chart-heavy dashboard blocks — loaded asynchronously so KPI shell paints first.
 * Logic/props are owned by Dashboard.jsx; this file only renders Recharts UI.
 */
import React from "react";
import { useMemo } from "react";
import {
  AreaTrendChart,
  BarCompareChart,
  ChartPanel,
  ComposedTrendChart,
  DonutChart,
  RadialScoreChart,
  makeMoneyAxisFormatter,
} from "../../components/charts/DashboardCharts";
import { CHART_SERIES } from "../../theme/tokens";
import { inrShort } from "../finance/lib/formatters";

export default function DashboardChartsIsland({
  rangeLabel,
  pl,
  plMix,
  topSites,
  bottomSites,
  billingBars,
  collectionMix,
  commercialStats,
  billRate,
  loading,
  moduleVolume,
  pipelineMix,
  attentionBars,
  manpowerMix,
  modules,
  goLedger,
  goBilling,
  goBillingReports,
  go,
  openTrendMonth,
  openSite,
  openBillingBar,
  openModuleBar,
}) {
  const trendAxisFmt = useMemo(() => {
    const vals = [];
    for (const row of pl?.trend || []) {
      vals.push(row.revenue, row.expense, row.profit);
    }
    return makeMoneyAxisFormatter(vals);
  }, [pl?.trend]);

  return (
    <>
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel
          title="Revenue · expense · profit"
          subtitle={`Monthly trend · ${rangeLabel}`}
          className="lg:col-span-2"
          height={280}
          onOpen={() => goLedger()}
          openLabel="Ledger"
        >
          <ComposedTrendChart
            data={pl.trend}
            areas={[{ key: "revenue", name: "Revenue", color: CHART_SERIES[0] }]}
            bars={[{ key: "expense", name: "Expense", color: CHART_SERIES[3] }]}
            lines={[{ key: "profit", name: "Profit", color: CHART_SERIES[5] }]}
            height={250}
            formatter={(v) => inrShort(v)}
            yTickFormatter={trendAxisFmt}
            onPointClick={openTrendMonth}
          />
        </ChartPanel>
        <ChartPanel title="Margin" subtitle={rangeLabel} height={280} onOpen={() => goLedger()} openLabel="Ledger">
          <RadialScoreChart
            value={Math.max(0, Math.min(100, Math.round(pl.margin)))}
            label="Margin"
            color={pl.margin >= 12 ? CHART_SERIES[5] : pl.margin >= pl.warnMargin ? CHART_SERIES[2] : CHART_SERIES[3]}
            height={250}
            onClick={() => goLedger()}
          />
        </ChartPanel>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ChartPanel title="P&amp;L mix" subtitle={rangeLabel} height={260} onOpen={() => goLedger()} openLabel="Ledger">
          <DonutChart
            data={plMix}
            centerLabel="Period"
            height={230}
            formatter={(v) => inrShort(v)}
            onSliceClick={() => goLedger()}
          />
        </ChartPanel>
        <ChartPanel title="Expense composition" subtitle="Parent heads" height={260} onOpen={() => goLedger()} openLabel="Ledger">
          {pl.expenseMix.length ? (
            <DonutChart
              data={pl.expenseMix.map((x) => ({ ...x, fullName: x.name, _hint: "Open site ledger" }))}
              centerLabel="Spend"
              height={230}
              formatter={(v) => inrShort(v)}
              onSliceClick={() => goLedger()}
            />
          ) : (
            <AreaTrendChart
              data={pl.trend}
              series={[{ key: "expense", name: "Expense", color: CHART_SERIES[3] }]}
              height={230}
              formatter={(v) => inrShort(v)}
              yTickFormatter={trendAxisFmt}
              onPointClick={openTrendMonth}
            />
          )}
        </ChartPanel>
        <ChartPanel title="Profit by site" subtitle="Top contributors" height={280} onOpen={() => goLedger()} openLabel="Ledger">
          <BarCompareChart
            data={topSites}
            layout="horizontal"
            xKey="name"
            series={[{ key: "profit", name: "Profit", color: CHART_SERIES[5] }]}
            height={250}
            categoryWidth={128}
            formatter={(v) => inrShort(v)}
            onBarClick={openSite}
          />
        </ChartPanel>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel
          title="Contract vs billed vs outstanding"
          className="lg:col-span-2"
          height={260}
          onOpen={goBilling}
          openLabel="Billing"
        >
          <BarCompareChart
            data={billingBars}
            series={[{ key: "value", name: "Amount", color: CHART_SERIES[0] }]}
            height={230}
            formatter={(v) => inrShort(v)}
            yTickFormatter={makeMoneyAxisFormatter(billingBars.map((b) => b.value))}
            onBarClick={openBillingBar}
          />
        </ChartPanel>
        <ChartPanel title="Collections" height={260} onOpen={goBillingReports} openLabel="Reports">
          <DonutChart
            data={collectionMix}
            centerLabel="Billed"
            centerValue={loading ? "—" : inrShort(commercialStats.billed)}
            height={230}
            formatter={(v) => inrShort(v)}
            onSliceClick={(row) => (row?.name === "Outstanding" ? goBillingReports() : goBilling())}
          />
        </ChartPanel>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartPanel
          title="Module volume"
          subtitle="Where records sit across the ERP"
          className="lg:col-span-2"
          height={300}
          onOpen={() => go("/app/admin/dashboard")}
          openLabel="Admin"
        >
          <BarCompareChart
            data={moduleVolume}
            layout="horizontal"
            xKey="name"
            series={[{ key: "value", name: "Records", color: CHART_SERIES[0] }]}
            height={270}
            categoryWidth={110}
            onBarClick={openModuleBar}
          />
        </ChartPanel>
        <ChartPanel title="Enquiry pipeline mix" subtitle="Demand channels" height={300} onOpen={() => go("/app/marketing")} openLabel="Marketing">
          <DonutChart
            data={pipelineMix}
            centerLabel="Asks"
            centerValue={pipelineMix.reduce((a, x) => a + x.value, 0)}
            height={270}
            onSliceClick={openModuleBar}
          />
        </ChartPanel>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartPanel
          title="Needs attention"
          subtitle="Queues and risk signals — not task lists"
          height={280}
          onOpen={() => go("/app/admin/dashboard")}
          openLabel="Admin"
        >
          {attentionBars.length ? (
            <BarCompareChart
              data={attentionBars}
              layout="horizontal"
              xKey="name"
              series={[{ key: "value", name: "Count", color: CHART_SERIES[3] }]}
              height={250}
              categoryWidth={110}
              onBarClick={openModuleBar}
            />
          ) : (
            <p className="type-meta text-ink-muted py-8 text-center">No elevated queues right now.</p>
          )}
        </ChartPanel>
        <ChartPanel
          title="Manpower status"
          subtitle="Pipeline posture"
          height={280}
          onOpen={() => go("/app/commercial/manpower-training/manpower-management/dashboard")}
          openLabel="Manpower"
        >
          {manpowerMix.length ? (
            <DonutChart
              data={manpowerMix}
              centerLabel="Enquiries"
              centerValue={modules.manpowerTotal}
              height={250}
              onSliceClick={() => go("/app/commercial/manpower-training/manpower-management/dashboard")}
            />
          ) : (
            <p className="type-meta text-ink-muted py-8 text-center">No manpower enquiries loaded.</p>
          )}
        </ChartPanel>
      </section>

      {bottomSites.length > 0 ? (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartPanel
            title="Sites needing attention"
            subtitle={`Lowest profit · ${rangeLabel}`}
            height={280}
            onOpen={() => goLedger()}
            openLabel="Ledger"
          >
            <BarCompareChart
              data={bottomSites}
              layout="horizontal"
              xKey="name"
              series={[{ key: "profit", name: "Profit", color: CHART_SERIES[3] }]}
              height={250}
              categoryWidth={128}
              formatter={(v) => inrShort(v)}
              onBarClick={openSite}
            />
          </ChartPanel>
          <ChartPanel title="Billing coverage" subtitle="Contract realisation" height={280} onOpen={goBilling} openLabel="Billing">
            <RadialScoreChart
              value={billRate}
              label="Billed"
              color={billRate >= 70 ? CHART_SERIES[5] : billRate >= 40 ? CHART_SERIES[2] : CHART_SERIES[3]}
              height={250}
              onClick={goBilling}
            />
          </ChartPanel>
        </section>
      ) : null}
    </>
  );
}

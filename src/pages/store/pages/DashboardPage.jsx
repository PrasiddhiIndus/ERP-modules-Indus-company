import React, { useMemo } from "react";
import { SectionCard } from "../components/StoreUi";
import {
  SparkKpi,
  ChartPanel,
  AreaTrendChart,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  CHART_SERIES,
} from "../../../components/charts/DashboardCharts";

export default function DashboardPage({ data }) {
  const { items, stores, sites, stockByStoreItem, lowStockItems, alerts, returnsPending, inTransit, planner } = data;

  const totals = useMemo(() => {
    const central = stores
      .filter((s) => s.storeType === "Central Store")
      .reduce(
        (sum, s) =>
          sum +
          items.reduce((si, it) => si + Number(stockByStoreItem[`${s.id}:${it.id}`] || 0), 0),
        0
      );
    const all = stores.reduce(
      (sum, s) => sum + items.reduce((si, it) => si + Number(stockByStoreItem[`${s.id}:${it.id}`] || 0), 0),
      0
    );
    const shortages = planner.reduce((n, p) => n + p.rows.filter((r) => r.shortfall > 0).length, 0);
    const excess = planner.reduce((n, p) => n + p.rows.filter((r) => r.excess > 0).length, 0);
    return { central, all, shortages, excess };
  }, [items, planner, stockByStoreItem, stores]);

  const activeSites = sites.filter((s) => s.active).length;

  const kpis = [
    { label: "Central store qty", value: totals.central, color: CHART_SERIES[0] },
    { label: "All store qty", value: totals.all, color: CHART_SERIES[1] },
    { label: "Low stock items", value: lowStockItems.length, color: CHART_SERIES[3] },
    { label: "Site shortages", value: totals.shortages, color: CHART_SERIES[2] },
    { label: "Site excess", value: totals.excess, color: CHART_SERIES[4] },
    { label: "Pending returns", value: returnsPending, color: CHART_SERIES[5] },
    { label: "Items in transit", value: inTransit, color: CHART_SERIES[0] },
    { label: "Active sites", value: activeSites, color: CHART_SERIES[1] },
  ];

  const siteBars = useMemo(
    () =>
      sites.slice(0, 10).map((s) => ({
        name: String(s.siteName || s.id).slice(0, 14),
        value: items.reduce((sum, it) => sum + Number(stockByStoreItem[`${s.storeId}:${it.id}`] || 0), 0),
      })),
    [items, sites, stockByStoreItem]
  );

  const riskMix = [
    { name: "Low stock", value: lowStockItems.length },
    { name: "Shortages", value: totals.shortages },
    { name: "Excess", value: totals.excess },
    { name: "In transit", value: inTransit },
    { name: "Returns", value: returnsPending },
  ].filter((x) => x.value > 0);

  const stockHealth = totals.all > 0 ? Math.max(15, Math.min(100, 100 - lowStockItems.length * 6 - totals.shortages * 4)) : 0;

  const qtyTrend = useMemo(() => {
    const base = Math.max(totals.all, 1);
    return Array.from({ length: 12 }, (_, i) => ({
      name: `W${i + 1}`,
      value: Math.round(base * (0.72 + i * 0.02 + (i % 3) * 0.015)),
    }));
  }, [totals.all]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <SparkKpi
            key={k.label}
            label={k.label}
            value={k.value}
            series={sparkFromValue(k.value)}
            color={k.color}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel title="Network stock trend" subtitle="Quantity pulse across stores" className="lg:col-span-2" height={220}>
          <AreaTrendChart data={qtyTrend} series={[{ key: "value", name: "Qty", color: CHART_SERIES[0] }]} height={220} />
        </ChartPanel>
        <ChartPanel title="Stock health" subtitle="Shortage & low-stock pressure" height={220}>
          <RadialScoreChart value={stockHealth} label="Health" color={stockHealth >= 75 ? CHART_SERIES[5] : CHART_SERIES[2]} height={200} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartPanel title="Top sites by quantity" height={260}>
          <BarCompareChart data={siteBars} layout="horizontal" series={[{ key: "value", name: "Qty", color: CHART_SERIES[1] }]} height={240} />
        </ChartPanel>
        <ChartPanel title="Risk mix" height={260}>
          <DonutChart data={riskMix} centerLabel="Signals" centerValue={riskMix.reduce((a, x) => a + x.value, 0)} height={240} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Site-wise Stock Summary">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-center p-2 border-b">S.No</th>
                  {["Site", "Active Personnel", "Store", "Total Qty"].map((h) => (
                    <th key={h} className="text-left p-2 border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s, idx) => {
                  const total = items.reduce((sum, it) => sum + Number(stockByStoreItem[`${s.storeId}:${it.id}`] || 0), 0);
                  return (
                    <tr key={s.id} className="border-b">
                      <td className="text-center tabular-nums p-2">{idx + 1}</td>
                      <td className="p-2">{s.siteName}</td>
                      <td className="p-2">{s.activePersonnelCount}</td>
                      <td className="p-2">{stores.find((st) => st.id === s.storeId)?.storeName || "-"}</td>
                      <td className="p-2">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Alerts / Replenishment Intelligence">
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.message} className="border rounded p-2 bg-gray-50 text-sm">
                <p className="font-medium text-gray-900">{a.message}</p>
                <p className="text-xs text-gray-500">Type: {a.type}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

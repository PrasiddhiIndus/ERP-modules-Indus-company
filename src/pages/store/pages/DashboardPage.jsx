import React, { useMemo } from "react";
import { SectionCard } from "../components/StoreUi";

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

  const cards = [
    ["Central Store Qty", totals.central, "bg-blue-50 text-blue-700 border-blue-100"],
    ["All Store Qty", totals.all, "bg-teal-50 text-teal-700 border-teal-100"],
    ["Low Stock Items", lowStockItems.length, "bg-red-50 text-red-700 border-red-100"],
    ["Site Shortages", totals.shortages, "bg-amber-50 text-amber-700 border-amber-100"],
    ["Site Excess", totals.excess, "bg-purple-50 text-purple-700 border-purple-100"],
    ["Pending Returns", returnsPending, "bg-indigo-50 text-indigo-700 border-indigo-100"],
    ["Items In Transit", inTransit, "bg-cyan-50 text-cyan-700 border-cyan-100"],
    ["Active Sites", sites.filter((s) => s.active).length, "bg-emerald-50 text-emerald-700 border-emerald-100"],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map(([label, value, tone]) => (
          <div key={label} className={`p-3 rounded-lg border ${tone}`}>
            <p className="text-[11px] uppercase font-semibold">{label}</p>
            <p className="text-lg font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Site-wise Stock Summary">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {["Site", "Active Personnel", "Store", "Total Qty"].map((h) => (
                    <th key={h} className="text-left p-2 border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const total = items.reduce((sum, it) => sum + Number(stockByStoreItem[`${s.storeId}:${it.id}`] || 0), 0);
                  return (
                    <tr key={s.id} className="border-b">
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


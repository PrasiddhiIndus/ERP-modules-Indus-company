import React, { useMemo, useState } from "react";
import { Badge, SectionCard } from "../components/StoreUi";

export default function SiteStockPage({ data }) {
  const { sites, stores, items, stockByStoreItem, planner } = data;
  const [siteFilter, setSiteFilter] = useState("");

  const filtered = useMemo(
    () => planner.filter((p) => !siteFilter || p.site.id === siteFilter),
    [planner, siteFilter]
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Site Stock (Personnel-linked)"
        right={
          <select className="h-8 border border-gray-300 rounded px-2 text-xs" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">All Sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
          </select>
        }
      >
        <div className="space-y-3">
          {filtered.map(({ site, rows }) => (
            <div key={site.id} className="border border-gray-200 rounded-lg">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-2 justify-between text-xs">
                <span className="font-semibold">{site.siteName}</span>
                <span>Contract: {site.contractType}</span>
                <span>Active Personnel: {site.activePersonnelCount}</span>
                <span>Store: {stores.find((s) => s.id === site.storeId)?.storeName}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white">
                    <tr>
                      {["Item", "Site Stock", "Annual Required", "Issued", "Balance", "Shortage / Excess"].map((h) => (
                        <th key={h} className="text-left p-2 border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${site.id}-${r.itemId}`} className="border-b">
                        <td className="p-2">{r.itemName}</td>
                        <td className="p-2">{stockByStoreItem[`${site.storeId}:${r.itemId}`] || 0}</td>
                        <td className="p-2">{r.required}</td>
                        <td className="p-2">{r.issued}</td>
                        <td className="p-2">{r.balanceToIssue}</td>
                        <td className="p-2">
                          {r.shortfall > 0 ? (
                            <Badge tone="bg-red-50 text-red-700">Shortage {r.shortfall}</Badge>
                          ) : (
                            <Badge tone="bg-green-50 text-green-700">Excess {r.excess}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}


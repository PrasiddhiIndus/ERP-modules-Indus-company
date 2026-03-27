import React from "react";
import { Badge, SectionCard } from "../components/StoreUi";

export default function PlannerPage({ data }) {
  const { planner, items, setSiteOverride } = data;

  return (
    <div className="space-y-4">
      <SectionCard title="Site Requirement Planner (Active Personnel x Entitlement)">
        <div className="space-y-3">
          {planner.map(({ site, rows }) => (
            <div key={site.id} className="border border-gray-200 rounded-lg">
              <div className="px-3 py-2 bg-gray-50 text-xs border-b border-gray-200 flex justify-between">
                <span className="font-semibold">{site.siteName}</span>
                <span>Active Personnel: {site.activePersonnelCount}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white">
                    <tr>
                      {["Item", "Per Person/Year", "Required", "Issued", "Site Stock", "Balance to Issue", "Recommended Dispatch", "Status", "Override"].map((h) => (
                        <th key={h} className="text-left p-2 border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${site.id}-${r.itemId}`} className="border-b">
                        <td className="p-2">{r.itemName}</td>
                        <td className="p-2">{r.perPerson}</td>
                        <td className="p-2">{r.required}</td>
                        <td className="p-2">{r.issued}</td>
                        <td className="p-2">{r.stock}</td>
                        <td className="p-2">{r.balanceToIssue}</td>
                        <td className="p-2">{r.recommendedDispatch}</td>
                        <td className="p-2">
                          {r.shortfall > 0 ? (
                            <Badge tone="bg-red-50 text-red-700">Shortfall {r.shortfall}</Badge>
                          ) : (
                            <Badge tone="bg-green-50 text-green-700">Excess {r.excess}</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            className="h-7 w-20 border border-gray-300 rounded px-1"
                            defaultValue={r.perPerson}
                            onBlur={(e) => setSiteOverride(site.id, r.itemId, Number(e.target.value || 0))}
                          />
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

      <SectionCard title="Annual PPE Issue Matrix">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border-b">Site</th>
                {items.filter((i) => i.annualEntitlementApplicable).map((it) => (
                  <th key={it.id} className="text-left p-2 border-b">{it.itemName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planner.map((p) => (
                <tr key={p.site.id} className="border-b">
                  <td className="p-2">{p.site.siteName}</td>
                  {p.rows.map((r) => (
                    <td key={r.itemId} className="p-2">{r.required} / {r.issued}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}


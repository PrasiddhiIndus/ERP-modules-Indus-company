import React from "react";
import { Badge, SectionCard } from "../components/StoreUi";

function severityTone(type) {
  if (type.includes("shortage")) return "bg-red-50 text-red-700";
  if (type.includes("low")) return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

export default function AlertsPage({ data }) {
  const { alerts } = data;
  return (
    <div className="space-y-4">
      <SectionCard title="Alert Center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {alerts.map((a, idx) => (
            <div key={`${a.type}-${idx}`} className="border border-gray-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between">
                <Badge tone={severityTone(a.type)}>{a.type.replaceAll("_", " ")}</Badge>
                <button className="text-xs underline">Recommended Action</button>
              </div>
              <p className="text-sm mt-2 text-gray-900">{a.message}</p>
              <p className="text-xs text-gray-500 mt-1">Impact: Operational / entitlement risk</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}


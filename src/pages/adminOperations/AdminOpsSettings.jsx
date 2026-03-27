import React from "react";
import { SectionCard, DenseTable, Badge } from "./components/AdminUi";

const masterRows = [
  { id: "1", area: "Leave types", count: "6", note: "Casual, sick, earned, unpaid, emergency, comp-off" },
  { id: "2", area: "Permission types", count: "5", note: "Late in, early out, short exit, official out, other" },
  { id: "3", area: "Gate pass types", count: "12", note: "Emp, goods, visitor, vehicle, courier, digi asset…" },
  { id: "4", area: "Item categories", count: "8", note: "PPE, uniform, safety, tools…" },
  { id: "5", area: "Store types", count: "4", note: "Main, site, temp, linked site" },
  { id: "6", area: "Event / travel types", count: "10", note: "HSE, townhall, client, audit…" },
  { id: "7", area: "Alert rules", count: "24", note: "SLA, thresholds, channels" },
  { id: "8", area: "Approval matrices", count: "6", note: "Leave, permission, gate, travel, transfer, recon" },
];

export default function AdminOpsSettings() {
  return (
    <div className="space-y-4">
      <SectionCard title="Settings / masters — Admin Operations" right={<Badge tone="bg-gray-100 text-gray-700">Admin only</Badge>}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4 text-xs">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase">Company / entity</span>
            <select className="h-8 border border-gray-300 rounded px-2 text-xs">
              <option>IFSPL</option>
              <option>IEVPL</option>
              <option>Group</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase">Role permissions</span>
            <select className="h-8 border border-gray-300 rounded px-2 text-xs">
              <option>Admin team</option>
              <option>Store manager</option>
              <option>Security supervisor</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs w-full md:w-auto">
              Save scope
            </button>
          </div>
        </div>

        <DenseTable
          columns={[
            { key: "area", label: "Master area" },
            { key: "count", label: "Records" },
            { key: "note", label: "Notes" },
            {
              key: "id",
              label: "",
              render: () => (
                <button type="button" className="text-[11px] text-blue-700 font-medium">
                  Configure
                </button>
              ),
            },
          ]}
          rows={masterRows}
          rowKey="id"
        />

        <p className="text-[11px] text-gray-500 mt-3">
          Integrates with global Settings and User Management for authentication; this surface is operational master data for admin workflows.
        </p>
      </SectionCard>
    </div>
  );
}

import React, { useState } from "react";
import { SectionCard, FilterBar, TinySelect, TinyInput, Badge } from "./components/AdminUi";

const reportGroups = [
  {
    title: "Employee",
    items: [
      "Employee master export",
      "Leave report",
      "Permission report",
      "Attendance correction report",
      "Compliance gaps",
      "Exit / F&F report",
    ],
  },
  {
    title: "Store",
    items: [
      "Item-wise stock",
      "Site-wise stock",
      "Issue register",
      "Return register",
      "Transfer / transit report",
      "Planner shortage / excess",
      "Reconciliation variance",
    ],
  },
  {
    title: "Gate",
    items: [
      "Employee movement report",
      "Guest report",
      "Vehicle report",
      "Goods in/out report",
      "Delivery / courier log",
    ],
  },
  {
    title: "Misc",
    items: ["Travel report", "Events report", "Admin request tracker"],
  },
];

export default function AdminOpsReports() {
  const [chart, setChart] = useState(false);
  return (
    <div className="space-y-4">
      <SectionCard title="Reports & analytics — unified catalog" right={<Badge tone="bg-blue-50 text-blue-800">Export CSV / XLSX</Badge>}>
        <FilterBar>
          <TinySelect className="min-w-[120px]">
            <option>IFSPL</option>
            <option>IEVPL</option>
            <option>All</option>
          </TinySelect>
          <TinySelect className="min-w-[120px]">
            <option>All sites</option>
          </TinySelect>
          <TinyInput type="date" className="w-[130px]" />
          <TinyInput type="date" className="w-[130px]" />
          <label className="flex items-center gap-1 text-[11px] text-gray-600">
            <input type="checkbox" checked={chart} onChange={(e) => setChart(e.target.checked)} />
            Chart view
          </label>
          <button type="button" className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs">
            Run report
          </button>
        </FilterBar>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { k: "Open requests", v: "38" },
            { k: "Avg. approval time", v: "6.4h" },
            { k: "Stock accuracy (30d)", v: "99.1%" },
            { k: "Gate exceptions", v: "12" },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase">{s.k}</p>
              <p className="text-lg font-bold text-gray-900">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {reportGroups.map((g) => (
            <div key={g.title} className="rounded-xl border border-gray-200 bg-white">
              <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold text-gray-800">{g.title} reports</div>
              <ul className="p-2 space-y-1 text-xs">
                {g.items.map((it) => (
                  <li key={it} className="flex items-center justify-between gap-2 rounded-md hover:bg-gray-50 px-2 py-1">
                    <span className="text-gray-700">{it}</span>
                    <span className="flex gap-1 shrink-0">
                      <button type="button" className="h-7 px-2 rounded border border-gray-300 text-[11px]">
                        Preview
                      </button>
                      <button type="button" className="h-7 px-2 rounded bg-gray-900 text-white text-[11px]">
                        Export
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 h-36 flex items-center justify-center text-xs text-gray-500">
          {chart ? "Chart area (series by site / week)" : "Table preview appears here after Run report"}
        </div>
      </SectionCard>
    </div>
  );
}

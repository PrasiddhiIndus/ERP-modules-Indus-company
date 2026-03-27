import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard, DenseTable, StatusChip, Badge, FilterBar, TinySelect } from "./components/AdminUi";
import { mockAlerts } from "./data/mockAdminData";

const base = "/app/admin";

const tabs = [
  { id: "employee", label: "Employee" },
  { id: "store", label: "Store" },
  { id: "gate", label: "Gate Pass" },
  { id: "misc", label: "Misc" },
  { id: "compliance", label: "Compliance" },
  { id: "overdue", label: "Overdue / Escalation" },
];

export default function AdminOpsAlerts() {
  const [tab, setTab] = useState("employee");
  const navigate = useNavigate();
  const rows = mockAlerts.filter((a) => a.tab === tab);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Alerts & notifications center"
        right={
          <div className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2 py-1 rounded text-[11px] border ${
                  tab === t.id ? "bg-[#1F3A8A] text-white border-[#1F3A8A]" : "bg-white border-gray-200 text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        <FilterBar>
          <TinySelect className="min-w-[140px]">
            <option>Severity: all</option>
            <option>Critical</option>
            <option>High</option>
            <option>Warning</option>
          </TinySelect>
          <span className="text-[11px] text-gray-500 self-center">Examples: leave queue, shortages, visitor checkout, F&F assets, transit SLA</span>
        </FilterBar>
        <div className="mt-3">
          <DenseTable
            columns={[
              {
                key: "severity",
                label: "Severity",
                render: (r) => (
                  <StatusChip
                    label={r.severity}
                    severity={r.severity === "critical" ? "critical" : r.severity === "high" ? "high" : "warning"}
                  />
                ),
              },
              { key: "title", label: "Alert" },
              { key: "due", label: "Due" },
              { key: "assign", label: "Owner" },
              {
                key: "link",
                label: "Linked action",
                render: (r) => (
                  <button
                    type="button"
                    className="text-[11px] text-blue-700 font-medium"
                    onClick={() => {
                      const map = {
                        Leaves: "employee/leaves-permissions",
                        "Site Stock": "store/site-stock",
                        "Employee Movement": "gate/employee-movement",
                        Compliance: "employee/compliance-documents",
                        Events: "misc/events-coordination",
                        Transfer: "store/transfer-transit",
                      };
                      const p = map[r.link] || "dashboard";
                      navigate(`${base}/${p}`);
                    }}
                  >
                    {r.link} →
                  </button>
                ),
              },
              {
                key: "id",
                label: "Actions",
                render: () => (
                  <div className="flex gap-1">
                    <button type="button" className="text-[10px] text-gray-600 underline">
                      Snooze
                    </button>
                    <button type="button" className="text-[10px] text-gray-600 underline">
                      Done
                    </button>
                  </div>
                ),
              },
            ]}
            rows={
              rows.length
                ? rows
                : [
                    {
                      id: `empty-${tab}`,
                      severity: "info",
                      title: "No items in this tab (sample)",
                      due: "-",
                      assign: "-",
                      link: "Dashboard",
                    },
                  ]
            }
            rowKey="id"
          />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <SectionCard title="SLA snapshot" className="!p-3">
          <p className="text-xs text-gray-600">Critical open: 2 · High: 5 · Breached today: 1</p>
        </SectionCard>
        <SectionCard title="Routing rules" className="!p-3">
          <p className="text-xs text-gray-600">Admin lead, store manager, security — matrix in Settings.</p>
        </SectionCard>
        <SectionCard title="Digest" className="!p-3">
          <Badge tone="bg-gray-100 text-gray-700">Email / Teams hooks</Badge>
        </SectionCard>
      </div>
    </div>
  );
}

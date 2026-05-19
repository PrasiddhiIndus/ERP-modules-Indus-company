import React, { useState } from "react";
import { SectionCard, PageHeader, DenseTable } from "./components/AmcUi";
import { useAmc } from "./contexts/AmcContext";

const MASTER_SECTIONS = [
  { key: "contract_types", label: "Contract Types" },
  { key: "complaint_categories", label: "Complaint Categories" },
  { key: "priority_levels", label: "Priority Levels" },
  { key: "equipment_categories", label: "Equipment Categories" },
  { key: "pm_frequencies", label: "PM Frequencies" },
  { key: "branches", label: "Branches / Regions" },
];

export default function Settings() {
  const { data, refresh } = useAmc();
  const masters = data?.settings || {};
  const [section, setSection] = useState("contract_types");
  const items = masters[section] || [];

  return (
    <div className="space-y-4">
      <PageHeader title="AMC Settings" subtitle="Masters used across contracts, PM and complaints" onRefresh={refresh} />
      <div className="flex flex-wrap gap-2">
        {MASTER_SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`px-3 py-1.5 text-xs rounded-lg border ${
              section === s.key ? "bg-[#1F3A8A] text-white border-[#1F3A8A]" : "bg-white border-gray-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <SectionCard title={MASTER_SECTIONS.find((s) => s.key === section)?.label}>
        <DenseTable
          columns={[
            { key: "code", label: "Code" },
            { key: "label", label: "Label" },
          ]}
          rows={items.map((label, i) => ({ id: String(i), code: label.toLowerCase().replace(/\s+/g, "_"), label }))}
        />
      </SectionCard>
    </div>
  );
}

import React from "react";
import { SectionCard, DenseTable, AmcStatusBadge, PageHeader } from "./components/AmcUi";
import AmcFilterBar from "./components/AmcFilterBar";
import { useAmc } from "./contexts/AmcContext";
export default function TechnicianAllocation() {
  const { data, loading, refresh, related, navigateTo, filters } = useAmc();

  if (loading && !data) {
    return <p className="text-sm text-gray-500 py-8 text-center">Loading technicians…</p>;
  }

  const engineers = data?.engineers || [];
  const rows = engineers.map((e) => {
    const w = related.engineerWorkload(e.id);
    return {
      ...e,
      jobs: w.pm.length + w.complaints.length,
      open_calls: w.complaints.length,
      pending_pm: w.pm.length,
      visits: w.visits.length,
    };
  });

  const filtered = filters.engineerId ? rows.filter((r) => r.id === filters.engineerId) : rows;

  return (
    <div className="space-y-4">
      <PageHeader title="Technician Allocation" subtitle="Workload from live PM, complaints & visits" onRefresh={refresh} />
      <AmcFilterBar />
      <SectionCard title="Technicians">
        <DenseTable
          columns={[
            { key: "name", label: "Technician" },
            { key: "region", label: "Region" },
            { key: "skill", label: "Skill" },
            { key: "availability", label: "Availability", render: (r) => <AmcStatusBadge status={r.availability} /> },
            { key: "jobs", label: "Jobs" },
            { key: "open_calls", label: "Open calls" },
            { key: "pending_pm", label: "Pending PM" },
            {
              key: "actions",
              label: "Drill down",
              render: (r) => (
                <div className="flex gap-2">
                  <button type="button" className="text-[10px] text-[#1F3A8A]" onClick={() => navigateTo("pm-schedule", { engineerId: r.id })}>
                    PM
                  </button>
                  <button type="button" className="text-[10px] text-[#1F3A8A]" onClick={() => navigateTo("complaints", { engineerId: r.id })}>
                    Calls
                  </button>
                </div>
              ),
            },
          ]}
          rows={filtered}
          rowKey="id"
        />
      </SectionCard>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import EntityListPage from "./components/EntityListPage";
import AmcFilterBar from "./components/AmcFilterBar";
import RelatedRecordsTable, { customerColumn, siteColumn, contractColumn } from "./components/RelatedRecordsTable";
import { Drawer, ProfileTabs, DetailField, SectionCard, AmcStatusBadge } from "./components/AmcUi";
import { useAmcSelection } from "./hooks/useAmcList";
import { useAmc } from "./contexts/AmcContext";
import LinkedRecord from "./components/LinkedRecord";
import { PM_STATUS } from "./constants/workflows";

export default function PMSchedule() {
  const { related, navigateTo, openRecord } = useAmc();
  const { rows, loading, search, setSearch, statusFilter, setStatusFilter, reload, selected, setSelected } =
    useAmcSelection("pm-schedule", ["pm_no", "customer_name", "site_name", "asset_name"], { dueField: "due_date" });
  const [view, setView] = useState("list");
  const [tab, setTab] = useState("summary");

  const columns = useMemo(
    () => [
      { key: "pm_no", label: "PM No" },
      contractColumn(),
      customerColumn(),
      siteColumn(),
      {
        key: "asset_name",
        label: "Asset",
        render: (r) => <LinkedRecord type="asset" id={r.asset_id} label={r.asset_name} />,
      },
      { key: "due_date", label: "Due" },
      { key: "assigned_engineer_name", label: "Engineer" },
      { key: "status", label: "Status", render: (r) => <AmcStatusBadge status={r.status} /> },
      { key: "sla_status", label: "SLA", render: (r) => <AmcStatusBadge status={r.sla_status} /> },
    ],
    []
  );

  const visits = selected ? related.visitsForPm(selected.id) : [];

  return (
    <div className="space-y-3">
      <AmcFilterBar />
      <div className="flex items-center gap-2">
        {["list", "calendar", "kanban"].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-xs rounded-lg border ${
              view === v ? "bg-[#1F3A8A] text-white border-[#1F3A8A]" : "bg-white border-gray-300"
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === "list" && (
        <EntityListPage
          title="PM Schedule"
          subtitle="Linked to contract, site, asset — open visits from detail"
          onRefresh={reload}
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={PM_STATUS}
          columns={columns}
          rows={rows}
          loading={loading}
          onRowClick={setSelected}
        />
      )}

      {view === "calendar" && (
        <SectionCard title="PM Calendar">
          <p className="text-xs text-gray-500 mb-2">Showing {rows.length} PM(s) for current filters</p>
          <div className="grid grid-cols-7 gap-1 text-[10px]">
            {rows.slice(0, 14).map((pm) => (
              <button
                key={pm.id}
                type="button"
                onClick={() => setSelected(pm)}
                className="border rounded p-1 min-h-[48px] bg-blue-50 text-left hover:bg-blue-100"
              >
                <span className="font-medium block">{pm.due_date}</span>
                <span className="text-[#1F3A8A]">{pm.pm_no}</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {view === "kanban" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {["due", "assigned", "overdue", "completed"].map((col) => (
            <SectionCard key={col} title={col}>
              <ul className="space-y-1 text-xs">
                {rows
                  .filter((r) => r.status === col)
                  .map((r) => (
                    <li key={r.id}>
                      <button type="button" className="w-full text-left border rounded p-2 hover:bg-gray-50" onClick={() => setSelected(r)}>
                        {r.pm_no}
                      </button>
                    </li>
                  ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}

      <Drawer open={!!selected} title={selected?.pm_no} onClose={() => setSelected(null)}>
        {selected && (
          <ProfileTabs
            tabs={[
              { id: "summary", label: "Summary" },
              { id: "visits", label: "Visits" },
            ]}
            active={tab}
            onChange={setTab}
          >
            {tab === "summary" && (
              <div className="space-y-2">
                <DetailField label="Contract" value={<LinkedRecord type="contract" id={selected.contract_id} label={selected.contract_no} />} />
                <DetailField label="Site" value={<LinkedRecord type="site" id={selected.site_id} label={selected.site_name} />} />
                <DetailField label="Asset" value={<LinkedRecord type="asset" id={selected.asset_id} label={selected.asset_name} />} />
                <DetailField label="Due" value={selected.due_date} />
                <button
                  type="button"
                  className="text-xs mt-2 px-3 py-1.5 bg-[#1F3A8A] text-white rounded"
                  onClick={() => navigateTo("visits", { pmId: selected.id })}
                >
                  Create / view visits
                </button>
              </div>
            )}
            {tab === "visits" && (
              <RelatedRecordsTable
                rows={visits}
                columns={[
                  { key: "visit_no", label: "Visit" },
                  { key: "status", label: "Status" },
                ]}
                onRowClick={(r) => openRecord("visit", r.id)}
                emptyText="No visits — create from Service Visits"
              />
            )}
          </ProfileTabs>
        )}
      </Drawer>
    </div>
  );
}

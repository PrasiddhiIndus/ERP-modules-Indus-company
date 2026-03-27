import React, { useState } from "react";
import { SectionCard, DenseTable, FilterBar, TinyInput, Badge, Drawer, StatusChip } from "../components/AdminUi";
import { mockEvents, mockTravel, mockAdminTasks } from "../data/mockAdminData";

export function MiscEventsPage() {
  const [ev, setEv] = useState(null);
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SectionCard title="Event calendar (month)" className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 h-40 flex items-center justify-center text-xs text-gray-500">
            Calendar grid — Mar 2025 (HSE drills, townhalls)
          </div>
        </SectionCard>
        <SectionCard title="Reminders">
          <ul className="text-xs space-y-2 text-gray-700">
            <li className="flex justify-between">
              <span>Fire drill Alpha</span>
              <Badge tone="bg-amber-50 text-amber-900">2d</Badge>
            </li>
            <li className="flex justify-between">
              <span>Townhall Q1</span>
              <Badge tone="bg-gray-100 text-gray-700">Apr 5</Badge>
            </li>
          </ul>
        </SectionCard>
      </div>
      <SectionCard title="Events list" right={<button className="h-8 px-2 rounded bg-[#1F3A8A] text-white text-xs">New event</button>}>
        <FilterBar>
          <TinyInput type="month" defaultValue="2025-03" className="w-[140px]" />
        </FilterBar>
        <div className="mt-2">
          <DenseTable
            columns={[
              { key: "name", label: "Event" },
              { key: "date", label: "Date" },
              { key: "venue", label: "Venue" },
              { key: "coord", label: "Coordinator" },
              {
                key: "status",
                label: "Status",
                render: (r) => <StatusChip label={r.status} severity="info" />,
              },
              { key: "tasks", label: "Support tasks" },
              {
                key: "id",
                label: "",
                render: (r) => (
                  <button type="button" className="text-[11px] text-blue-700 font-medium" onClick={() => setEv(r)}>
                    Open
                  </button>
                ),
              },
            ]}
            rows={mockEvents}
            rowKey="id"
          />
        </div>
      </SectionCard>
      <Drawer open={!!ev} onClose={() => setEv(null)} title={ev?.name || ""}>
        {ev && (
          <div className="text-xs space-y-2 text-gray-700">
            <p>{ev.venue}</p>
            <p>Tasks: {ev.tasks}</p>
          </div>
        )}
      </Drawer>
    </>
  );
}

export function MiscTravelPage() {
  return (
    <SectionCard title="Tour / travel" right={<button className="h-8 px-2 rounded border text-xs">New travel request</button>}>
      <DenseTable
        columns={[
          { key: "emp", label: "Employee" },
          { key: "dest", label: "Destination" },
          { key: "purpose", label: "Purpose" },
          { key: "from", label: "From" },
          { key: "to", label: "To" },
          {
            key: "status",
            label: "Approval",
            render: (r) => <StatusChip label={r.status} severity={r.status.includes("Pending") ? "warning" : "info"} />,
          },
          { key: "advance", label: "Advance" },
        ]}
        rows={mockTravel}
        rowKey="id"
      />
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        {mockTravel.map((t) => (
          <div key={t.id} className="rounded-lg border border-gray-200 p-2 text-xs">
            <p className="font-semibold text-gray-900">{t.emp}</p>
            <p className="text-gray-600">{t.dest} · {t.purpose}</p>
            <p className="text-[11px] text-blue-800 mt-1">Itinerary card · transport · stay (hooks)</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function MiscTasksPage() {
  return (
    <SectionCard title="Admin tasks / other requests" right={<button className="h-8 px-2 rounded bg-[#1F3A8A] text-white text-xs">Log request</button>}>
      <FilterBar>
        <TinyInput placeholder="Assigned to" className="min-w-[120px]" />
        <select className="h-8 border border-gray-300 rounded px-2 text-xs">
          <option>All status</option>
          <option>Open</option>
          <option>In progress</option>
        </select>
      </FilterBar>
      <div className="mt-2">
        <DenseTable
          columns={[
            { key: "title", label: "Request" },
            { key: "type", label: "Type" },
            { key: "assignee", label: "Assigned" },
            { key: "due", label: "Due" },
            {
              key: "status",
              label: "Status",
              render: (r) => <StatusChip label={r.status} severity="info" />,
            },
          ]}
          rows={mockAdminTasks}
          rowKey="id"
        />
      </div>
    </SectionCard>
  );
}

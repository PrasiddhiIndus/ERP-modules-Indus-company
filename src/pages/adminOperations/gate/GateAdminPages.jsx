import React, { useState } from "react";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Badge,
  LinkedChip,
  Modal,
} from "../components/AdminUi";
import { mockGateEmployeeMoves, mockVisitors, mockVehicles, mockDeliveries } from "../data/mockAdminData";

export function GateEmployeeMovementPage() {
  const [modal, setModal] = useState(null);
  const cols = [
    { key: "emp", label: "Employee" },
    { key: "reason", label: "Reason" },
    { key: "dest", label: "Destination" },
    { key: "expReturn", label: "Exp. return" },
    { key: "mgr", label: "Manager" },
    { key: "sec", label: "Security" },
    { key: "out", label: "Out" },
    { key: "inn", label: "In" },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusChip label={r.status} severity={r.status === "Outside" ? "warning" : "info"} />,
    },
    {
      key: "id",
      label: "",
      render: (r) => (
        <button type="button" className="text-[11px] text-blue-700 font-medium" onClick={() => setModal(r)}>
          Log
        </button>
      ),
    },
  ];
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <SectionCard title="Movement requests & approval queue" className="xl:col-span-2">
          <FilterBar>
            <TinyInput type="date" className="w-[130px]" />
            <TinySelect>
              <option>All statuses</option>
              <option>Outside</option>
              <option>Overdue</option>
            </TinySelect>
            <button type="button" className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs">
              New request
            </button>
          </FilterBar>
          <div className="mt-2">
            <DenseTable columns={cols} rows={mockGateEmployeeMoves} rowKey="id" />
          </div>
        </SectionCard>
        <div className="space-y-3">
          <SectionCard title="Currently outside">
            <ul className="text-xs space-y-1 text-gray-700">
              <li>· Amit Verma — client visit — due 17:30</li>
              <li>· Contractor escort — due 16:00</li>
            </ul>
          </SectionCard>
          <SectionCard title="Attendance link">
            <p className="text-xs text-gray-600">Approved movements can flag attendance exceptions for same day.</p>
            <LinkedChip label="Raw Attendance Data" toHint="corrections" />
          </SectionCard>
        </div>
      </div>
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title="Actual out / in log"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="h-8 px-3 rounded border text-xs" onClick={() => setModal(null)}>
              Close
            </button>
            <button type="button" className="h-8 px-3 rounded bg-gray-900 text-white text-xs" onClick={() => setModal(null)}>
              Save verification
            </button>
          </div>
        }
      >
        {modal && (
          <div className="text-xs space-y-2">
            <p>{modal.emp}</p>
            <TinyInput type="time" className="w-full" />
            <TinyInput type="time" className="w-full" />
          </div>
        )}
      </Modal>
    </>
  );
}

export function GateGoodsPage() {
  return (
    <SectionCard title="Goods in / out" right={<Badge tone="bg-gray-100 text-gray-700">Linked store / repair</Badge>}>
      <FilterBar>
        <TinySelect>
          <option>Movement type</option>
          <option>Repair inward</option>
          <option>Repair outward</option>
          <option>Scrap</option>
          <option>Courier</option>
        </TinySelect>
        <TinySelect>
          <option>Pending approval</option>
        </TinySelect>
      </FilterBar>
      <div className="mt-2">
        <DenseTable
          columns={[
            { key: "ref", label: "Ref" },
            { key: "dir", label: "Dir" },
            { key: "type", label: "Type" },
            { key: "qty", label: "Qty" },
            { key: "approval", label: "Approval" },
            { key: "sec", label: "Security" },
            { key: "link", label: "Linked" },
          ]}
          rows={[
            { id: "1", ref: "GO-441", dir: "Out", type: "Repair", qty: "Pump × 1", approval: "OK", sec: "Pending", link: "WO-992" },
            { id: "2", ref: "GI-220", dir: "In", type: "Parts", qty: "Seal kit", approval: "OK", sec: "OK", link: "PO-1188" },
          ]}
        />
      </div>
      <LinkedChip label="Store issue/return" toHint="Store module" />
    </SectionCard>
  );
}

export function GateVisitorsPage() {
  return (
    <SectionCard title="Visitor / guest passes" right={<button className="h-8 px-2 rounded border text-xs">Create pass</button>}>
      <DenseTable
        columns={[
          { key: "name", label: "Visitor" },
          { key: "host", label: "Host" },
          { key: "idType", label: "ID" },
          { key: "exp", label: "Exp." },
          { key: "in", label: "In" },
          { key: "out", label: "Out" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusChip label={r.status} severity={r.status === "Inside" ? "warning" : "info"} />,
          },
        ]}
        rows={mockVisitors}
        rowKey="id"
      />
    </SectionCard>
  );
}

export function GateVehiclesPage() {
  return (
    <SectionCard title="Vehicle passes" right={<button className="h-8 px-2 rounded border text-xs">Register entry</button>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <SectionCard title="Currently inside" className="!shadow-none">
          <DenseTable
            columns={[
              { key: "reg", label: "Reg" },
              { key: "type", label: "Type" },
              { key: "in", label: "In" },
            ]}
            rows={mockVehicles.filter((v) => v.status === "Inside")}
            rowKey="id"
          />
        </SectionCard>
        <SectionCard title="Overdue stay" className="!shadow-none">
          <p className="text-xs text-amber-800">MH-22-XX-9912 — delivery — &gt; 120m inside</p>
        </SectionCard>
      </div>
      <DenseTable
        columns={[
          { key: "reg", label: "Reg" },
          { key: "type", label: "Type" },
          { key: "driver", label: "Driver" },
          { key: "linked", label: "Linked" },
          { key: "in", label: "In" },
          { key: "out", label: "Out" },
          { key: "status", label: "Status" },
        ]}
        rows={mockVehicles}
        rowKey="id"
      />
    </SectionCard>
  );
}

export function GateDeliveryPage() {
  return (
    <SectionCard title="Delivery / courier / post" right={<button className="h-8 px-2 rounded bg-[#1F3A8A] text-white text-xs">Register</button>}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <DenseTable
            columns={[
              { key: "kind", label: "Kind" },
              { key: "carrier", label: "Carrier" },
              { key: "ref", label: "Ref" },
              { key: "item", label: "Summary" },
              { key: "recvBy", label: "Received by" },
              { key: "status", label: "Status" },
            ]}
            rows={mockDeliveries}
            rowKey="id"
          />
        </div>
        <SectionCard title="Pending pickup" className="!shadow-none">
          <ul className="text-xs text-gray-700 space-y-1 list-disc pl-4">
            <li>BD882991 — HR documents</li>
            <li>AMZ-22109 — handed over to IT</li>
          </ul>
        </SectionCard>
      </div>
    </SectionCard>
  );
}

export function GateSecurityConsolePage() {
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
        Gate-facing mode: large tap targets, minimal chrome. Use scanner / pass ID search.
      </div>
      <SectionCard title="Security console — today" right={<TinyInput placeholder="Scan pass ID" className="min-w-[200px]" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Approved passes</p>
            <DenseTable
              columns={[
                { key: "id", label: "Pass" },
                { key: "kind", label: "Kind" },
                { key: "party", label: "Party" },
                { key: "action", label: "Action" },
              ]}
              rows={[
                { id: "GP-9921", kind: "Goods", party: "Repair vendor", action: "Mark OUT" },
                { id: "VP-2210", kind: "Visitor", party: "ABC Safety", action: "Mark IN" },
              ]}
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Inside now</p>
            <DenseTable
              columns={[
                { key: "x", label: "Entity" },
                { key: "since", label: "Since" },
              ]}
              rows={[
                { id: "1", x: "Vehicle MH-12-AB-1022", since: "08:40" },
                { id: "2", x: "Visitor Vendor – ABC", since: "10:05" },
              ]}
            />
            <button type="button" className="mt-2 h-9 px-3 rounded-lg border border-red-200 text-red-800 text-xs font-medium w-full md:w-auto">
              Report discrepancy
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

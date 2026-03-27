import React, { useState } from "react";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  Badge,
  StatusChip,
  Drawer,
  LinkedChip,
  Timeline,
} from "../components/AdminUi";
import {
  mockStoreItems,
  mockStores,
  mockSiteStock,
  mockTransfers,
  mockPlannerRows,
  mockReconciliation,
} from "../data/mockAdminData";

export function StoreItemMasterPage() {
  const [d, setD] = useState(null);
  const cols = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "uom", label: "UOM" },
    { key: "type", label: "Type" },
    { key: "annual", label: "Annual ent.", render: (r) => (r.annual ? "Yes" : "No") },
    { key: "defQty", label: "Def. qty" },
    { key: "reorder", label: "Reorder" },
    {
      key: "active",
      label: "Active",
      render: (r) => <StatusChip label={r.active ? "Yes" : "No"} severity={r.active ? "info" : "warning"} />,
    },
  ];
  return (
    <>
      <SectionCard title="Item master — PPE & manpower support" right={<button className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs">Add item</button>}>
        <FilterBar>
          <TinyInput placeholder="Search code / name" className="min-w-[160px]" />
          <TinySelect>
            <option>All categories</option>
            <option>PPE</option>
            <option>Safety</option>
            <option>Uniform</option>
          </TinySelect>
        </FilterBar>
        <div className="mt-2">
          <DenseTable columns={cols} rows={mockStoreItems} onRowClick={setD} />
        </div>
      </SectionCard>
      <Drawer open={!!d} onClose={() => setD(null)} title={d ? `${d.code} · ${d.name}` : ""}>
        {d && (
          <div className="text-xs space-y-2 text-gray-700">
            <p>Returnable / consumable driver affects issue & return forms.</p>
            <LinkedChip label="Issues" toHint="Issue Entry" />
            <LinkedChip label="Planner" toHint="Requirement Planner" />
          </div>
        )}
      </Drawer>
    </>
  );
}

export function StoreMasterPage() {
  return (
    <SectionCard title="Store master" right={<button className="h-8 px-3 rounded border text-xs">Add store</button>}>
      <DenseTable
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "site", label: "Linked site" },
          { key: "location", label: "Location" },
          { key: "incharge", label: "Incharge" },
          { key: "active", label: "Active", render: (r) => (r.active ? "Y" : "N") },
        ]}
        rows={mockStores}
        rowKey="id"
      />
    </SectionCard>
  );
}

export function StoreSiteStockPage() {
  return (
    <SectionCard title="Site stock view" right={<Badge tone="bg-blue-50 text-blue-800">Manpower-linked</Badge>}>
      <FilterBar>
        <TinySelect>
          <option>Year: 2025</option>
        </TinySelect>
        <TinySelect>
          <option>All sites</option>
          <option>Plant Alpha</option>
        </TinySelect>
        <TinyInput placeholder="Item filter" className="min-w-[120px]" />
      </FilterBar>
      <div className="mt-2">
        <DenseTable
          columns={[
            { key: "site", label: "Site" },
            { key: "store", label: "Store" },
            { key: "personnel", label: "Active personnel" },
            { key: "item", label: "Item" },
            { key: "entitled", label: "Entitled (Y)" },
            { key: "issued", label: "Issued" },
            { key: "returned", label: "Returned" },
            { key: "balance", label: "Balance" },
            {
              key: "shortage",
              label: "Shortage",
              render: (r) =>
                r.shortage > 0 ? <Badge tone="bg-red-50 text-red-800">{r.shortage}</Badge> : <span className="text-gray-400">0</span>,
            },
            {
              key: "excess",
              label: "Excess",
              render: (r) =>
                r.excess > 0 ? <Badge tone="bg-amber-50 text-amber-900">{r.excess}</Badge> : <span className="text-gray-400">0</span>,
            },
          ]}
          rows={mockSiteStock}
          rowKey="id"
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-2">Drilldown: expandable site cards can map to same row set (UI dense mode).</p>
    </SectionCard>
  );
}

function IssueReturnForm({ title, mode }) {
  return (
    <SectionCard title={title} right={<LinkedChip label="Store balance" toHint="preview below" />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Issue date</span>
          <TinyInput type="date" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Reason</span>
          <TinySelect>
            <option>Main → site</option>
            <option>Replacement</option>
            <option>Shutdown support</option>
            <option>Emergency</option>
          </TinySelect>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Source store</span>
          <TinySelect>
            <option>STR-CEN</option>
          </TinySelect>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Destination</span>
          <TinySelect>
            <option>STR-SA / Plant Alpha</option>
          </TinySelect>
        </label>
      </div>
      <div className="mt-3">
        <DenseTable
          columns={[
            { key: "item", label: "Item" },
            { key: "avail", label: "Available" },
            { key: "qty", label: mode === "return" ? "Good / Damaged" : "Qty" },
            { key: "ret", label: "Returnable?" },
          ]}
          rows={[
            { id: "1", item: "PPE Set", avail: 600, qty: mode === "return" ? "10 / 0" : "20", ret: "Yes" },
            { id: "2", item: "Helmet", avail: 120, qty: mode === "return" ? "2 / 1" : "5", ret: "Semi" },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs">
          Post {mode === "return" ? "return" : "issue"}
        </button>
        <span className="text-[11px] text-gray-500">Balance preview updates ledger (integration later).</span>
      </div>
    </SectionCard>
  );
}

export function StoreIssuePage() {
  return <IssueReturnForm title="Issue entry — outward" mode="issue" />;
}

export function StoreReturnPage() {
  return <IssueReturnForm title="Return entry" mode="return" />;
}

export function StoreTransferPage() {
  return (
    <SectionCard title="Transfer / transit" right={<StatusChip label="Discrepancy watch" severity="warning" />}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <FilterBar>
            <TinySelect>
              <option>All statuses</option>
              <option>In transit</option>
              <option>Received</option>
            </TinySelect>
          </FilterBar>
          <div className="mt-2">
            <DenseTable
              columns={[
                { key: "from", label: "From" },
                { key: "to", label: "To" },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <StatusChip label={r.status} severity={r.status.includes("transit") ? "warning" : "info"} />,
                },
                { key: "lines", label: "Lines" },
                {
                  key: "disc",
                  label: "Disc.",
                  render: (r) => (r.disc ? <Badge tone="bg-red-50 text-red-800">Yes</Badge> : "—"),
                },
              ]}
              rows={mockTransfers}
              rowKey="id"
            />
          </div>
        </div>
        <SectionCard title="Transit timeline (sample)" className="!shadow-none">
          <Timeline
            items={[
              { title: "Requested", meta: "Site manager · 08:30" },
              { title: "Approved & dispatched", meta: "Store · 09:10" },
              { title: "In transit", meta: "ETA 18:00" },
              { title: "Received / closed", meta: "Pending" },
            ]}
          />
          <p className="text-[11px] text-gray-500 mt-3">Link to gate goods movement when vehicle leaves campus.</p>
        </SectionCard>
      </div>
    </SectionCard>
  );
}

export function StorePlannerPage() {
  return (
    <div className="space-y-3">
      <SectionCard title="Requirement planner — entitlement × personnel" right={<Badge tone="bg-purple-50 text-purple-900">Overrides</Badge>}>
        <FilterBar>
          <TinySelect>
            <option>Year 2025</option>
          </TinySelect>
          <TinySelect>
            <option>All companies</option>
          </TinySelect>
          <TinySelect>
            <option>All sites</option>
          </TinySelect>
        </FilterBar>
        <div className="mt-2">
          <DenseTable
            columns={[
              { key: "site", label: "Site" },
              { key: "personnel", label: "Active personnel" },
              { key: "item", label: "Item" },
              { key: "entitledY", label: "Entitled (Y)" },
              { key: "issuedY", label: "Issued (Y)" },
              { key: "stock", label: "Site stock" },
              { key: "shortage", label: "Shortage", render: (r) => <Badge tone="bg-red-50 text-red-800">{r.shortage}</Badge> },
              { key: "recDispatch", label: "Recommended dispatch" },
            ]}
            rows={mockPlannerRows}
            rowKey="id"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          {mockPlannerRows.map((r) => (
            <div key={r.site + r.item} className="rounded-lg border border-gray-200 p-2 text-xs bg-gray-50/60">
              <p className="font-semibold text-gray-900">{r.site}</p>
              <p className="text-gray-600">{r.item}</p>
              <p className="text-[11px] text-blue-800 mt-1">{r.recDispatch}</p>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <LinkedChip label="Site manpower" toHint="HR / site tables" />
        </div>
      </SectionCard>
    </div>
  );
}

export function StoreReconciliationPage() {
  const [m, setM] = useState(null);
  return (
    <>
      <SectionCard title="Physical vs system reconciliation" right={<button className="h-8 px-2 rounded border text-xs">Variance report</button>}>
        <DenseTable
          columns={[
            { key: "site", label: "Site / store" },
            { key: "item", label: "Item" },
            { key: "sys", label: "System" },
            { key: "phys", label: "Physical" },
            {
              key: "var",
              label: "Var",
              render: (r) => (
                <span className={r.var < 0 ? "text-red-700 font-semibold" : r.var > 0 ? "text-amber-700 font-semibold" : ""}>{r.var}</span>
              ),
            },
            { key: "reason", label: "Reason tag" },
            { key: "approval", label: "Approval" },
            {
              key: "id",
              label: "",
              render: (r) => (
                <button type="button" className="text-[11px] text-blue-700 font-medium" onClick={() => setM(r)}>
                  Action
                </button>
              ),
            },
          ]}
          rows={mockReconciliation}
          rowKey="id"
        />
      </SectionCard>
      {m && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setM(null)} aria-label="close" />
          <div className="relative bg-white rounded-xl border shadow-xl max-w-sm w-full p-4 text-sm">
            <p className="font-semibold mb-2">Approve variance</p>
            <p className="text-xs text-gray-600 mb-3">
              {m.site} · {m.item} · delta {m.var}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="h-8 px-3 rounded border text-xs" onClick={() => setM(null)}>
                Cancel
              </button>
              <button type="button" className="h-8 px-3 rounded bg-[#1F3A8A] text-white text-xs" onClick={() => setM(null)}>
                Approve adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

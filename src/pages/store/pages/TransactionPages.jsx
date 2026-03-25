import React, { useMemo, useState } from "react";
import { SectionCard } from "../components/StoreUi";

function RowEditor({ rows, setRows, items, mode }) {
  const update = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            {["Item", "Qty", mode === "return" ? "Good Qty" : null, mode === "return" ? "Damaged Qty" : null, "Condition", "Remarks"]
              .filter(Boolean)
              .map((h) => (
                <th key={h} className="text-left p-2 border-b">{h}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-b">
              <td className="p-1.5">
                <select className="w-full h-8 border border-gray-300 rounded px-2" value={r.itemId} onChange={(e) => update(idx, "itemId", e.target.value)}>
                  <option value="">Select Item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.itemName}</option>)}
                </select>
              </td>
              <td className="p-1.5"><input type="number" className="w-full h-8 border border-gray-300 rounded px-2" value={r.qty ?? ""} onChange={(e) => update(idx, "qty", Number(e.target.value || 0))} /></td>
              {mode === "return" && <td className="p-1.5"><input type="number" className="w-full h-8 border border-gray-300 rounded px-2" value={r.goodQty ?? ""} onChange={(e) => update(idx, "goodQty", Number(e.target.value || 0))} /></td>}
              {mode === "return" && <td className="p-1.5"><input type="number" className="w-full h-8 border border-gray-300 rounded px-2" value={r.damagedQty ?? ""} onChange={(e) => update(idx, "damagedQty", Number(e.target.value || 0))} /></td>}
              <td className="p-1.5"><input className="w-full h-8 border border-gray-300 rounded px-2" value={r.condition || ""} onChange={(e) => update(idx, "condition", e.target.value)} /></td>
              <td className="p-1.5"><input className="w-full h-8 border border-gray-300 rounded px-2" value={r.remarks || ""} onChange={(e) => update(idx, "remarks", e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InwardPage({ data }) {
  const { stores, items, createInward } = data;
  const [header, setHeader] = useState({ date: "", destinationStoreId: "", sourceType: "purchase", sourceRef: "", remarks: "" });
  const [rows, setRows] = useState([{ itemId: "", qty: 0, condition: "good", remarks: "" }]);
  const submit = () => createInward({ ...header, rows: rows.filter((r) => r.itemId && r.qty > 0) });
  return (
    <div className="space-y-4">
      <SectionCard title="Inward Entry">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-2">
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" type="date" value={header.date} onChange={(e) => setHeader((p) => ({ ...p, date: e.target.value }))} />
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.destinationStoreId} onChange={(e) => setHeader((p) => ({ ...p, destinationStoreId: e.target.value }))}>
            <option value="">Destination Store</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}
          </select>
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.sourceType} onChange={(e) => setHeader((p) => ({ ...p, sourceType: e.target.value }))} />
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" placeholder="Source Ref" value={header.sourceRef} onChange={(e) => setHeader((p) => ({ ...p, sourceRef: e.target.value }))} />
          <button onClick={submit} className="h-9 rounded bg-[#1F3A8A] text-white text-sm">Save Inward</button>
        </div>
      </SectionCard>
      <SectionCard title="Inward Item Rows" right={<button className="text-xs underline" onClick={() => setRows((p) => [...p, { itemId: "", qty: 0 }])}>+ Add Row</button>}>
        <RowEditor rows={rows} setRows={setRows} items={items} />
      </SectionCard>
    </div>
  );
}

export function OutwardPage({ data }) {
  const { stores, items, sites, createOutward } = data;
  const [header, setHeader] = useState({ date: "", sourceStoreId: "", destinationStoreId: "", linkedSiteId: "", reason: "site issue" });
  const [rows, setRows] = useState([{ itemId: "", qty: 0, returnable: false, expectedReturnDate: "" }]);
  const submit = () => createOutward({ ...header, rows: rows.filter((r) => r.itemId && r.qty > 0) });
  return (
    <div className="space-y-4">
      <SectionCard title="Outward / Issue Entry">
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-2">
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" type="date" value={header.date} onChange={(e) => setHeader((p) => ({ ...p, date: e.target.value }))} />
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.sourceStoreId} onChange={(e) => setHeader((p) => ({ ...p, sourceStoreId: e.target.value }))}>
            <option value="">Source Store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}
          </select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.destinationStoreId} onChange={(e) => setHeader((p) => ({ ...p, destinationStoreId: e.target.value }))}>
            <option value="">Destination Store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}
          </select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.linkedSiteId} onChange={(e) => setHeader((p) => ({ ...p, linkedSiteId: e.target.value }))}>
            <option value="">Linked Site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
          </select>
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.reason} onChange={(e) => setHeader((p) => ({ ...p, reason: e.target.value }))} />
          <button onClick={submit} className="h-9 rounded bg-[#1F3A8A] text-white text-sm">Save Issue</button>
        </div>
      </SectionCard>
      <SectionCard title="Issue Rows" right={<button className="text-xs underline" onClick={() => setRows((p) => [...p, { itemId: "", qty: 0 }])}>+ Add Row</button>}>
        <RowEditor rows={rows} setRows={setRows} items={items} />
      </SectionCard>
    </div>
  );
}

export function ReturnPage({ data }) {
  const { stores, items, createReturn } = data;
  const [header, setHeader] = useState({ date: "", sourceStoreId: "", destinationStoreId: "", reason: "excess return" });
  const [rows, setRows] = useState([{ itemId: "", goodQty: 0, damagedQty: 0, condition: "good", remarks: "" }]);
  const submit = () => createReturn({ ...header, rows: rows.filter((r) => r.itemId && (r.goodQty > 0 || r.damagedQty > 0)) });
  return (
    <div className="space-y-4">
      <SectionCard title="Return Entry">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-2">
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" type="date" value={header.date} onChange={(e) => setHeader((p) => ({ ...p, date: e.target.value }))} />
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.sourceStoreId} onChange={(e) => setHeader((p) => ({ ...p, sourceStoreId: e.target.value }))}><option value="">Source Store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}</select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.destinationStoreId} onChange={(e) => setHeader((p) => ({ ...p, destinationStoreId: e.target.value }))}><option value="">Destination Store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}</select>
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.reason} onChange={(e) => setHeader((p) => ({ ...p, reason: e.target.value }))} />
          <button onClick={submit} className="h-9 rounded bg-[#1F3A8A] text-white text-sm">Save Return</button>
        </div>
      </SectionCard>
      <SectionCard title="Return Rows" right={<button className="text-xs underline" onClick={() => setRows((p) => [...p, { itemId: "", goodQty: 0, damagedQty: 0 }])}>+ Add Row</button>}>
        <RowEditor mode="return" rows={rows} setRows={setRows} items={items} />
      </SectionCard>
    </div>
  );
}

export function TransferPage({ data }) {
  const { stores, items, createTransfer } = data;
  const [header, setHeader] = useState({ date: "", fromStoreId: "", toStoreId: "", status: "draft", linkedSiteId: "" });
  const [rows, setRows] = useState([{ itemId: "", qty: 0, condition: "good", remarks: "" }]);
  const submit = () => createTransfer({ ...header, rows: rows.filter((r) => r.itemId && r.qty > 0) });

  const risk = useMemo(() => (header.status === "dispatched" ? "Medium" : "Low"), [header.status]);

  return (
    <div className="space-y-4">
      <SectionCard title="Transfer Entry">
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-2">
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" type="date" value={header.date} onChange={(e) => setHeader((p) => ({ ...p, date: e.target.value }))} />
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.fromStoreId} onChange={(e) => setHeader((p) => ({ ...p, fromStoreId: e.target.value }))}><option value="">From Store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}</select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.toStoreId} onChange={(e) => setHeader((p) => ({ ...p, toStoreId: e.target.value }))}><option value="">To Store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}</select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={header.status} onChange={(e) => setHeader((p) => ({ ...p, status: e.target.value }))}>
            {["draft", "dispatched", "received", "cancelled"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="h-9 rounded border border-gray-300 px-2 flex items-center text-xs">Risk: {risk}</div>
          <button onClick={submit} className="h-9 rounded bg-[#1F3A8A] text-white text-sm">Save Transfer</button>
        </div>
      </SectionCard>
      <SectionCard title="Transfer Rows" right={<button className="text-xs underline" onClick={() => setRows((p) => [...p, { itemId: "", qty: 0 }])}>+ Add Row</button>}>
        <RowEditor rows={rows} setRows={setRows} items={items} />
      </SectionCard>
    </div>
  );
}


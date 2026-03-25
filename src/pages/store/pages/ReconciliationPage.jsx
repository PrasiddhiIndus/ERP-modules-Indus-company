import React, { useState } from "react";
import { SectionCard } from "../components/StoreUi";

export default function ReconciliationPage({ data }) {
  const { stores, items, stockByStoreItem, addReconciliation, reconciliations } = data;
  const [form, setForm] = useState({ storeId: "", itemId: "", date: "", physicalQty: 0, reason: "", approvalRemarks: "" });

  const systemQty = form.storeId && form.itemId ? Number(stockByStoreItem[`${form.storeId}:${form.itemId}`] || 0) : 0;
  const variance = Number(form.physicalQty || 0) - systemQty;

  const submit = () => {
    if (!form.storeId || !form.itemId) return;
    addReconciliation({ ...form, systemQty, variance });
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Stock Reconciliation">
        <div className="grid grid-cols-2 xl:grid-cols-7 gap-2">
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={form.storeId} onChange={(e) => setForm((p) => ({ ...p, storeId: e.target.value }))}>
            <option value="">Store / Site</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}
          </select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={form.itemId} onChange={(e) => setForm((p) => ({ ...p, itemId: e.target.value }))}>
            <option value="">Item</option>{items.map((i) => <option key={i.id} value={i.id}>{i.itemName}</option>)}
          </select>
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          <div className="h-9 border border-gray-300 rounded px-2 text-sm flex items-center">System Qty: {systemQty}</div>
          <input className="h-9 border border-gray-300 rounded px-2 text-sm" type="number" placeholder="Physical Qty" value={form.physicalQty} onChange={(e) => setForm((p) => ({ ...p, physicalQty: Number(e.target.value || 0) }))} />
          <div className="h-9 border border-gray-300 rounded px-2 text-sm flex items-center">Variance: {variance}</div>
          <button onClick={submit} className="h-9 rounded bg-[#1F3A8A] text-white text-sm">Save</button>
        </div>
      </SectionCard>

      <SectionCard title="Variance Register">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {["Date", "Store", "Item", "System Qty", "Physical Qty", "Variance", "Reason"].map((h) => (
                  <th key={h} className="text-left p-2 border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reconciliations.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.date}</td>
                  <td className="p-2">{stores.find((s) => s.id === r.storeId)?.storeName}</td>
                  <td className="p-2">{items.find((i) => i.id === r.itemId)?.itemName}</td>
                  <td className="p-2">{r.systemQty}</td>
                  <td className="p-2">{r.physicalQty}</td>
                  <td className="p-2">{r.variance}</td>
                  <td className="p-2">{r.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}


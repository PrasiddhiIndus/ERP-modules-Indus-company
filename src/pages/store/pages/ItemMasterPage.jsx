import React, { useState } from "react";
import { ITEM_CATEGORIES, ISSUE_TYPES } from "../constants";
import { SectionCard, TinyInput } from "../components/StoreUi";

const initialForm = {
  itemCode: "",
  itemName: "",
  category: "PPE",
  subcategory: "",
  uom: "nos",
  itemType: "PPE",
  issueType: "consumable",
  annualEntitlementApplicable: true,
  defaultAnnualQtyPerPerson: 1,
  reorderLevel: 0,
  minStock: 0,
  active: true,
  remarks: "",
};

export default function ItemMasterPage({ data }) {
  const { items, addItem } = data;
  const [form, setForm] = useState(initialForm);

  const submit = () => {
    if (!form.itemCode || !form.itemName) return;
    addItem(form);
    setForm(initialForm);
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Create Item">
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-2">
          <TinyInput placeholder="Item Code" value={form.itemCode} onChange={(e) => setForm((p) => ({ ...p, itemCode: e.target.value }))} />
          <TinyInput placeholder="Item Name" value={form.itemName} onChange={(e) => setForm((p) => ({ ...p, itemName: e.target.value }))} />
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
            {ITEM_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={form.issueType} onChange={(e) => setForm((p) => ({ ...p, issueType: e.target.value }))}>
            {ISSUE_TYPES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <TinyInput type="number" placeholder="Annual Qty/Person" value={form.defaultAnnualQtyPerPerson} onChange={(e) => setForm((p) => ({ ...p, defaultAnnualQtyPerPerson: Number(e.target.value) }))} />
          <button onClick={submit} className="h-9 rounded bg-[#1F3A8A] text-white text-sm">Add Item</button>
        </div>
      </SectionCard>

      <SectionCard title="Item Master Table">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {["Code", "Name", "Category", "Issue Type", "Annual Qty", "Reorder", "Min", "Status"].map((h) => (
                  <th key={h} className="text-left p-2 border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b">
                  <td className="p-2">{it.itemCode}</td>
                  <td className="p-2">{it.itemName}</td>
                  <td className="p-2">{it.category}</td>
                  <td className="p-2">{it.issueType}</td>
                  <td className="p-2">{it.defaultAnnualQtyPerPerson}</td>
                  <td className="p-2">{it.reorderLevel}</td>
                  <td className="p-2">{it.minStock}</td>
                  <td className="p-2">{it.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}


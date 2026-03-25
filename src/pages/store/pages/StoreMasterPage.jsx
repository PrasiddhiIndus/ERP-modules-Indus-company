import React, { useState } from "react";
import { STORE_TYPES } from "../constants";
import { SectionCard, TinyInput } from "../components/StoreUi";

const initialForm = {
  storeCode: "",
  storeName: "",
  storeType: "Site Store",
  linkedSiteId: "",
  location: "",
  incharge: "",
  active: true,
};

export default function StoreMasterPage({ data }) {
  const { stores, sites, addStore } = data;
  const [form, setForm] = useState(initialForm);

  const submit = () => {
    if (!form.storeCode || !form.storeName) return;
    addStore(form);
    setForm(initialForm);
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Create Store">
        <div className="grid grid-cols-2 xl:grid-cols-7 gap-2">
          <TinyInput placeholder="Store Code" value={form.storeCode} onChange={(e) => setForm((p) => ({ ...p, storeCode: e.target.value }))} />
          <TinyInput placeholder="Store Name" value={form.storeName} onChange={(e) => setForm((p) => ({ ...p, storeName: e.target.value }))} />
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={form.storeType} onChange={(e) => setForm((p) => ({ ...p, storeType: e.target.value }))}>
            {STORE_TYPES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="h-9 border border-gray-300 rounded px-2 text-sm" value={form.linkedSiteId} onChange={(e) => setForm((p) => ({ ...p, linkedSiteId: e.target.value }))}>
            <option value="">Linked Site (Optional)</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
          </select>
          <TinyInput placeholder="Location" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
          <TinyInput placeholder="Incharge" value={form.incharge} onChange={(e) => setForm((p) => ({ ...p, incharge: e.target.value }))} />
          <button onClick={submit} className="h-9 rounded bg-[#1F3A8A] text-white text-sm">Add Store</button>
        </div>
      </SectionCard>

      <SectionCard title="Store Master Table">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {["Code", "Name", "Type", "Linked Site", "Location", "Incharge", "Status"].map((h) => (
                  <th key={h} className="text-left p-2 border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stores.map((st) => (
                <tr key={st.id} className="border-b">
                  <td className="p-2">{st.storeCode}</td>
                  <td className="p-2">{st.storeName}</td>
                  <td className="p-2">{st.storeType}</td>
                  <td className="p-2">{sites.find((s) => s.id === st.linkedSiteId)?.siteName || "-"}</td>
                  <td className="p-2">{st.location}</td>
                  <td className="p-2">{st.incharge}</td>
                  <td className="p-2">{st.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}


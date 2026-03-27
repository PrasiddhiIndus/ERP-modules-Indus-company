import React, { useMemo, useState } from "react";
import { SectionCard } from "../components/StoreUi";

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","));
  });
  return lines.join("\n");
}

export default function ReportsPage({ data }) {
  const { ledger, stores, items } = data;
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(
    () => ledger.filter((l) => !typeFilter || l.type === typeFilter),
    [ledger, typeFilter]
  );

  const exportCsv = () => {
    const rows = filtered.map((l) => ({ date: l.createdAt, type: l.type, reference: l.sourceRef || l.reason || "-", rows: l.rows?.length || 0 }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "store_inventory_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Reports Console"
        right={
          <div className="flex gap-2">
            <select className="h-8 border border-gray-300 rounded px-2 text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              {["INWARD", "OUTWARD", "RETURN", "TRANSFER"].map((t) => <option key={t}>{t}</option>)}
            </select>
            <button onClick={exportCsv} className="h-8 px-3 rounded bg-[#1F3A8A] text-white text-xs">Export CSV</button>
          </div>
        }
      >
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-2 mb-4">
          {[
            "Item-wise stock report",
            "Store-wise stock report",
            "Site-wise stock report",
            "Inward register",
            "Outward register",
            "Return register",
            "Transfer register",
            "Yearly PPE issue report",
            "Entitlement vs issue",
            "Shortage/excess report",
            "Reconciliation variance",
            "Consumption report",
          ].map((r) => (
            <button key={r} className="text-left border border-gray-200 rounded px-2 py-2 text-xs bg-gray-50 hover:bg-gray-100">{r}</button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {["Date", "Type", "Rows", "Reference"].map((h) => (
                  <th key={h} className="text-left p-2 border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b">
                  <td className="p-2">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="p-2">{l.type}</td>
                  <td className="p-2">{l.rows?.length || 0}</td>
                  <td className="p-2">{l.sourceRef || l.reason || l.status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Integration-ready: swap in backend report endpoints for Excel export and filtered server-side pagination.
        </p>
      </SectionCard>
    </div>
  );
}


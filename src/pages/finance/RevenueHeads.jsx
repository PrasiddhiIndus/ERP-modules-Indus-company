import React, { useState } from "react";
import { ListTable } from "../../components/ListTable";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, PrimaryButton, SectionCard, Modal, TinyInput, TinySelect, LoadingState, ErrorState } from "./components/FinanceUi";
import { upsertRevenueHead, deleteRevenueHead } from "../../services/financeApi";

const EMPTY = { label: "", sign: 1, sort_order: 0 };

export default function RevenueHeads() {
  const { data, loading, error, refresh, permissions } = useFinance();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.label?.trim()) return;
    setSaving(true);
    try {
      await upsertRevenueHead(form);
      setOpen(false);
      setForm(EMPTY);
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const rows = data?.revenueHeads || [];

  return (
    <div>
      <PageHeader
        title="Revenue Heads"
        subtitle="Configure revenue line items used in P&L statements"
        onRefresh={refresh}
        primaryAction={
          permissions.canEditMasters ? (
            <PrimaryButton onClick={() => { setForm(EMPTY); setOpen(true); }}>Add Head</PrimaryButton>
          ) : null
        }
      />
      <SectionCard title="Revenue Heads">
        <ListTable
          emptyMessage="No revenue heads configured. Add heads before entering revenue figures."
          columns={[
            { key: "label", label: "Label", render: (r) => <span className="font-medium">{r.label}</span> },
            { key: "code", label: "Code" },
            { key: "sign", label: "Sign", render: (r) => (r.sign === -1 ? "Deduction (−)" : "Revenue (+)") },
            { key: "sort_order", label: "Order" },
            {
              key: "actions",
              label: "",
              render: (r) =>
                permissions.canEditMasters ? (
                  <span className="flex gap-1 justify-end">
                    <button type="button" className="text-xs text-blue-700" onClick={() => { setForm(r); setOpen(true); }}>Edit</button>
                    <button type="button" className="text-xs text-red-700" onClick={async () => {
                      if (!confirm(`Delete "${r.label}"?`)) return;
                      await deleteRevenueHead(r.id);
                      refresh();
                    }}>Delete</button>
                  </span>
                ) : null,
            },
          ]}
          rows={rows}
        />
      </SectionCard>

      {open && (
        <Modal open={open} title={form.id ? "Edit Revenue Head" : "Add Revenue Head"} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <label className="block text-xs text-gray-600">
              Label *
              <TinyInput className="w-full mt-1" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600">
              Type
              <TinySelect className="w-full mt-1" value={form.sign} onChange={(e) => setForm({ ...form, sign: Number(e.target.value) })}>
                <option value={1}>Revenue (+)</option>
                <option value={-1}>Deduction (−)</option>
              </TinySelect>
            </label>
            <label className="block text-xs text-gray-600">
              Sort order
              <TinyInput type="number" className="w-full mt-1" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="h-8 px-3 text-xs border rounded" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="h-8 px-3 text-xs bg-[#1F6F4E] text-white rounded" disabled={saving} onClick={save}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

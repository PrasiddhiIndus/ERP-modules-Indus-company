import React, { useState } from "react";
import { ListTable } from "../../components/ListTable";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, PrimaryButton, SectionCard, Modal, TinyInput, TinySelect, LoadingState, ErrorState } from "./components/FinanceUi";
import {
  upsertExpenseParentHead,
  deleteExpenseParentHead,
  upsertExpenseChildHead,
  deleteExpenseChildHead,
} from "../../services/financeApi";

const PARENT_PALETTE = ["#1F6F4E", "#2F7D9E", "#C97A12", "#3E6B89", "#8E6FB0", "#9A4A3A"];

export default function ExpenseHeads() {
  const { data, loading, error, refresh, permissions } = useFinance();
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);
  const [parentForm, setParentForm] = useState({ label: "", color: PARENT_PALETTE[0] });
  const [childForm, setChildForm] = useState({ label: "", parent_head_id: "" });
  const [saving, setSaving] = useState(false);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const parents = data?.expenseParentHeads || [];
  const children = data?.expenseChildHeads || [];
  const parentMap = Object.fromEntries(parents.map((p) => [p.id, p]));

  const saveParent = async () => {
    if (!parentForm.label?.trim()) return;
    setSaving(true);
    try {
      await upsertExpenseParentHead(parentForm);
      setParentOpen(false);
      setParentForm({ label: "", color: PARENT_PALETTE[0] });
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveChild = async () => {
    if (!childForm.label?.trim() || !childForm.parent_head_id) return;
    setSaving(true);
    try {
      await upsertExpenseChildHead(childForm);
      setChildOpen(false);
      setChildForm({ label: "", parent_head_id: parents[0]?.id || "" });
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Expense Heads"
        subtitle="Two-level hierarchy: parent heads (reportable) and child heads (atomic cost lines)"
        onRefresh={refresh}
        primaryAction={
          permissions.canEditMasters ? (
            <div className="flex gap-2">
              <PrimaryButton onClick={() => { setParentForm({ label: "", color: PARENT_PALETTE[0] }); setParentOpen(true); }}>
                Add Parent
              </PrimaryButton>
              <PrimaryButton onClick={() => { setChildForm({ label: "", parent_head_id: parents[0]?.id || "" }); setChildOpen(true); }}>
                Add Child
              </PrimaryButton>
            </div>
          ) : null
        }
      />

      <SectionCard title="Parent Heads">
        <ListTable
          emptyMessage="No expense parent heads. Add parent categories first."
          columns={[
            {
              key: "label",
              label: "Parent Head",
              render: (r) => (
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="w-3 h-3 rounded" style={{ background: r.color }} />
                  {r.label}
                </span>
              ),
            },
            { key: "code", label: "Code" },
            {
              key: "actions",
              label: "",
              render: (r) =>
                permissions.canEditMasters ? (
                  <span className="flex gap-1 justify-end">
                    <button type="button" className="text-xs text-blue-700" onClick={() => { setParentForm(r); setParentOpen(true); }}>Edit</button>
                    <button type="button" className="text-xs text-red-700" onClick={async () => {
                      if (!confirm(`Delete parent "${r.label}"?`)) return;
                      await deleteExpenseParentHead(r.id);
                      refresh();
                    }}>Delete</button>
                  </span>
                ) : null,
            },
          ]}
          rows={parents}
        />
      </SectionCard>

      <SectionCard title="Child Heads (Cost Lines)">
        <ListTable
          emptyMessage="No child expense heads. Add atomic cost lines under parent heads."
          columns={[
            { key: "label", label: "Cost Line", render: (r) => <span className="font-medium">{r.label}</span> },
            { key: "code", label: "Code" },
            { key: "parent", label: "Parent", render: (r) => parentMap[r.parent_head_id]?.label || "—" },
            {
              key: "actions",
              label: "",
              render: (r) =>
                permissions.canEditMasters ? (
                  <span className="flex gap-1 justify-end">
                    <button type="button" className="text-xs text-blue-700" onClick={() => { setChildForm(r); setChildOpen(true); }}>Edit</button>
                    <button type="button" className="text-xs text-red-700" onClick={async () => {
                      if (!confirm(`Delete "${r.label}"?`)) return;
                      await deleteExpenseChildHead(r.id);
                      refresh();
                    }}>Delete</button>
                  </span>
                ) : null,
            },
          ]}
          rows={children}
        />
      </SectionCard>

      {parentOpen && (
        <Modal open={parentOpen} title={parentForm.id ? "Edit Parent Head" : "Add Parent Head"} onClose={() => setParentOpen(false)}>
          <div className="space-y-3">
            <label className="block text-xs text-gray-600">
              Label *
              <TinyInput className="w-full mt-1" value={parentForm.label} onChange={(e) => setParentForm({ ...parentForm, label: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600">
              Chart colour
              <div className="flex gap-2 mt-1 flex-wrap">
                {PARENT_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-6 h-6 rounded border-2 ${parentForm.color === c ? "border-gray-900" : "border-transparent"}`}
                    style={{ background: c }}
                    onClick={() => setParentForm({ ...parentForm, color: c })}
                  />
                ))}
              </div>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="h-8 px-3 text-xs border rounded" onClick={() => setParentOpen(false)}>Cancel</button>
              <button type="button" className="h-8 px-3 text-xs bg-[#1F6F4E] text-white rounded" disabled={saving} onClick={saveParent}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {childOpen && (
        <Modal open={childOpen} title={childForm.id ? "Edit Child Head" : "Add Child Head"} onClose={() => setChildOpen(false)}>
          <div className="space-y-3">
            <label className="block text-xs text-gray-600">
              Label *
              <TinyInput className="w-full mt-1" value={childForm.label} onChange={(e) => setChildForm({ ...childForm, label: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600">
              Parent head *
              <TinySelect className="w-full mt-1" value={childForm.parent_head_id} onChange={(e) => setChildForm({ ...childForm, parent_head_id: e.target.value })}>
                <option value="">Select parent…</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </TinySelect>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="h-8 px-3 text-xs border rounded" onClick={() => setChildOpen(false)}>Cancel</button>
              <button type="button" className="h-8 px-3 text-xs bg-[#1F6F4E] text-white rounded" disabled={saving} onClick={saveChild}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

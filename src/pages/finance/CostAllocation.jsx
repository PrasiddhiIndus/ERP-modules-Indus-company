import React, { useState } from "react";
import { ListTable } from "../../components/ListTable";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, PrimaryButton, SectionCard, Modal, TinyInput, TinySelect, LoadingState, ErrorState } from "./components/FinanceUi";
import { upsertCostAllocation, deleteCostAllocation } from "../../services/financeApi";
import { inr } from "./lib/formatters";
import { monthLabelOf, currentPeriodKey } from "./lib/periods";

const EMPTY = {
  site_id: "",
  child_head_id: "",
  total_amount: "",
  start_period: currentPeriodKey(),
  months: 12,
  spread_mode: "fixed",
  note: "",
};

export default function CostAllocation() {
  const { data, loading, error, refresh, permissions, months } = useFinance();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const sites = data?.sites || [];
  const childMap = Object.fromEntries((data?.expenseChildHeads || []).map((c) => [c.id, c]));
  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s]));

  const rows = (data?.costAllocations || []).map((sp) => ({
    ...sp,
    siteName: siteMap[sp.site_id]?.name || "—",
    headLabel: childMap[sp.child_head_id]?.label || "—",
    perMonth: sp.months ? Number(sp.total_amount) / Number(sp.months) : 0,
  }));

  const save = async () => {
    if (!form.site_id || !form.child_head_id || !Number(form.total_amount)) return;
    setSaving(true);
    try {
      await upsertCostAllocation({
        ...form,
        total_amount: Number(form.total_amount),
        months: Number(form.months),
      });
      setOpen(false);
      setForm(EMPTY);
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
        title="Cost Allocation / Amortization"
        subtitle="Spread deferred costs evenly across contract months"
        onRefresh={refresh}
        primaryAction={
          permissions.isAdmin ? (
            <PrimaryButton onClick={() => {
              setForm({ ...EMPTY, site_id: sites[0]?.id || "", child_head_id: data?.expenseChildHeads?.[0]?.id || "" });
              setOpen(true);
            }}>
              Add Spread
            </PrimaryButton>
          ) : null
        }
      />
      <SectionCard title="Active Spreads">
        <ListTable
          emptyMessage="No cost allocations. Add spreads for equipment, mobilization, or deferred costs."
          columns={[
            { key: "siteName", label: "Site", render: (r) => <span className="font-medium">{r.siteName}</span> },
            { key: "headLabel", label: "Cost Line" },
            { key: "note", label: "Note", render: (r) => r.note || "—" },
            { key: "total_amount", label: "Total", className: "text-right", render: (r) => inr(r.total_amount) },
            { key: "start_period", label: "From", render: (r) => monthLabelOf(r.start_period, months) },
            { key: "months", label: "Months", className: "text-right" },
            { key: "perMonth", label: "Per Month", className: "text-right", render: (r) => inr(r.perMonth) },
            {
              key: "actions",
              label: "",
              render: (r) =>
                permissions.isAdmin ? (
                  <button type="button" className="text-xs text-red-700" onClick={async () => {
                    if (!confirm("Delete this spread?")) return;
                    await deleteCostAllocation(r.id);
                    refresh();
                  }}>Delete</button>
                ) : null,
            },
          ]}
          rows={rows}
        />
      </SectionCard>

      {open && (
        <Modal open={open} title="Add Cost Spread" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <label className="block text-xs text-gray-600">
              Site *
              <TinySelect className="w-full mt-1" value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </TinySelect>
            </label>
            <label className="block text-xs text-gray-600">
              Cost line *
              <TinySelect className="w-full mt-1" value={form.child_head_id} onChange={(e) => setForm({ ...form, child_head_id: e.target.value })}>
                {(data?.expenseChildHeads || []).map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
              </TinySelect>
            </label>
            <label className="block text-xs text-gray-600">
              Total cost (₹) *
              <TinyInput type="number" className="w-full mt-1" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600">
              Starts from
              <TinySelect className="w-full mt-1" value={form.start_period} onChange={(e) => setForm({ ...form, start_period: e.target.value })}>
                {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </TinySelect>
            </label>
            <label className="block text-xs text-gray-600">
              Spread mode
              <TinySelect className="w-full mt-1" value={form.spread_mode} onChange={(e) => setForm({ ...form, spread_mode: e.target.value })}>
                <option value="fixed">Fixed months</option>
                <option value="remaining">Remaining contract</option>
              </TinySelect>
            </label>
            <label className="block text-xs text-gray-600">
              Months
              <TinyInput type="number" className="w-full mt-1" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600">
              Note
              <TinyInput className="w-full mt-1" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
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

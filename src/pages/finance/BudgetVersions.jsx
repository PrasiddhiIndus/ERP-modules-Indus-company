import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListTable } from "../../components/ListTable";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, PrimaryButton, SectionCard, Modal, TinyInput, TinySelect, LoadingState, ErrorState } from "./components/FinanceUi";
import { upsertBudgetVersion, deleteBudgetVersion } from "../../services/financeApi";
import { inr, pct } from "./lib/formatters";
import { estTotals } from "./lib/calculations";
import { buildMonthOptions } from "./lib/periods";

export default function BudgetVersions() {
  const { data, loading, error, refresh, permissions } = useFinance();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ site_id: "", effective_from: "", note: "", revenueLines: {}, expenseLines: {} });
  const [saving, setSaving] = useState(false);
  const months = buildMonthOptions();

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const sites = data?.sites || [];
  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s]));
  const rows = (data?.budgetVersions || []).map((bv) => {
    const site = siteMap[bv.site_id];
    const rev = {};
    (data.budgetRevenueLines || []).filter((l) => l.budget_version_id === bv.id).forEach((l) => { rev[l.revenue_head_id] = Number(l.amount); });
    const exp = {};
    (data.budgetExpenseLines || []).filter((l) => l.budget_version_id === bv.id).forEach((l) => { exp[l.child_head_id] = Number(l.amount); });
    const t = estTotals({ revenue: rev, expenses: exp }, data.revenueHeads);
    return { ...bv, siteName: site?.name || "—", totals: t };
  });

  const openNew = (siteId) => {
    setForm({
      site_id: siteId || searchParams.get("siteId") || sites[0]?.id || "",
      effective_from: months[months.length - 1]?.key || "",
      note: "",
      revenueLines: {},
      expenseLines: {},
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.site_id || !form.effective_from) return;
    setSaving(true);
    try {
      await upsertBudgetVersion(form);
      setOpen(false);
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Budget / Estimate Versions"
        subtitle="Contract-period budgets with effective-from versioning for variance analysis"
        onRefresh={refresh}
        primaryAction={
          permissions.canEditMasters || permissions.isAdmin ? (
            <PrimaryButton onClick={() => openNew()}>Add Budget Version</PrimaryButton>
          ) : null
        }
      />
      <SectionCard title="Budget Versions">
        <ListTable
          emptyMessage="No budget versions. Create estimates per site for budget vs actual comparison."
          columns={[
            { key: "siteName", label: "Site", render: (r) => <span className="font-medium">{r.siteName}</span> },
            { key: "effective_from", label: "Effective From" },
            { key: "note", label: "Note", render: (r) => r.note || "—" },
            { key: "status", label: "Status" },
            { key: "revenue", label: "Est. Revenue", className: "text-right", render: (r) => inr(r.totals?.revenue) },
            { key: "expense", label: "Est. Expense", className: "text-right", render: (r) => inr(r.totals?.expense) },
            { key: "profit", label: "Est. Profit", className: "text-right", render: (r) => inr(r.totals?.profit) },
            { key: "margin", label: "Margin", className: "text-right", render: (r) => pct(r.totals?.margin) },
            {
              key: "actions",
              label: "",
              render: (r) =>
                permissions.canEditMasters ? (
                  <button type="button" className="text-xs text-red-700" onClick={async () => {
                    if (!confirm("Delete this budget version?")) return;
                    await deleteBudgetVersion(r.id);
                    refresh();
                  }}>Delete</button>
                ) : null,
            },
          ]}
          rows={rows}
        />
      </SectionCard>

      {open && (
        <Modal open={open} title="New Budget Version" onClose={() => setOpen(false)} widthClass="max-w-2xl">
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <label className="block text-xs text-gray-600">
              Site *
              <TinySelect className="w-full mt-1" value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
                <option value="">Select site…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </TinySelect>
            </label>
            <label className="block text-xs text-gray-600">
              Effective from *
              <TinySelect className="w-full mt-1" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })}>
                {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </TinySelect>
            </label>
            <label className="block text-xs text-gray-600">
              Note
              <TinyInput className="w-full mt-1" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Renewal FY26…" />
            </label>
            <div className="text-xs font-semibold text-green-800 pt-2">Estimated Revenue</div>
            <div className="grid grid-cols-2 gap-2">
              {(data?.revenueHeads || []).map((h) => (
                <label key={h.id} className="text-xs text-gray-600">
                  {h.label}
                  <TinyInput
                    type="number"
                    className="w-full mt-1"
                    value={form.revenueLines[h.id] ?? ""}
                    onChange={(e) => setForm({ ...form, revenueLines: { ...form.revenueLines, [h.id]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
            <div className="text-xs font-semibold text-red-800 pt-2">Estimated Expenses</div>
            <div className="grid grid-cols-2 gap-2">
              {(data?.expenseChildHeads || []).map((h) => (
                <label key={h.id} className="text-xs text-gray-600">
                  {h.label}
                  <TinyInput
                    type="number"
                    className="w-full mt-1"
                    value={form.expenseLines[h.id] ?? ""}
                    onChange={(e) => setForm({ ...form, expenseLines: { ...form.expenseLines, [h.id]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
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

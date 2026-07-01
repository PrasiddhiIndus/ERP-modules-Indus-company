import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, SectionCard, TinyInput, TinySelect, PeriodMonthSelect, LoadingState, ErrorState } from "./components/FinanceUi";
import { savePeriodEntry } from "../../services/financeApi";
import { inr } from "./lib/formatters";
import { currentPeriodKey } from "./lib/periods";
import { displayStructure } from "./lib/calculations";

export default function ExpenseEntries() {
  const { data, loading, error, refresh, permissions } = useFinance();
  const [searchParams, setSearchParams] = useSearchParams();
  const [siteId, setSiteId] = useState(searchParams.get("siteId") || "");
  const [periodKey, setPeriodKey] = useState(searchParams.get("period") || currentPeriodKey());
  const [expenseLines, setExpenseLines] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data || !siteId) return;
    const rec = data.records[`${siteId}__${periodKey}`] || {};
    const lines = {};
    (data.expenseChildHeads || []).forEach((h) => {
      if (rec[h.id] != null) lines[h.id] = rec[h.id];
    });
    setExpenseLines(lines);
  }, [data, siteId, periodKey]);

  useEffect(() => {
    if (!siteId && data?.sites?.length) setSiteId(data.sites[0].id);
  }, [data, siteId]);

  const save = async () => {
    if (!siteId || !permissions.canEditSite(siteId)) return;
    setSaving(true);
    try {
      const existing = data.records[`${siteId}__${periodKey}`] || {};
      const revenueLines = {};
      (data.revenueHeads || []).forEach((h) => {
        if (existing[h.id] != null) revenueLines[h.id] = existing[h.id];
      });
      await savePeriodEntry(siteId, periodKey, { revenueLines, expenseLines });
      setSearchParams({ siteId, period: periodKey });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const sites = data?.sites || [];
  const site = sites.find((s) => s.id === siteId);
  const parentHeads = data?.expenseParentHeads || [];
  const childMap = Object.fromEntries((data?.expenseChildHeads || []).map((c) => [c.id, c]));
  const structure = site ? displayStructure(site, parentHeads) : [];
  const total = Object.values(expenseLines).reduce((a, v) => a + (Number(v) || 0), 0);

  return (
    <div>
      <PageHeader title="Expense Entries" subtitle="Enter monthly expense figures by child cost line" onRefresh={refresh} />
      <SectionCard title="Expense Entry Form">
        {!sites.length ? (
          <p className="text-sm text-gray-500 py-6 text-center">Add sites and expense heads first.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <label className="text-xs text-gray-600">
                Site
                <TinySelect className="mt-1 block min-w-[200px]" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </TinySelect>
              </label>
              <label className="text-xs text-gray-600">
                Period
                <PeriodMonthSelect
                  className="mt-1 gap-1"
                  selectClassName="min-w-[72px] h-8 px-2 text-xs border border-gray-300 rounded-lg bg-white"
                  value={periodKey}
                  onChange={setPeriodKey}
                />
              </label>
              <div className="ml-auto text-sm font-mono self-end pb-1">
                Total expenses: <strong>{inr(total)}</strong>
              </div>
            </div>
            {structure.filter((g) => g.children.length).map((g) => (
              <div key={g.parentId} className="mb-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2" style={{ color: g.color }}>
                  <span className="w-2 h-2 rounded" style={{ background: g.color }} />
                  {g.label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {g.children.map((childId) => (
                    <label key={childId} className="text-xs text-gray-600">
                      {childMap[childId]?.label || childId}
                      <TinyInput
                        type="number"
                        className="w-full mt-1 text-right font-mono"
                        value={expenseLines[childId] ?? ""}
                        disabled={!permissions.canEditSite(siteId)}
                        onChange={(e) => setExpenseLines({ ...expenseLines, [childId]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!structure.some((g) => g.children.length) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(data?.expenseChildHeads || []).map((h) => (
                  <label key={h.id} className="text-xs text-gray-600">
                    {h.label}
                    <TinyInput
                      type="number"
                      className="w-full mt-1 text-right font-mono"
                      value={expenseLines[h.id] ?? ""}
                      disabled={!permissions.canEditSite(siteId)}
                      onChange={(e) => setExpenseLines({ ...expenseLines, [h.id]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
            )}
            {permissions.canEditSite(siteId) && (
              <div className="flex justify-end gap-2 mt-4">
                {saved && <span className="text-xs text-green-700 self-center">Saved</span>}
                <button type="button" className="h-8 px-4 text-xs bg-[#1F6F4E] text-white rounded" disabled={saving} onClick={save}>
                  {saving ? "Saving…" : "Save Expenses"}
                </button>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}

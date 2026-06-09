import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, SectionCard, TinyInput, TinySelect, LoadingState, ErrorState } from "./components/FinanceUi";
import { savePeriodEntry } from "../../services/financeApi";
import { inr } from "./lib/formatters";
import { currentPeriodKey } from "./lib/periods";

export default function RevenueEntries() {
  const { data, loading, error, refresh, permissions, months } = useFinance();
  const [searchParams, setSearchParams] = useSearchParams();
  const [siteId, setSiteId] = useState(searchParams.get("siteId") || "");
  const [periodKey, setPeriodKey] = useState(searchParams.get("period") || currentPeriodKey());
  const [revenueLines, setRevenueLines] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data || !siteId) return;
    const rec = data.records[`${siteId}__${periodKey}`] || {};
    const lines = {};
    (data.revenueHeads || []).forEach((h) => {
      if (rec[h.id] != null) lines[h.id] = rec[h.id];
    });
    setRevenueLines(lines);
  }, [data, siteId, periodKey]);

  useEffect(() => {
    if (!siteId && data?.sites?.length) setSiteId(data.sites[0].id);
  }, [data, siteId]);

  const save = async () => {
    if (!siteId || !permissions.canEditSite(siteId)) return;
    setSaving(true);
    try {
      const existing = data.records[`${siteId}__${periodKey}`] || {};
      const expenseLines = {};
      (data.expenseChildHeads || []).forEach((h) => {
        if (existing[h.id] != null) expenseLines[h.id] = existing[h.id];
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
  const total = (data?.revenueHeads || []).reduce(
    (s, h) => s + (h.sign || 1) * (Number(revenueLines[h.id]) || 0),
    0,
  );

  return (
    <div>
      <PageHeader title="Revenue Entries" subtitle="Enter monthly revenue figures by site and period" onRefresh={refresh} />
      <SectionCard title="Revenue Entry Form">
        {!sites.length ? (
          <p className="text-sm text-gray-500 py-6 text-center">Add sites first before entering revenue.</p>
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
                <TinySelect className="mt-1 block min-w-[120px]" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
                  {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </TinySelect>
              </label>
              <div className="ml-auto text-sm font-mono self-end pb-1">
                Total revenue: <strong>{inr(total)}</strong>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(data?.revenueHeads || []).map((h) => (
                <label key={h.id} className="text-xs text-gray-600">
                  {h.label}
                  <TinyInput
                    type="number"
                    className="w-full mt-1 text-right font-mono"
                    value={revenueLines[h.id] ?? ""}
                    disabled={!permissions.canEditSite(siteId)}
                    onChange={(e) => setRevenueLines({ ...revenueLines, [h.id]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            {permissions.canEditSite(siteId) && (
              <div className="flex justify-end gap-2 mt-4">
                {saved && <span className="text-xs text-green-700 self-center">Saved</span>}
                <button type="button" className="h-8 px-4 text-xs bg-[#1F6F4E] text-white rounded" disabled={saving} onClick={save}>
                  {saving ? "Saving…" : "Save Revenue"}
                </button>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}

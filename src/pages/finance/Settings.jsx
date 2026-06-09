import React, { useEffect, useState } from "react";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, SectionCard, TinyInput, LoadingState, ErrorState } from "./components/FinanceUi";
import { updateSettings } from "../../services/financeApi";

export default function Settings() {
  const { data, loading, error, refresh, permissions, targetMargin, warnMargin } = useFinance();
  const [target, setTarget] = useState(String(targetMargin));
  const [warn, setWarn] = useState(String(warnMargin));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTarget(String(targetMargin));
    setWarn(String(warnMargin));
  }, [targetMargin, warnMargin]);

  const save = async () => {
    if (!permissions.canEditMasters) return;
    setSaving(true);
    try {
      await updateSettings("margin_targets", {
        target_margin: Number(target) || 12,
        warn_margin: Number(warn) || 8,
      });
      await refresh();
    } catch (e) {
      alert(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div>
      <PageHeader title="Finance Settings" subtitle="Margin thresholds, alerts, and module configuration" onRefresh={refresh} />
      <SectionCard title="P&L Alert Thresholds">
        <p className="text-sm text-gray-600 mb-4">
          Sites below the warn margin appear in attention alerts. Target margin is the portfolio goal.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          <label className="text-xs text-gray-600">
            Target margin (%)
            <TinyInput
              type="number"
              className="w-full mt-1"
              value={target}
              disabled={!permissions.canEditMasters}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label className="text-xs text-gray-600">
            Warn margin (%)
            <TinyInput
              type="number"
              className="w-full mt-1"
              value={warn}
              disabled={!permissions.canEditMasters}
              onChange={(e) => setWarn(e.target.value)}
            />
          </label>
        </div>
        {permissions.canEditMasters && (
          <button
            type="button"
            className="mt-4 h-8 px-4 text-xs bg-[#1F6F4E] text-white rounded"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save thresholds"}
          </button>
        )}
      </SectionCard>

      <SectionCard title="Role Access">
        <ul className="text-sm text-gray-700 space-y-2">
          <li><strong>Finance Admin</strong> — full masters, budget approval, import/export, all sites</li>
          <li><strong>Management</strong> — portfolio view, budget vs actual, reports (via finance module access)</li>
          <li><strong>Site Managers</strong> — scoped to sites in <code className="text-xs bg-gray-100 px-1 rounded">finance.user_site_access</code></li>
        </ul>
        <p className="text-xs text-gray-500 mt-3">
          Assign finance module access in User Management. Site manager scope is configured in the database.
        </p>
      </SectionCard>

      {data?.loadErrors?.length > 0 && (
        <SectionCard title="Connection Notes">
          <p className="text-sm text-amber-800">
            Some finance tables could not be loaded. Ensure the <code>finance</code> schema is exposed in Supabase API settings and migrations are applied.
          </p>
          <ul className="text-xs text-gray-600 mt-2 list-disc pl-4">
            {data.loadErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

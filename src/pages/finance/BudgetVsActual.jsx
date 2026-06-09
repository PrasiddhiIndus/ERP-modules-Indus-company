import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useFinance } from "./contexts/FinanceContext";
import { PageHeader, SectionCard, TinySelect, LoadingState, ErrorState, StatusPill } from "./components/FinanceUi";
import { inr, pct } from "./lib/formatters";
import {
  calcSite,
  estimateFor,
  estTotals,
  expenseTree,
} from "./lib/calculations";
import { monthLabelOf } from "./lib/periods";

function VarCells({ est, actual, lowerIsBetter, hasEst }) {
  const v = actual - est;
  const fav = lowerIsBetter ? v <= 0 : v >= 0;
  const vp = est !== 0 ? (v / Math.abs(est)) * 100 : null;
  return (
    <>
      <td className="text-right font-mono text-gray-400">{hasEst ? inr(est) : "—"}</td>
      <td className="text-right font-mono">{inr(actual)}</td>
      <td className="text-right font-mono" style={{ color: hasEst ? (fav ? "#16774E" : "#B23F2A") : "#8A938C" }}>
        {hasEst ? `${v >= 0 ? "+" : ""}${inr(v)}` : "—"}
      </td>
      <td className="text-right font-mono text-gray-400">
        {vp == null ? "—" : `${vp >= 0 ? "+" : ""}${vp.toFixed(0)}%`}
      </td>
    </>
  );
}

export default function BudgetVsActual() {
  const { data, loading, error, refresh, permissions, months, periodKey, setFilters, warnMargin, targetMargin } = useFinance();
  const [searchParams, setSearchParams] = useSearchParams();
  const siteId = searchParams.get("siteId") || data?.sites?.[0]?.id || "";

  const analysis = useMemo(() => {
    if (!data || !siteId) return null;
    const site = data.sites.find((s) => s.id === siteId);
    if (!site) return null;
    const c = calcSite(site, periodKey, data.records, data.revenueHeads, data.spreads, months);
    const estVer = estimateFor(site, periodKey, months);
    const est = estTotals(estVer, data.revenueHeads);
    const tree = expenseTree(site, periodKey, data.records, estVer, data.expenseParentHeads, data.expenseChildHeads, data.spreads, months);
    const revBreak = (data.revenueHeads || []).map((it) => ({
      ...it,
      raw: Number(data.records[`${siteId}__${periodKey}`]?.[it.id]) || 0,
      est: Number(estVer?.revenue?.[it.id]) || 0,
    }));
    return { site, c, est, estVer, tree, revBreak };
  }, [data, siteId, periodKey, months]);

  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;

  const mLabel = monthLabelOf(periodKey, months);

  return (
    <div>
      <PageHeader title="Budget vs Actual" subtitle="Variance analysis — actual figures compared to in-force estimate" onRefresh={refresh} />
      <SectionCard title="Filters">
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-gray-600">
            Site
            <TinySelect
              className="mt-1 block min-w-[220px]"
              value={siteId}
              onChange={(e) => setSearchParams({ siteId: e.target.value, period: periodKey })}
            >
              {(data?.sites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </TinySelect>
          </label>
          <label className="text-xs text-gray-600">
            Period
            <TinySelect className="mt-1 block min-w-[120px]" value={periodKey} onChange={(e) => setFilters({ period: e.target.value })}>
              {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </TinySelect>
          </label>
        </div>
      </SectionCard>

      {!analysis ? (
        <p className="text-sm text-gray-500 py-8 text-center">Select a site to view variance.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Revenue", value: analysis.c.revenue, est: analysis.est?.revenue },
              { label: "Expense", value: analysis.c.expense, est: analysis.est?.expense },
              { label: "Profit", value: analysis.c.profit, est: analysis.est?.profit },
              { label: "Margin", value: pct(analysis.c.margin), est: analysis.est ? pct(analysis.est.margin) : "—" },
            ].map((k) => (
              <div key={k.label} className="bg-white border rounded-lg p-3">
                <div className="text-xs text-gray-500">{k.label}</div>
                <div className="text-lg font-bold">{typeof k.value === "number" ? inr(k.value) : k.value}</div>
                {k.est != null && <div className="text-xs text-gray-400">Est: {typeof k.est === "number" ? inr(k.est) : k.est}</div>}
              </div>
            ))}
          </div>

          <SectionCard
            title={`${analysis.site.name} · ${mLabel}`}
            right={
              <StatusPill margin={analysis.c.margin} profit={analysis.c.profit} warnMargin={warnMargin} targetMargin={targetMargin} />
            }
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-500 border-b">
                    <th className="text-left py-2 px-2">Particulars</th>
                    <th className="text-right py-2 px-2">Estimate</th>
                    <th className="text-right py-2 px-2">Actual</th>
                    <th className="text-right py-2 px-2">Variance</th>
                    <th className="text-right py-2 px-2">Var %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-gray-50 text-xs uppercase text-gray-500"><td colSpan={5} className="py-2 px-2">Revenue</td></tr>
                  {analysis.revBreak.map((it) => (
                    <tr key={it.id} className="border-b">
                      <td className="py-2 px-2">{it.label}</td>
                      <VarCells est={(it.sign || 1) * it.est} actual={(it.sign || 1) * it.raw} lowerIsBetter={false} hasEst={!!it.est} />
                    </tr>
                  ))}
                  <tr className="font-semibold bg-green-50">
                    <td className="py-2 px-2">Total Revenue</td>
                    <VarCells est={analysis.est?.revenue || 0} actual={analysis.c.revenue} lowerIsBetter={false} hasEst={!!analysis.est} />
                  </tr>
                  <tr className="bg-gray-50 text-xs uppercase text-gray-500"><td colSpan={5} className="py-2 px-2">Expenses</td></tr>
                  {analysis.tree.filter((g) => g.actual || g.est).map((g) => (
                    <tr key={g.parentId} className="border-b font-medium">
                      <td className="py-2 px-2">
                        <span className="inline-block w-2 h-2 rounded mr-2" style={{ background: g.color }} />
                        {g.label}
                      </td>
                      <VarCells est={g.est} actual={g.actual} lowerIsBetter hasEst={g.est > 0} />
                    </tr>
                  ))}
                  <tr className="font-semibold bg-green-50">
                    <td className="py-2 px-2">Sub-total Expenses</td>
                    <VarCells est={analysis.est?.expense || 0} actual={analysis.c.expense} lowerIsBetter hasEst={!!analysis.est} />
                  </tr>
                  <tr className={`font-bold ${analysis.c.profit >= 0 ? "text-green-800 bg-green-50" : "text-red-800 bg-red-50"}`}>
                    <td className="py-2 px-2">Profit</td>
                    <VarCells est={analysis.est?.profit || 0} actual={analysis.c.profit} lowerIsBetter={false} hasEst={!!analysis.est} />
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

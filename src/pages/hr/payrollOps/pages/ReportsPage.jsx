import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DenseTable, SectionCard } from "../../../adminOperations/components/AdminUi";
import { CHART_SERIES, TOKENS } from "../../../../theme/tokens";
import { compactInrTick } from "../../../../components/charts/DashboardCharts";
import { SALARY_HISTORY, inr, shortSiteName } from "../payrollOpsData";
import { usePayrollOps } from "../payrollOpsScope";

const TIP = {
  background: TOKENS.surface,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 8,
  fontSize: 12,
};

export default function PayrollOpsReportsPage() {
  const { sites, employeesBySite } = usePayrollOps();

  const siteTotals = useMemo(
    () =>
      sites
        .map((s) => ({
          name: shortSiteName(s),
          total: (SALARY_HISTORY[s.id] || []).reduce((a, r) => a + r.amount, 0),
        }))
        .sort((a, b) => b.total - a.total),
    [sites]
  );

  const designationBySite = useMemo(() => {
    const rows = [];
    sites.forEach((s) => {
      const emps = employeesBySite[s.id] || [];
      const byDesig = {};
      emps.forEach((e) => {
        byDesig[e.desig] = byDesig[e.desig] || { sum: 0, count: 0 };
        byDesig[e.desig].sum += e.gross;
        byDesig[e.desig].count += 1;
      });
      Object.entries(byDesig).forEach(([desig, v]) =>
        rows.push({ site: shortSiteName(s), desig, avg: v.sum / v.count })
      );
    });
    return rows;
  }, [sites, employeesBySite]);

  const highestPerSite = useMemo(() => {
    const bySite = {};
    designationBySite.forEach((r) => {
      if (!bySite[r.site] || r.avg > bySite[r.site].avg) bySite[r.site] = r;
    });
    return Object.values(bySite);
  }, [designationBySite]);

  const avgTotal = siteTotals.length ? siteTotals.reduce((a, s) => a + s.total, 0) / siteTotals.length : 0;
  const overBenchmark = siteTotals.filter((s) => s.total > avgTotal * 1.15);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard title="Total disbursed per site">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={siteTotals}>
              <CartesianGrid stroke={TOKENS.chartGrid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={{ stroke: TOKENS.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} tickFormatter={compactInrTick} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={TIP} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                {siteTotals.map((s) => (
                  <Cell key={s.name} fill={s.total > avgTotal * 1.15 ? TOKENS.critical : CHART_SERIES[1]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-ink-muted">Sites 15% above average spend are highlighted for review.</p>
        </SectionCard>

        <SectionCard title="Highest-paid designation by site">
          <DenseTable
            columns={[
              { key: "site", label: "Site" },
              { key: "desig", label: "Designation" },
              { key: "avg", label: "Avg. gross", render: (r) => inr(r.avg) },
            ]}
            rows={highestPerSite}
            rowKey="site"
          />
        </SectionCard>
      </div>

      <SectionCard title="Cost-reduction flags">
        {overBenchmark.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">No site is running significantly above average spend.</p>
        ) : (
          <div className="divide-y divide-divider">
            {overBenchmark.map((s) => (
              <div key={s.name} className="flex gap-3 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="text-xs font-semibold text-ink">{s.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-secondary">
                    Cumulative disbursal is {(((s.total / avgTotal) - 1) * 100).toFixed(0)}% above the cross-site average
                    ({inr(s.total)} vs avg {inr(avgTotal)}). Review headcount mix and OT hours.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

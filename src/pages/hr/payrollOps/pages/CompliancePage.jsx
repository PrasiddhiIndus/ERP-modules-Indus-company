import React, { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DenseTable, FilterBar, KpiTile, SectionCard } from "../../../adminOperations/components/AdminUi";
import { TOKENS } from "../../../../theme/tokens";
import { COMPLIANCE, EMP_COMPLIANCE_FLAGS, shortSiteName } from "../payrollOpsData";
import { usePayrollOps } from "../payrollOpsScope";
import { PayrollStatusChip } from "../PayrollOpsUi";

const TIP = {
  background: TOKENS.surface,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 8,
  fontSize: 12,
};

export default function PayrollOpsCompliancePage() {
  const { sites, employeesBySite } = usePayrollOps();
  const [siteId, setSiteId] = useState("__all__");

  const rows = useMemo(() => {
    const out = [];
    Object.entries(COMPLIANCE).forEach(([sid, items]) => {
      if (siteId !== "__all__" && sid !== siteId) return;
      const site = sites.find((s) => s.id === sid);
      items.forEach((it) => out.push({ ...it, id: `${sid}-${it.item}`, siteId: sid, siteName: site ? shortSiteName(site) : sid }));
    });
    const order = { Overdue: 0, Pending: 1, Upcoming: 2, Filed: 3 };
    return out.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(a.due) - new Date(b.due));
  }, [sites, siteId]);

  const counts = useMemo(() => {
    const c = { Overdue: 0, Pending: 0, Upcoming: 0, Filed: 0 };
    Object.entries(COMPLIANCE).forEach(([sid, items]) => {
      if (siteId !== "__all__" && sid !== siteId) return;
      items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; });
    });
    return c;
  }, [siteId]);

  const empFlags = useMemo(() => {
    const out = [];
    Object.entries(employeesBySite).forEach(([sid, emps]) => {
      if (siteId !== "__all__" && sid !== siteId) return;
      const site = sites.find((s) => s.id === sid);
      emps.forEach((e) => {
        const notes = [...(EMP_COMPLIANCE_FLAGS[e.code] || [])];
        if (e.dualDesignation) {
          notes.push(`Also recorded as ${e.dualDesignation.desig} at ${e.dualDesignation.siteName} (noted ${e.dualDesignation.notedOn})`);
        }
        if (notes.length) {
          out.push({
            code: e.code,
            name: e.name,
            site: site ? shortSiteName(site) : sid,
            desig: e.desig,
            notes,
            dual: Boolean(e.dualDesignation),
          });
        }
      });
    });
    return out;
  }, [sites, employeesBySite, siteId]);

  const complianceChart = useMemo(
    () =>
      sites.map((s) => {
        const items = COMPLIANCE[s.id] || [];
        const c = { name: shortSiteName(s), Filed: 0, Pending: 0, Upcoming: 0, Overdue: 0 };
        items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; });
        return c;
      }),
    [sites]
  );

  return (
    <div className="flex flex-col gap-4">
      <FilterBar>
        <label className="text-[11px] font-medium text-ink-muted">
          Site
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="ml-2 h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
          >
            <option value="__all__">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {shortSiteName(s)}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Overdue filings" value={String(counts.Overdue)} sub={counts.Overdue ? "Needs action" : "None overdue"} />
        <KpiTile label="Pending" value={String(counts.Pending)} sub="Due this cycle" />
        <KpiTile label="Upcoming" value={String(counts.Upcoming)} sub="Scheduled ahead" />
        <KpiTile label="Filed" value={String(counts.Filed)} sub="Completed" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard title="Filing status by site">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={complianceChart}>
              <CartesianGrid stroke={TOKENS.chartGrid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={{ stroke: TOKENS.border }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TIP} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Filed" stackId="c" fill={TOKENS.success} />
              <Bar dataKey="Upcoming" stackId="c" fill={TOKENS.info} />
              <Bar dataKey="Pending" stackId="c" fill={TOKENS.warning} />
              <Bar dataKey="Overdue" stackId="c" fill={TOKENS.critical} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Employee flags" right={<span className="type-meta text-ink-muted">Does not block processing</span>}>
          {empFlags.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">No employee-level flags for this selection.</p>
          ) : (
            <div className="max-h-56 divide-y divide-divider overflow-auto">
              {empFlags.map((f) => (
                <div key={f.code} className="flex gap-2 py-2.5">
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${f.dual ? "text-warning" : "text-info"}`} />
                  <div>
                    <p className="text-xs font-semibold text-ink">
                      {f.name} <span className="font-normal text-ink-muted">· {f.site} · {f.desig}</span>
                    </p>
                    {f.notes.map((n) => (
                      <p key={n} className="text-[12px] text-ink-secondary">{n}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Filing register">
        <DenseTable
          columns={[
            { key: "siteName", label: "Site" },
            { key: "item", label: "Filing" },
            { key: "due", label: "Due date" },
            { key: "status", label: "Status", render: (r) => <PayrollStatusChip status={r.status} /> },
          ]}
          rows={rows}
          rowKey="id"
        />
      </SectionCard>
    </div>
  );
}

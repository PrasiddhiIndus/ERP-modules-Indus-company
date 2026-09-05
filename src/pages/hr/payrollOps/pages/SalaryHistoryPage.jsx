import React, { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { DenseTable, KpiTile, SectionCard } from "../../../adminOperations/components/AdminUi";
import { SALARY_HISTORY, inr, shortSiteName } from "../payrollOpsData";
import { usePayrollOps } from "../payrollOpsScope";
import { PayrollStatusChip } from "../PayrollOpsUi";

export default function PayrollOpsSalaryHistoryPage() {
  const { sites, holds, setHolds } = usePayrollOps();
  const [siteId, setSiteId] = useState(sites[0]?.id || "s1");
  const site = sites.find((s) => s.id === siteId) || sites[0];
  const rows = SALARY_HISTORY[siteId] || [];
  const totalAll = useMemo(
    () => Object.values(SALARY_HISTORY).flat().reduce((a, r) => a + r.amount, 0),
    []
  );

  const toggleHold = (idx) =>
    setHolds((cur) => ({ ...cur, [`${siteId}-${idx}`]: !cur[`${siteId}-${idx}`] }));

  const tableRows = rows.map((r, idx) => {
    const held = holds[`${siteId}-${idx}`] ?? r.status === "Held";
    return { ...r, idx, held };
  });

  const columns = [
    { key: "cycle", label: "Cycle", render: (r) => `${r.month} ${r.year}` },
    { key: "amount", label: "Amount disbursed", render: (r) => (r.held ? "—" : inr(r.amount)) },
    { key: "processedOn", label: "Processed on", render: (r) => (r.held ? "Awaiting release" : r.processedOn) },
    { key: "status", label: "Status", render: (r) => <PayrollStatusChip status={r.held ? "Held" : "Processed"} /> },
    {
      key: "act",
      label: "",
      render: (r) => (
        <button
          type="button"
          onClick={() => toggleHold(r.idx)}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${
            r.held
              ? "border-accent-border bg-accent-soft text-accent"
              : "border-critical-border bg-critical-soft text-critical"
          }`}
        >
          {r.held ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {r.held ? "Release" : "Hold"}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <KpiTile label="Total disbursed to date" value={inr(totalAll)} sub="Across every processed cycle" />
        <div className="lg:col-span-2 rounded-card border border-border bg-surface px-4 py-3">
          <p className="type-mono-caption mb-2">Site</p>
          <div className="flex flex-wrap gap-1.5">
            {sites.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSiteId(s.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  siteId === s.id
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface text-ink hover:bg-surface-sunken"
                }`}
              >
                {shortSiteName(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SectionCard
        title={site?.name}
        right={
          <div className="text-right">
            <p className="type-mono-caption">This site</p>
            <p className="type-figure text-ink">{inr(rows.reduce((a, r) => a + r.amount, 0))}</p>
          </div>
        }
      >
        <DenseTable columns={columns} rows={tableRows} rowKey="idx" />
      </SectionCard>
    </div>
  );
}

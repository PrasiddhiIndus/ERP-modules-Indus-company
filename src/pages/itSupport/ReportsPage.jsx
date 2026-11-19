import React, { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EmptyState,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TinyInput,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { canAdmin } from "./itSupportAccess";
import { reportAggregates } from "./itSupportApi";
import { statusLabel } from "./itSupportConstants";

const PIE_COLORS = ["#7c3aed", "#0284c7", "#d97706", "#dc2626", "#059669", "#64748b", "#e11d48"];

function toCsv(rows) {
  const headers = [
    "ticket_id",
    "status",
    "priority",
    "category",
    "created_at",
    "resolved_at",
    "first_response_breached",
    "resolution_breached",
  ];
  const lines = [headers.join(",")];
  rows.forEach((r) => {
    const vals = [
      r.id,
      r.status,
      r.priority || "",
      r.category?.name || "",
      r.created_at || "",
      r.resolved_at || "",
      r.first_response_breached ? "1" : "0",
      r.resolution_breached ? "1" : "0",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(vals.join(","));
  });
  return lines.join("\n");
}

function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { userProfile } = useAuth();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
      const toIso = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined;
      const agg = await reportAggregates({ fromDate: fromIso, toDate: toIso });
      setData({
        ...agg,
        byStatus: (agg.byStatus || []).map((d) => ({ ...d, name: statusLabel(d.name) })),
      });
    } catch (err) {
      setError(err.message || "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canAdmin(userProfile)) {
    return <EmptyState title="No access" message="Reports are available to IT Support admins only." />;
  }

  return (
    <>
      <PageTaskHeader
        title="Reports"
        subtitle="Volume, priority mix, and SLA breaches for the selected period."
      >
        <SecondaryButton onClick={() => window.print()}>Print / PDF</SecondaryButton>
        <PrimaryButton
          disabled={!data?.rows?.length}
          onClick={() =>
            downloadCsv(
              `it-support-report-${new Date().toISOString().slice(0, 10)}.csv`,
              toCsv(data.rows)
            )
          }
        >
          Export CSV
        </PrimaryButton>
      </PageTaskHeader>

      <div className="flex flex-wrap items-end gap-3 mb-2">
        <div>
          <label className="block text-[10px] font-medium text-ink-muted mb-0.5">From</label>
          <TinyInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-ink-muted mb-0.5">To</label>
          <TinyInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <PrimaryButton onClick={load}>Refresh</PrimaryButton>
      </div>

      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      {loading || !data ? (
        <LoadingBlock label="Loading report…" />
      ) : (
        <div className="space-y-4 print:space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total tickets" value={data.total} />
            <Stat label="Resolved / closed" value={data.resolved} />
            <Stat label="SLA breached" value={data.breached} />
            <Stat
              label="Breach rate"
              value={data.total ? `${Math.round((data.breached / data.total) * 100)}%` : "—"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="By status">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.byStatus} dataKey="value" nameKey="name" outerRadius={90} label>
                      {data.byStatus.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="By priority">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byPriority}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {data.byPriority.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.name === "critical"
                              ? "#dc2626"
                              : entry.name === "high"
                                ? "#ea580c"
                                : entry.name === "medium"
                                  ? "#2563eb"
                                  : entry.name === "low"
                                    ? "#64748b"
                                    : "#94a3b8"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="By category">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byCategory} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0284c7" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card">
      <p className="type-mono-caption text-ink-muted">{label}</p>
      <p className="type-figure text-ink-strong mt-1">{value}</p>
    </div>
  );
}

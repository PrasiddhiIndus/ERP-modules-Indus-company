import React, { useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { useState, useEffect } from "react";
import {
  SparkKpi,
  ChartPanel,
  AreaTrendChart,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  CHART_SERIES,
} from "../../../components/charts/DashboardCharts";

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const CommercialDashboardRmMmAmcIev = ({ commercialPOs = [] }) => {
  const [manpowerStats, setManpowerStats] = useState({
    total: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
  });
  const [manpowerError, setManpowerError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadManpowerStats = async () => {
      try {
        const { data: rows, error: queryError } = await supabase.from("manpower_enquiries").select("id, duration, status");
        if (queryError) throw queryError;
        const allRows = rows || [];
        const total = allRows.length;
        const approved = allRows.filter((r) => r.status === "Approved").length;
        const rejected = allRows.filter((r) => r.status === "Rejected").length;
        const pending = Math.max(0, total - approved - rejected);
        if (!cancelled) {
          setManpowerStats({ total, approved, rejected, pending });
          setManpowerError("");
        }
      } catch (error) {
        if (!cancelled) {
          setManpowerError(error?.message || "Could not load manpower data");
          setManpowerStats({ total: 0, approved: 0, rejected: 0, pending: 0 });
        }
      }
    };
    loadManpowerStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const poStats = commercialPOs.reduce(
    (acc, po) => {
      acc.total += 1;
      const status = normalizeStatus(po.approvalStatus);
      if (status === "approved") acc.approved += 1;
      else if (status === "rejected") acc.rejected += 1;
      else if (status === "sent_for_approval") acc.sent += 1;
      else acc.draft += 1;
      return acc;
    },
    { total: 0, approved: 0, rejected: 0, sent: 0, draft: 0 }
  );

  const poMix = useMemo(
    () =>
      [
        { name: "Approved", value: poStats.approved },
        { name: "Sent", value: poStats.sent },
        { name: "Draft", value: poStats.draft },
        { name: "Rejected", value: poStats.rejected },
      ].filter((x) => x.value > 0),
    [poStats.approved, poStats.draft, poStats.rejected, poStats.sent]
  );

  const manMix = useMemo(
    () =>
      [
        { name: "Approved", value: manpowerStats.approved },
        { name: "Pending", value: manpowerStats.pending },
        { name: "Rejected", value: manpowerStats.rejected },
      ].filter((x) => x.value > 0),
    [manpowerStats]
  );

  const compareBars = [
    { name: "PO total", po: poStats.total, man: manpowerStats.total },
    { name: "Approved", po: poStats.approved, man: manpowerStats.approved },
    { name: "Pending", po: poStats.sent + poStats.draft, man: manpowerStats.pending },
    { name: "Rejected", po: poStats.rejected, man: manpowerStats.rejected },
  ];

  const funnelTrend = Array.from({ length: 10 }, (_, i) => ({
    name: `P${i + 1}`,
    value: Math.max(0, Math.round(poStats.total * (0.4 + i * 0.06) + (i % 2))),
  }));

  const approvalRate = poStats.total > 0 ? Math.round((poStats.approved / poStats.total) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 erp-page-stack">
      <div className="bg-surface border border-border rounded-card shadow-card p-5 sm:p-6">
        <h2 className="type-page-title text-ink">Commercial Dashboard</h2>
        <p className="type-meta text-ink-muted mt-1">Live PO/WO and manpower approval pulse.</p>
        {manpowerError && (
          <p className="mt-3 text-sm text-warning bg-warning-soft border border-warning-border rounded-md px-3 py-2">
            Manpower dashboard data is unavailable: {manpowerError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SparkKpi label="Total PO/WO" value={poStats.total} series={sparkFromValue(poStats.total)} color={CHART_SERIES[0]} />
        <SparkKpi label="PO/WO approved" value={poStats.approved} series={sparkFromValue(poStats.approved)} color={CHART_SERIES[5]} />
        <SparkKpi label="Sent for approval" value={poStats.sent} series={sparkFromValue(poStats.sent)} color={CHART_SERIES[1]} />
        <SparkKpi label="Rejected" value={poStats.rejected} series={sparkFromValue(poStats.rejected)} color={CHART_SERIES[3]} />
        <SparkKpi label="Manpower enquiries" value={manpowerStats.total} series={sparkFromValue(manpowerStats.total)} color={CHART_SERIES[2]} />
        <SparkKpi label="Manpower approved" value={manpowerStats.approved} series={sparkFromValue(manpowerStats.approved)} color={CHART_SERIES[5]} />
        <SparkKpi label="Manpower pending" value={manpowerStats.pending} series={sparkFromValue(manpowerStats.pending)} color={CHART_SERIES[2]} />
        <SparkKpi label="Manpower rejected" value={manpowerStats.rejected} series={sparkFromValue(manpowerStats.rejected)} color={CHART_SERIES[3]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel title="PO creation pulse" subtitle="Volume signal" className="lg:col-span-2" height={220}>
          <AreaTrendChart data={funnelTrend} series={[{ key: "value", name: "PO volume", color: CHART_SERIES[0] }]} height={220} />
        </ChartPanel>
        <ChartPanel title="Approval rate" height={220}>
          <RadialScoreChart value={approvalRate} label="Approved" color={approvalRate >= 60 ? CHART_SERIES[5] : CHART_SERIES[2]} height={200} />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartPanel title="PO / WO mix" height={240}>
          <DonutChart data={poMix} centerLabel="POs" centerValue={poStats.total} height={220} />
        </ChartPanel>
        <ChartPanel title="Manpower mix" height={240}>
          <DonutChart data={manMix} centerLabel="Enquiries" centerValue={manpowerStats.total} height={220} />
        </ChartPanel>
        <ChartPanel title="PO vs manpower" height={240}>
          <BarCompareChart
            data={compareBars}
            series={[
              { key: "po", name: "PO/WO", color: CHART_SERIES[0] },
              { key: "man", name: "Manpower", color: CHART_SERIES[1] },
            ]}
            height={220}
          />
        </ChartPanel>
      </div>
    </div>
  );
};

export default CommercialDashboardRmMmAmcIev;

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Calculator,
  Factory,
  FilePlus2,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Target,
  Truck,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import FireTenderNavbar from "./FireTenderNavbar";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  SparkKpi,
  ChartPanel,
  AreaTrendChart,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  bucketByDay,
  CHART_SERIES,
} from "../../components/charts/DashboardCharts";

const statusClass = {
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Pending: "bg-amber-100 text-amber-700",
};

const FireTenderDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState({
    totalTenders: 0,
    newTenders: 0,
    approvedTenders: 0,
    rejectedTenders: 0,
    pendingTenders: 0,
    costingSheets: 0,
    quotations: 0,
  });
  const [recentTenders, setRecentTenders] = useState([]);
  const [intakeTrend, setIntakeTrend] = useState([]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError("");

      const [
        allTendersRes,
        approvedTendersRes,
        rejectedTendersRes,
        costingRes,
        quotationsRes,
        latestTendersRes,
      ] = await Promise.all([
        supabase.from("tenders").select("id, estimation, created_at", { count: "exact" }),
        supabase.from("tenders").select("id", { count: "exact", head: true }).eq("status", "Approved"),
        supabase.from("tenders").select("id", { count: "exact", head: true }).eq("status", "Rejected"),
        supabase.from("costing_rows").select("tender_id"),
        supabase.from("quotations").select("id", { count: "exact", head: true }),
        supabase
          .from("tenders")
          .select("id, client, enquiry_number, tender_number, due_date, status, created_at, estimation")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (allTendersRes.error) throw allTendersRes.error;
      if (approvedTendersRes.error) throw approvedTendersRes.error;
      if (rejectedTendersRes.error) throw rejectedTendersRes.error;
      if (costingRes.error) throw costingRes.error;
      if (quotationsRes.error) throw quotationsRes.error;
      if (latestTendersRes.error) throw latestTendersRes.error;

      const totalTenders = allTendersRes.count || 0;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const newTenders = (allTendersRes.data || []).filter((row) => {
        if (!row?.created_at) return false;
        const created = new Date(row.created_at);
        return !Number.isNaN(created.getTime()) && created >= monthStart;
      }).length;
      const approvedTenders = approvedTendersRes.count || 0;
      const rejectedTenders = rejectedTendersRes.count || 0;
      const pendingTenders = Math.max(totalTenders - approvedTenders - rejectedTenders, 0);

      const costingSheets = new Set((costingRes.data || []).map((item) => item.tender_id).filter(Boolean)).size;
      const quotations = quotationsRes.count || 0;

      setMetrics({
        totalTenders,
        newTenders,
        approvedTenders,
        rejectedTenders,
        pendingTenders,
        costingSheets,
        quotations,
      });
      setRecentTenders(latestTendersRes.data || []);
      setIntakeTrend(bucketByDay(allTendersRes.data || [], "created_at", 14));
    } catch (err) {
      console.error("Error fetching fire tender dashboard data:", err);
      setError(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const dashboardCards = [
    {
      icon: FilePlus2,
      label: "New Tender",
      path: "/app/fire-tender/costing-hub/tender",
      border: "border-red-200",
      bg: "bg-red-50/50 hover:bg-red-50",
      iconWrap: "bg-red-100 text-red-600",
    },
    {
      icon: ClipboardList,
      label: "Tender List",
      path: "/app/fire-tender/costing-hub/tender",
      border: "border-blue-200",
      bg: "bg-blue-50/50 hover:bg-blue-50",
      iconWrap: "bg-blue-100 text-blue-600",
    },
    {
      icon: Calculator,
      label: "Costing Sheet",
      path: "/app/fire-tender/costing-hub/costing",
      border: "border-emerald-200",
      bg: "bg-emerald-50/50 hover:bg-emerald-50",
      iconWrap: "bg-emerald-100 text-emerald-600",
    },
    {
      icon: ReceiptText,
      label: "Quotation",
      path: "/app/fire-tender/costing-hub/quotation",
      border: "border-violet-200",
      bg: "bg-violet-50/50 hover:bg-violet-50",
      iconWrap: "bg-violet-100 text-violet-600",
    },
    {
      icon: Factory,
      label: "Manufacturing",
      path: "/app/fire-tender-manufacturing",
      border: "border-orange-200",
      bg: "bg-orange-50/50 hover:bg-orange-50",
      iconWrap: "bg-orange-100 text-orange-600",
    },
  ];

  const approvalRate = metrics.totalTenders ? Math.round((metrics.approvedTenders / metrics.totalTenders) * 100) : 0;
  const costingCoverage = metrics.totalTenders ? Math.round((metrics.costingSheets / metrics.totalTenders) * 100) : 0;
  const quotationCoverage = metrics.totalTenders ? Math.round((metrics.quotations / metrics.totalTenders) * 100) : 0;

  const kpiTiles = [
    { label: "Total tenders", value: metrics.totalTenders, path: "/app/fire-tender/costing-hub/tender" },
    { label: "New this month", value: metrics.newTenders, path: "/app/fire-tender/costing-hub/tender" },
    { label: "Approved", value: metrics.approvedTenders, path: "/app/fire-tender/costing-hub/tender" },
    { label: "Pending review", value: metrics.pendingTenders, path: "/app/fire-tender/costing-hub/tender" },
    { label: "Rejected", value: metrics.rejectedTenders, path: "/app/fire-tender/costing-hub/tender" },
    { label: "Costing sheets", value: metrics.costingSheets, path: "/app/fire-tender/costing-hub/costing" },
    { label: "Quotations", value: metrics.quotations, path: "/app/fire-tender/costing-hub/quotation" },
  ];

  const statusMix = [
    { name: "Approved", value: metrics.approvedTenders },
    { name: "Pending", value: metrics.pendingTenders },
    { name: "Rejected", value: metrics.rejectedTenders },
  ];

  const pipelineVolume = [
    { name: "Tenders", value: metrics.totalTenders },
    { name: "Costing", value: metrics.costingSheets },
    { name: "Quotations", value: metrics.quotations },
  ];

  return (
    <div className="min-h-screen overflow-y-auto bg-slate-50 px-2 py-3 sm:px-3 sm:py-4">
      <div className="w-full space-y-3">
        <FireTenderNavbar showWorkflowTabs={false} />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl border border-red-100 bg-red-50 p-2.5 shadow-sm">
              <Truck className="h-5 w-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">IEV Dashboard</h1>
              <p className="text-xs text-slate-500 sm:text-sm">Tenders, approvals, costing, and quotations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            title="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {kpiTiles.map((k, i) => (
            <SparkKpi
              key={k.label}
              label={k.label}
              value={loading ? "…" : k.value}
              series={sparkFromValue(Number(k.value) || 0)}
              color={CHART_SERIES[i % CHART_SERIES.length]}
              onClick={() => navigate(k.path)}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <ChartPanel title="Tender intake" subtitle="New tenders — last 14 days" className="lg:col-span-8" height={210}>
            <AreaTrendChart data={intakeTrend} series={[{ key: "value", name: "Tenders", color: CHART_SERIES[0] }]} height={210} />
          </ChartPanel>
          <ChartPanel title="Approval rate" className="lg:col-span-4" height={210}>
            <RadialScoreChart value={approvalRate} label="Approved" color={CHART_SERIES[0]} height={190} />
          </ChartPanel>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ChartPanel title="Status mix" subtitle="Approved / pending / rejected" height={220}>
            <DonutChart data={statusMix} centerLabel="Tenders" centerValue={metrics.totalTenders} height={200} />
          </ChartPanel>
          <ChartPanel title="Pipeline volume" subtitle="Tenders → costing → quotation" height={220}>
            <BarCompareChart
              data={pipelineVolume}
              series={[{ key: "value", name: "Count", color: CHART_SERIES[1] }]}
              height={200}
            />
          </ChartPanel>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:col-span-2 xl:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900">Pipeline health</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <RadialScoreChart value={costingCoverage} label="Costing coverage" color={CHART_SERIES[1]} height={160} />
              <RadialScoreChart value={quotationCoverage} label="Quotation coverage" color={CHART_SERIES[2]} height={160} />
            </div>
            <button
              type="button"
              onClick={() => navigate("/app/fire-tender/costing-hub/tender")}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Target className="h-4 w-4 text-orange-600" />
              Open tender list
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick actions</h2>
            <p className="mt-0.5 text-xs text-slate-500">Open the page you need next.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {dashboardCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(card.path, { replace: false });
                  }}
                  className={`flex min-h-[64px] items-center gap-3 rounded-xl border p-3 text-left transition-colors ${card.border} ${card.bg}`}
                >
                  <div className={`rounded-lg p-2 ${card.iconWrap}`}>
                    <Icon className="h-5 w-5 shrink-0" />
                  </div>
                  <span className="text-sm font-semibold leading-5 text-slate-900">{card.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-semibold text-slate-900">Recent tenders</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/app/fire-tender/costing-hub/tender")}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              View all
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : recentTenders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No tender records found.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-100">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-600">
                    <th className="px-3 py-2.5 font-semibold">Enquiry No</th>
                    <th className="px-3 py-2.5 font-semibold">Client</th>
                    <th className="px-3 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTenders.map((tender) => {
                    const status = tender.status || "Pending";
                    return (
                      <tr
                        key={tender.id}
                        className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/80"
                        onClick={() => navigate(`/app/fire-tender/${tender.id}`)}
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900">{tender.enquiry_number || "—"}</td>
                        <td className="max-w-[280px] truncate px-3 py-2.5 text-slate-700">{tender.client || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                          {formatDateDdMmYyyy(tender.due_date) || "-"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                              statusClass[status] || statusClass.Pending
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FireTenderDashboard;

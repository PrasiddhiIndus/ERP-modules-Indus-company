import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Clock3,
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

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

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
      path: "/app/fire-tender/new",
      border: "border-red-200",
      bg: "bg-red-50/50 hover:bg-red-50",
      iconWrap: "bg-red-100 text-red-600",
    },
    {
      icon: ClipboardList,
      label: "Tender List",
      path: "/app/fire-tender/new",
      border: "border-blue-200",
      bg: "bg-blue-50/50 hover:bg-blue-50",
      iconWrap: "bg-blue-100 text-blue-600",
    },
    {
      icon: Calculator,
      label: "Costing Sheet",
      path: "/app/fire-tender/costing",
      border: "border-emerald-200",
      bg: "bg-emerald-50/50 hover:bg-emerald-50",
      iconWrap: "bg-emerald-100 text-emerald-600",
    },
    {
      icon: ReceiptText,
      label: "Quotation",
      path: "/app/fire-tender/quotation",
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

  const cards = [
    {
      title: "Tender volume",
      description: "Overall tender count and monthly intake",
      icon: ClipboardList,
      accent: "blue",
      stats: [
        { label: "Total tenders", value: metrics.totalTenders },
        { label: "New this month", value: metrics.newTenders },
      ],
      path: "/app/fire-tender/new",
    },
    {
      title: "Approval status",
      description: "Approved, pending and rejected mix",
      icon: ShieldCheck,
      accent: "green",
      stats: [
        { label: "Approved", value: metrics.approvedTenders },
        { label: "Pending review", value: metrics.pendingTenders },
        { label: "Rejected", value: metrics.rejectedTenders },
      ],
      path: "/app/fire-tender/new",
    },
    {
      title: "Costing readiness",
      description: "Tender records with costing sheets",
      icon: Calculator,
      accent: "emerald",
      stats: [
        { label: "Costing sheets", value: metrics.costingSheets },
        {
          label: "Coverage",
          value: `${metrics.totalTenders ? Math.round((metrics.costingSheets / metrics.totalTenders) * 100) : 0}%`,
        },
      ],
      path: "/app/fire-tender/costing",
    },
    {
      title: "Quotation output",
      description: "Issued quotations and completion ratio",
      icon: ReceiptText,
      accent: "violet",
      stats: [
        { label: "Quotations", value: metrics.quotations },
        {
          label: "Coverage",
          value: `${metrics.totalTenders ? Math.round((metrics.quotations / metrics.totalTenders) * 100) : 0}%`,
        },
      ],
      path: "/app/fire-tender/quotation",
    },
    {
      title: "Pending queue",
      description: "Open approvals requiring action",
      icon: Clock3,
      accent: "amber",
      stats: [
        { label: "Pending tenders", value: metrics.pendingTenders },
        { label: "Rejected", value: metrics.rejectedTenders },
      ],
      path: "/app/fire-tender/new",
    },
    {
      title: "Manufacturing flow",
      description: "Post-quotation manufacturing pipeline",
      icon: Factory,
      accent: "rose",
      stats: [
        { label: "Costing tenders", value: metrics.costingSheets },
        { label: "Quotations", value: metrics.quotations },
      ],
      path: "/app/fire-tender-manufacturing",
    },
  ];

  const accentStyles = {
    blue: { cardBg: "from-blue-50/80 to-white", iconBg: "bg-blue-100", iconColor: "text-blue-700", keyColor: "text-blue-700" },
    green: { cardBg: "from-green-50/80 to-white", iconBg: "bg-green-100", iconColor: "text-green-700", keyColor: "text-green-700" },
    emerald: { cardBg: "from-emerald-50/80 to-white", iconBg: "bg-emerald-100", iconColor: "text-emerald-700", keyColor: "text-emerald-700" },
    violet: { cardBg: "from-violet-50/80 to-white", iconBg: "bg-violet-100", iconColor: "text-violet-700", keyColor: "text-violet-700" },
    amber: { cardBg: "from-amber-50/80 to-white", iconBg: "bg-amber-100", iconColor: "text-amber-700", keyColor: "text-amber-700" },
    rose: { cardBg: "from-rose-50/80 to-white", iconBg: "bg-rose-100", iconColor: "text-rose-700", keyColor: "text-rose-700" },
  };

  return (
    <div className="w-full min-h-screen overflow-y-auto px-4 sm:px-6 py-6 bg-gradient-to-b from-slate-50/70 to-white">
      <FireTenderNavbar />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-50 ring-1 ring-red-100 border border-red-100/80 shadow-sm">
              <Truck className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Fire Tender Dashboard</h1>
              <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">
              Overview of tenders, approvals, costing, and quotations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 max-w-6xl mx-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-6 max-w-6xl mx-auto">
        {cards.map((card) => {
          const Icon = card.icon;
          const style = accentStyles[card.accent];
          const primaryStat = card.stats[0];
          const secondaryStats = card.stats.slice(1);
          return (
            <div
              key={card.title}
              className={`h-full rounded-xl border border-slate-200 bg-gradient-to-br ${style.cardBg} shadow-sm p-4 text-left transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-2.5 rounded-lg ${style.iconBg} ${style.iconColor} ring-1 ring-black/5 shrink-0`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-[14px] leading-5 truncate">{card.title}</h3>
                    <p className="text-[11px] leading-4 text-gray-500 line-clamp-2">{card.description}</p>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-white/80 text-slate-600 border border-slate-200 shrink-0">
                  KPI
                </span>
              </div>

              <div className="rounded-lg border border-white/70 bg-white/85 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{primaryStat.label}</p>
                <p className={`mt-1 text-xl leading-6 font-bold tabular-nums ${style.keyColor}`}>
                  {loading ? "..." : primaryStat.value}
                </p>
              </div>

              {secondaryStats.length > 0 && (
                <div className="mt-3 border-t border-slate-200/80 pt-2.5 space-y-1.5">
                  {secondaryStats.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-600 truncate">{s.label}</span>
                      <span className="text-[12px] font-semibold text-slate-800 tabular-nums shrink-0">
                        {loading ? "..." : s.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="max-w-6xl mx-auto rounded-2xl border border-slate-200 bg-white/90 shadow-sm p-4 sm:p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quick actions</h2>
        <p className="text-xs text-gray-500 mb-4">Click any action to open the relevant fire tender page.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
                      className={`relative h-full min-h-[68px] flex items-center gap-3 p-3.5 rounded-xl border ${card.border} ${card.bg} transition-colors text-left`}
                    >
                      <div className={`p-2 rounded-lg ${card.iconWrap}`}>
                        <Icon className="w-5 h-5 shrink-0" />
                      </div>
                      <span className="font-semibold text-gray-900 text-sm leading-5 pr-2">{card.label}</span>
                    </button>
                  );
                })}
        </div>
      </div>

      <div className="mt-6 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Recent Tenders</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/app/fire-tender/new")}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : recentTenders.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No tender records found.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-[360px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left bg-gray-50 text-gray-600 border-b border-gray-100">
                    <th className="px-4 py-3 font-semibold">Enquiry No</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTenders.map((tender) => {
                    const status = tender.status || "Pending";
                    return (
                      <tr
                        key={tender.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80 cursor-pointer"
                        onClick={() => navigate(`/app/fire-tender/${tender.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{tender.enquiry_number || "—"}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{tender.client || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(tender.due_date)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
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

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Pipeline Health</h2>
          </div>
          <div className="space-y-2.5">
            <div className="rounded-lg bg-gradient-to-r from-gray-50 to-red-50 border border-gray-100 p-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Approval rate</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">
                {metrics.totalTenders ? Math.round((metrics.approvedTenders / metrics.totalTenders) * 100) : 0}%
              </p>
            </div>
            <div className="rounded-lg bg-gradient-to-r from-gray-50 to-emerald-50 border border-gray-100 p-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Costing coverage</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">
                {metrics.totalTenders ? Math.round((metrics.costingSheets / metrics.totalTenders) * 100) : 0}%
              </p>
            </div>
            <div className="rounded-lg bg-gradient-to-r from-gray-50 to-violet-50 border border-gray-100 p-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quotation coverage</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">
                {metrics.totalTenders ? Math.round((metrics.quotations / metrics.totalTenders) * 100) : 0}%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/app/fire-tender/new")}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Target className="w-4 h-4 text-orange-600" />
            Open tender list
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

    </div>
  );
};

export default FireTenderDashboard;

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Calculator,
  XCircle,
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

  const primaryStats = [
    {
      title: "Total Tenders",
      value: metrics.totalTenders,
      icon: ClipboardList,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      path: "/app/fire-tender/new",
    },
    {
      title: "Approved",
      value: metrics.approvedTenders,
      icon: CheckCircle2,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      path: "/app/fire-tender/new",
    },
    {
      title: "Pending Review",
      value: metrics.pendingTenders,
      icon: Clock3,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      path: "/app/fire-tender/new",
    },
    {
      title: "Rejected",
      value: metrics.rejectedTenders,
      icon: XCircle,
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      path: "/app/fire-tender/new",
    },
  ];

  const secondaryStats = [
    {
      title: "New This Month",
      value: metrics.newTenders,
      icon: FilePlus2,
      iconBg: "bg-sky-100",
      iconColor: "text-sky-600",
      path: "/app/fire-tender/new",
    },
    {
      title: "Costing Sheets",
      value: metrics.costingSheets,
      icon: Calculator,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      path: "/app/fire-tender/costing",
    },
    {
      title: "Quotations",
      value: metrics.quotations,
      icon: ReceiptText,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
      path: "/app/fire-tender/quotation",
    },
  ];

  const dashboardCards = [
    {
      icon: FilePlus2,
      label: "New Tender",
      path: "/app/fire-tender/new",
      color: "bg-red-500",
      hoverColor: "hover:bg-red-600",
    },
    {
      icon: ClipboardList,
      label: "Tender List",
      path: "/app/fire-tender/new",
      color: "bg-blue-500",
      hoverColor: "hover:bg-blue-600",
    },
    {
      icon: Calculator,
      label: "Costing Sheet",
      path: "/app/fire-tender/costing",
      color: "bg-green-500",
      hoverColor: "hover:bg-green-600",
    },
    {
      icon: ReceiptText,
      label: "Quotation",
      path: "/app/fire-tender/quotation",
      color: "bg-purple-500",
      hoverColor: "hover:bg-purple-600",
    },
    {
      icon: Factory,
      label: "Manufacturing",
      path: "/app/fire-tender-manufacturing",
      color: "bg-orange-500",
      hoverColor: "hover:bg-orange-600",
    },
  ];

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <FireTenderNavbar />

      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Fire Tender Dashboard</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              Overview of tenders, approvals, costing, and quotations
            </p>
          </div>
          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="self-start sm:self-auto inline-flex items-center gap-2 p-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors border border-red-100 text-red-700 disabled:opacity-60"
            title="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Primary stats — same pattern as Marketing (4-up) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 md:mb-8">
          {primaryStats.map(({ title, value, icon: Icon, iconBg, iconColor, path }) => (
            <div
              key={title}
              role="button"
              tabIndex={0}
              onClick={() => navigate(path)}
              onKeyDown={(e) => e.key === "Enter" && navigate(path)}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 cursor-pointer hover:shadow-md hover:border-gray-200 transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{title}</p>
                  <p className="text-3xl font-bold text-gray-900">{loading ? "…" : value}</p>
                </div>
                <div className={`${iconBg} p-3 rounded-lg`}>
                  <Icon className={`w-6 h-6 ${iconColor}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Secondary stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 md:mb-8">
          {secondaryStats.map(({ title, value, icon: Icon, iconBg, iconColor, path }) => (
            <div
              key={title}
              role="button"
              tabIndex={0}
              onClick={() => navigate(path)}
              onKeyDown={(e) => e.key === "Enter" && navigate(path)}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 cursor-pointer hover:shadow-md hover:border-gray-200 transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{title}</p>
                  <p className="text-3xl font-bold text-gray-900">{loading ? "…" : value}</p>
                </div>
                <div className={`${iconBg} p-3 rounded-lg`}>
                  <Icon className={`w-6 h-6 ${iconColor}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Quick Navigation — Marketing-style coloured cards */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">Quick Navigation</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {dashboardCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.label}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(card.path, { replace: false });
                      }}
                      className={`${card.color} ${card.hoverColor} text-white rounded-lg p-4 cursor-pointer transition-all transform hover:scale-[1.02] shadow-md`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="w-6 h-6 shrink-0" />
                        <span className="font-medium">{card.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar — status overview (marketing right-column feel) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Pipeline Health</h2>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg bg-gradient-to-r from-gray-50 to-red-50 border border-gray-100 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Approval rate</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {metrics.totalTenders ? Math.round((metrics.approvedTenders / metrics.totalTenders) * 100) : 0}%
                </p>
              </div>
              <div className="rounded-lg bg-gradient-to-r from-gray-50 to-emerald-50 border border-gray-100 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Costing coverage</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {metrics.totalTenders ? Math.round((metrics.costingSheets / metrics.totalTenders) * 100) : 0}%
                </p>
              </div>
              <div className="rounded-lg bg-gradient-to-r from-gray-50 to-violet-50 border border-gray-100 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quotation coverage</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
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

        {/* Recent tenders — full width table inside card */}
        <div className="mt-6 md:mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Recent Tenders</h2>
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
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left bg-gray-50 text-gray-600 border-b border-gray-100">
                    <th className="px-4 py-3 font-semibold">Enquiry No</th>
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Tender No</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
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
                        <td className="px-4 py-3 text-gray-700">{tender.tender_number || "—"}</td>
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

        {/* Bottom summary strip — similar to marketing utility row */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => navigate("/app/fire-tender/new")}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-left hover:bg-gray-100 transition-colors"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Pending queue
            </span>
            <span className="text-2xl font-bold text-gray-900">{metrics.pendingTenders}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/fire-tender/costing")}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-left hover:bg-gray-100 transition-colors"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
              <Truck className="w-5 h-5 text-emerald-600" />
              Costing tenders
            </span>
            <span className="text-2xl font-bold text-gray-900">{metrics.costingSheets}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/fire-tender/quotation")}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4 text-left hover:bg-gray-100 transition-colors"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
              <ReceiptText className="w-5 h-5 text-violet-600" />
              Quotations
            </span>
            <span className="text-2xl font-bold text-gray-900">{metrics.quotations}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FireTenderDashboard;

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QUICK_ACTION_ROUTES } from "../config/quickActionRoutes";
import { supabase } from "../lib/supabase";
import { getCommercialPOs as getCommercialPOsLocal, getInvoices as getInvoicesLocal } from "../data/billingStore";
import { fetchCommercialPOs, fetchInvoices } from "../services/billingApi";
import {
  executiveSummary as executiveSummaryTpl,
  enterpriseKpis as enterpriseKpisTpl,
  moduleHealth as moduleHealthTpl,
  priorityActions as priorityActionsTpl,
  trends as trendsTpl,
  snapshots as snapshotsTpl,
  criticalAlerts as criticalAlertsTpl,
  pendingApprovals as pendingApprovalsTpl,
  quickActions as quickActionsTpl,
  managementInsights as managementInsightsTpl,
} from "./dashboard/data/mockCommandCenterData";
import {
  SectionHeader,
  ExecutiveChip,
  KpiCard,
  HealthCard,
  PriorityActionRow,
  TrendWidget,
  MiniLineChart,
  DonutChart,
  SnapshotCard,
  AlertRow,
  ApprovalTable,
  ActivityItem,
  QuickActionTile,
  HeaderControls,
  InsightRow,
} from "./dashboard/components/CommandCenterUi";

const META_PREFIX = "__META__:";
const DAY_MS = 24 * 60 * 60 * 1000;
const BID_DEADLINE_ALERT_DAYS = [7, 3, 1];

function parseMeta(raw) {
  if (!raw || typeof raw !== "string" || !raw.startsWith(META_PREFIX)) return {};
  try {
    return JSON.parse(raw.slice(META_PREFIX.length)) || {};
  } catch {
    return {};
  }
}

function toLocalDateStart(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(value) {
  return value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function buildManpowerBidDeadlineAlerts(rows) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return (rows || [])
    .map((row) => {
      const status = String(row.status || "").trim().toLowerCase();
      if (["approved", "rejected", "cancelled", "canceled"].includes(status)) return null;

      const meta = parseMeta(row.authorization_to);
      const deadline = toLocalDateStart(meta.submissionBidDeadline || row.due_date);
      if (!deadline) return null;

      const daysUntil = Math.round((deadline.getTime() - today.getTime()) / DAY_MS);
      if (!BID_DEADLINE_ALERT_DAYS.includes(daysUntil)) return null;

      return {
        id: `manpower-bid-${row.id}-${daysUntil}`,
        severity: daysUntil === 1 ? "critical" : daysUntil === 3 ? "high" : "warning",
        module: "Manpower",
        title: `Bid deadline in ${daysUntil} day${daysUntil === 1 ? "" : "s"} - ${row.client || "Client not set"}`,
        record: row.enquiry_number || `ENQ-${row.id}`,
        age: `T-${daysUntil} (${formatDate(deadline)})`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, warning: 2 };
      return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    });
}

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({
    employeesActive: 0,
    poCount: 0,
    pendingPoApprovals: 0,
    invoicesCount: 0,
    enquiriesCount: 0,
    bidDeadlineAlerts: [],
    recentActivity: [],
    activitySpark: Array.from({ length: 12 }).map(() => 0),
    activityByEntity: [],
    approvedPos: 0,
  });
  const mountedRef = useRef(false);
  const refreshTimerRef = useRef(null);

  const safeCount = useCallback(async (q) => {
    try {
      const { count, error } = await q;
      if (error) return 0;
      return typeof count === "number" ? count : 0;
    } catch {
      return 0;
    }
  }, []);

  const fetchDashboard = useCallback(async ({ showLoading = true } = {}) => {
    try {
      if (showLoading) setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (mountedRef.current) {
          setKpi({
            employeesActive: 0,
            poCount: 0,
            pendingPoApprovals: 0,
            invoicesCount: 0,
            enquiriesCount: 0,
            bidDeadlineAlerts: [],
            recentActivity: [],
            activitySpark: Array.from({ length: 12 }).map(() => 0),
            activityByEntity: [],
            approvedPos: 0,
          });
          setLoading(false);
        }
        return;
      }

      const employeesActiveP = safeCount(
        supabase
          .from("admin_ifsp_employee_master")
          .select("id", { count: "exact", head: true })
          .eq("status", "Active")
      );

      const commercialPosP = (async () => {
        try {
          return await fetchCommercialPOs();
        } catch {
          return getCommercialPOsLocal();
        }
      })();

      const invoicesP = (async () => {
        try {
          return await fetchInvoices();
        } catch {
          return getInvoicesLocal();
        }
      })();

      const enquiriesCountP = safeCount(
        supabase
          .from("marketing_enquiries")
          .select("id", { count: "exact", head: true })
      );

      const manpowerBidDeadlineAlertsP = (async () => {
        try {
          const { data, error } = await supabase
            .from("manpower_enquiries")
            .select("id, enquiry_number, client, due_date, status, authorization_to")
            .limit(500);
          if (error) return [];
          return buildManpowerBidDeadlineAlerts(data || []);
        } catch {
          return [];
        }
      })();

      const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const activityP = (async () => {
        try {
          const { data, error } = await supabase
            .from("erp_activity_log")
            .select("id, created_at, action, entity, details, route")
            .gte("created_at", oneHourAgoIso)
            .order("created_at", { ascending: false })
            .limit(120);
          if (error) return [];
          return (data || []).map((r) => {
            const t = r.created_at ? new Date(r.created_at) : null;
            const hhmm = t
              ? t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
              : "--:--";
            const mod = String(r.entity || "ERP").replaceAll("_", " ");
            const summary =
              r?.details?.summary ||
              r?.details?.text ||
              `${String(r.action || "").toUpperCase()} ${String(r.entity || "")}`.trim() ||
              "Activity";
            return {
              id: r.id,
              time: hhmm,
              module: mod ? mod.charAt(0).toUpperCase() + mod.slice(1) : "ERP",
              text: String(summary),
              record: r.route ? String(r.route) : "",
              createdAt: r.created_at || null,
              entity: r.entity || "erp",
            };
          });
        } catch {
          return [];
        }
      })();

      const [
        employeesActive,
        commercialPos,
        invoices,
        enquiriesCount,
        bidDeadlineAlerts,
        recentActivity,
      ] = await Promise.all([
        employeesActiveP,
        commercialPosP,
        invoicesP,
        enquiriesCountP,
        manpowerBidDeadlineAlertsP,
        activityP,
      ]);

      const nonSupplementaryPos = (commercialPos || []).filter((po) => !po?.isSupplementary && !po?.is_supplementary);
      const pendingPoApprovals = nonSupplementaryPos.filter((po) =>
        ["sent_for_approval", "pending_approval"].includes(
          String(po.approvalStatus || po.approval_status || "").toLowerCase()
        )
      ).length;
      const approvedPos = nonSupplementaryPos.filter((po) =>
        String(po.approvalStatus || po.approval_status || "").toLowerCase() === "approved"
      ).length;
      const invoiceRows = invoices || [];

      if (!mountedRef.current) return;
      const now = Date.now();
      const bucketMs = 5 * 60 * 1000; // 5 min buckets => 12 points / 60 min
      const spark = Array.from({ length: 12 }).map(() => 0);
      const byEntityMap = new Map();

      for (const a of recentActivity) {
        if (a?.createdAt) {
          const ts = Date.parse(a.createdAt);
          if (Number.isFinite(ts)) {
            const delta = now - ts;
            const idx = 11 - Math.floor(delta / bucketMs);
            if (idx >= 0 && idx < 12) spark[idx] += 1;
          }
        }
        const ent = String(a?.entity || "erp");
        byEntityMap.set(ent, (byEntityMap.get(ent) || 0) + 1);
      }
      const byEntity = Array.from(byEntityMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label: String(label).replaceAll("_", " "), value }));

      setKpi({
        employeesActive,
        poCount: nonSupplementaryPos.length,
        pendingPoApprovals,
        invoicesCount: invoiceRows.length,
        enquiriesCount,
        bidDeadlineAlerts,
        recentActivity: recentActivity.slice(0, 8),
        activitySpark: spark,
        activityByEntity: byEntity,
        approvedPos,
      });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [safeCount]);

  useEffect(() => {
    mountedRef.current = true;
    fetchDashboard();

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        fetchDashboard({ showLoading: false });
      }, 250);
    };

    const channel = supabase
      .channel("super-admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_ifsp_employee_master" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "billing", table: "po_wo" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "billing", table: "invoice" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_enquiries" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "manpower_enquiries" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "erp_activity_log" }, scheduleRefresh)
      .subscribe();

    const interval = window.setInterval(() => fetchDashboard({ showLoading: false }), 30000);
    const handleStorage = (event) => {
      if (
        !event?.key ||
        ["erp_commercial_pos", "erp_invoices", "erp_credit_debit_notes", "erp_payment_advice"].includes(event.key)
      ) {
        scheduleRefresh();
      }
    };
    const handleFocus = () => scheduleRefresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("erp-dashboard-refresh", scheduleRefresh);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("erp-dashboard-refresh", scheduleRefresh);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      channel.unsubscribe();
    };
  }, [fetchDashboard]);

  const headerMeta = useMemo(() => {
    const today = new Date().toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    return {
      title: "ERP Command Center",
      businessPeriod: "Current period",
      today,
      companies: ["All", "IFSPL", "IEVPL"],
    };
  }, []);

  const executiveSummary = useMemo(() => {
    const activityCount = kpi.recentActivity.length;
    const approvalsCount = kpi.pendingPoApprovals;
    const criticalCount = kpi.bidDeadlineAlerts.length;
    const priCount = 0;
    const map = {
      pri: priCount,
      crit: criticalCount,
      appr: approvalsCount,
      attn: 0,
      act: activityCount,
    };
    return executiveSummaryTpl.map((x) => ({
      ...x,
      value: loading ? "—" : (map[x.id] ?? 0),
    }));
  }, [kpi.bidDeadlineAlerts.length, kpi.pendingPoApprovals, kpi.recentActivity.length, loading]);

  const enterpriseKpis = useMemo(() => {
    const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : String(n ?? 0));
    const valueById = {
      emp: kpi.employeesActive,
      site: kpi.poCount,
      approval: kpi.pendingPoApprovals,
      alerts: kpi.bidDeadlineAlerts.length,
      tasks: 0,
      billing: kpi.invoicesCount,
      compliance: 0,
      store: 0,
      gate: 0,
      pipeline: kpi.enquiriesCount,
    };

    return enterpriseKpisTpl.map((k) => {
      const raw = valueById[k.id];
      const v =
        typeof raw === "string"
          ? raw
          : fmt(raw);
      return {
        ...k,
        value: loading ? "—" : v,
        trend: loading ? "—" : (k.trend ? "0" : ""),
      };
    });
  }, [
    kpi.bidDeadlineAlerts.length,
    kpi.employeesActive,
    kpi.enquiriesCount,
    kpi.invoicesCount,
    kpi.pendingPoApprovals,
    kpi.poCount,
    loading,
  ]);

  const moduleHealth = useMemo(() => {
    const byModule = {
      HR: {
        pending: kpi.employeesActive,
        alerts: 0,
        health: kpi.employeesActive > 0 ? "Live" : "No data",
        summary: `${kpi.employeesActive.toLocaleString("en-IN")} active employees`,
      },
      Commercial: {
        pending: kpi.pendingPoApprovals,
        alerts: kpi.pendingPoApprovals,
        health: kpi.pendingPoApprovals > 0 ? "Approval queue" : "Stable",
        summary: `${kpi.poCount.toLocaleString("en-IN")} PO/WO records · ${kpi.approvedPos.toLocaleString("en-IN")} approved`,
      },
      Billing: {
        pending: kpi.invoicesCount,
        alerts: 0,
        health: kpi.invoicesCount > 0 ? "Live" : "No data",
        summary: `${kpi.invoicesCount.toLocaleString("en-IN")} invoice records`,
      },
      Marketing: {
        pending: kpi.enquiriesCount,
        alerts: 0,
        health: kpi.enquiriesCount > 0 ? "Live" : "No data",
        summary: `${kpi.enquiriesCount.toLocaleString("en-IN")} enquiry records`,
      },
      Projects: {
        pending: 0,
        alerts: 0,
        health: kpi.poCount > 0 ? "Live" : "No data",
        summary: "PO/WO data included in Commercial queue",
      },
    };
    return moduleHealthTpl.map((m) => {
      const live = byModule[m.module];
      const pending = live?.pending ?? 0;
      const alerts = live?.alerts ?? 0;
      return {
        ...m,
        health: loading ? "—" : (live?.health || "No data"),
        score: loading ? 80 : (pending > 0 || alerts > 0 ? 75 : 0),
        pending: loading ? "—" : pending,
        alerts: loading ? "—" : alerts,
        summary: live?.summary || m.summary,
      };
    });
  }, [
    kpi.approvedPos,
    kpi.employeesActive,
    kpi.enquiriesCount,
    kpi.invoicesCount,
    kpi.pendingPoApprovals,
    kpi.poCount,
    loading,
  ]);

  const priorityActions = useMemo(() => {
    return priorityActionsTpl.map((r) => ({ ...r, count: loading ? "—" : 0 }));
  }, [loading]);

  const criticalAlerts = useMemo(() => {
    if (loading) return criticalAlertsTpl.map((a) => ({ ...a, age: "—" }));
    return kpi.bidDeadlineAlerts;
  }, [kpi.bidDeadlineAlerts, loading]);

  const trends = useMemo(() => {
    return trendsTpl.map((t) => ({ ...t, values: loading ? t.values : t.values.map(() => 0) }));
  }, [loading]);

  const snapshots = useMemo(() => {
    return snapshotsTpl.map((s) => ({
      ...s,
      rows: s.rows.map(([k]) => [k, loading ? "—" : "0"]),
    }));
  }, [loading]);

  const pendingApprovals = useMemo(() => {
    // Keep table layout with a single "0" row, so section isn't empty.
    if (loading) return pendingApprovalsTpl;
    if (kpi.pendingPoApprovals > 0) {
      return [{
        id: "po-approval-summary",
        type: "PO approvals",
        module: "Commercial / Projects",
        requester: "Executives",
        site: "All modules",
        age: "Live",
        status: String(kpi.pendingPoApprovals),
      }];
    }
    return [{ id: "p0", type: "No pending approvals", module: "—", requester: "—", site: "—", age: "—", status: "0" }];
  }, [kpi.pendingPoApprovals, loading]);
  const recentActivity = useMemo(() => kpi.recentActivity, [kpi.recentActivity]);
  const activitySpark = useMemo(() => (loading ? Array.from({ length: 12 }).map(() => 0) : kpi.activitySpark), [kpi.activitySpark, loading]);
  const activityByEntity = useMemo(() => (loading ? [] : kpi.activityByEntity), [kpi.activityByEntity, loading]);
  const navigate = useNavigate();
  const goToQuickAction = useCallback((path) => navigate(path), [navigate]);
  const quickActions = useMemo(() => quickActionsTpl, []);
  const managementInsights = useMemo(() => managementInsightsTpl.map(() => (loading ? "—" : "0")), [loading]);

  return (
    <div className="space-y-4 max-w-[1800px] mx-auto">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{headerMeta.title}</h1>
            <p className="text-xs text-gray-500 mt-1">{headerMeta.today} · Business period: {headerMeta.businessPeriod}</p>
          </div>
          <HeaderControls onRefresh={() => fetchDashboard()} refreshing={loading} />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {executiveSummary.map((x) => <ExecutiveChip key={x.id} label={x.label} value={x.value} tone={x.tone} />)}
        </div>
      </div>

      <section>
        <SectionHeader title="Executive KPI Strip" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          {enterpriseKpis.map((k) => <KpiCard key={k.id} item={k} />)}
        </div>
      </section>

      <section>
        <SectionHeader title="Department Health Overview" right={<button className="text-xs text-blue-700 font-medium">Open module scorecard</button>} />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {moduleHealth.map((m) => <HealthCard key={m.module} item={m} />)}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-3 py-2 border-b border-gray-200"><SectionHeader title="Today's Priority Action Center" /></div>
          <div>
            {priorityActions.map((r) => <PriorityActionRow key={r.id} row={r} />)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-3 py-2 border-b border-gray-200"><SectionHeader title="Critical Alerts & Exceptions" /></div>
          <div>
            {criticalAlerts.length ? (
              criticalAlerts.map((a) => <AlertRow key={a.id} row={a} />)
            ) : (
              <p className="px-3 py-3 text-xs text-gray-500">No bid deadline reminders for T-7, T-3, or T-1 today.</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="Business Activity & Trends" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          <MiniLineChart title="Activity (last 60 min)" values={activitySpark} />
          <DonutChart title="Activity split (module/entity)" items={activityByEntity} />
          {trends.map((t) => <TrendWidget key={t.id} title={t.title} values={t.values} />)}
        </div>
      </section>

      <section>
        <SectionHeader title="Module-specific Snapshot Panels" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {snapshots.map((s) => <SnapshotCard key={s.module} module={s.module} rows={s.rows} />)}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Cross-Module Pending Approvals" />
          <ApprovalTable rows={pendingApprovals} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Recent Activity / ERP Timeline" />
          {recentActivity.length ? (
            recentActivity.map((r) => <ActivityItem key={r.id} item={r} />)
          ) : (
            <p className="text-xs text-gray-500">No activity in the last hour.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_.9fr] gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Quick Access / Quick Actions" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {quickActions.map((q) => (
              <QuickActionTile
                key={q}
                label={q}
                to={QUICK_ACTION_ROUTES[q]}
                onNavigate={goToQuickAction}
              />
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <SectionHeader title="Management Insight Layer" />
          {managementInsights.length ? (
            managementInsights.map((i, idx) => <InsightRow key={idx} text={i} />)
          ) : (
            <p className="text-xs text-gray-500">Insights will appear here as modules get connected.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;

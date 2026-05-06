import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
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

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({
    employeesActive: 0,
    poCount: 0,
    invoicesCount: 0,
    enquiriesCount: 0,
    recentActivity: [],
    activitySpark: Array.from({ length: 12 }).map(() => 0),
    activityByEntity: [],
  });

  useEffect(() => {
    let mounted = true;

    const safeCount = async (q) => {
      try {
        const { count, error } = await q;
        if (error) return 0;
        return typeof count === "number" ? count : 0;
      } catch {
        return 0;
      }
    };

    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (mounted) {
            setKpi({
              employeesActive: 0,
              poCount: 0,
              invoicesCount: 0,
              enquiriesCount: 0,
              recentActivity: [],
              activitySpark: Array.from({ length: 12 }).map(() => 0),
              activityByEntity: [],
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

        const poCountP = safeCount(
          supabase
            .schema("billing")
            .from("po_wo")
            .select("id", { count: "exact", head: true })
        );

        const invoicesCountP = safeCount(
          supabase
            .schema("billing")
            .from("invoice")
            .select("id", { count: "exact", head: true })
        );

        const enquiriesCountP = safeCount(
          supabase
            .from("marketing_enquiries")
            .select("id", { count: "exact", head: true })
        );

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

        const [employeesActive, poCount, invoicesCount, enquiriesCount, recentActivity] = await Promise.all([
          employeesActiveP,
          poCountP,
          invoicesCountP,
          enquiriesCountP,
          activityP,
        ]);

        if (!mounted) return;
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
          poCount,
          invoicesCount,
          enquiriesCount,
          recentActivity: recentActivity.slice(0, 8),
          activitySpark: spark,
          activityByEntity: byEntity,
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDashboard();
    return () => {
      mounted = false;
    };
  }, []);

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
    const approvalsCount = 0;
    const criticalCount = 0;
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
  }, [kpi.recentActivity.length, loading]);

  const enterpriseKpis = useMemo(() => {
    const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : String(n ?? 0));
    const valueById = {
      emp: kpi.employeesActive,
      approval: 0,
      alerts: 0,
      tasks: 0,
      billing: "₹0",
      compliance: 0,
      store: 0,
      gate: 0,
      pipeline: "₹0",
      site: 0,
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
  }, [kpi.employeesActive, kpi.enquiriesCount, kpi.invoicesCount, kpi.poCount, loading]);

  const moduleHealth = useMemo(() => {
    return moduleHealthTpl.map((m) => ({
      ...m,
      health: loading ? "—" : "No data",
      score: loading ? 80 : 0,
      pending: loading ? "—" : 0,
      alerts: loading ? "—" : 0,
      summary: m.summary,
    }));
  }, [loading]);

  const priorityActions = useMemo(() => {
    return priorityActionsTpl.map((r) => ({ ...r, count: loading ? "—" : 0 }));
  }, [loading]);

  const criticalAlerts = useMemo(() => {
    return criticalAlertsTpl.map((a) => ({ ...a, age: loading ? "—" : "0m" }));
  }, [loading]);

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
    return [{ id: "p0", type: "No pending approvals", module: "—", requester: "—", site: "—", age: "—", status: "0" }];
  }, [loading]);
  const recentActivity = useMemo(() => kpi.recentActivity, [kpi.recentActivity]);
  const activitySpark = useMemo(() => (loading ? Array.from({ length: 12 }).map(() => 0) : kpi.activitySpark), [kpi.activitySpark, loading]);
  const activityByEntity = useMemo(() => (loading ? [] : kpi.activityByEntity), [kpi.activityByEntity, loading]);
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
          <HeaderControls />
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
            {criticalAlerts.map((a) => <AlertRow key={a.id} row={a} />)}
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
            {quickActions.map((q) => <QuickActionTile key={q} label={q} />)}
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

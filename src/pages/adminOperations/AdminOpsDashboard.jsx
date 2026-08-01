import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { SectionCard, Badge, LinkedChip, PageTaskHeader, StatusChip } from "./components/AdminUi";
import { supabase } from "../../lib/supabase";
import {
  fetchLeaveStatusCounts,
  fetchLeaveRequests,
  subscribeLeaveWorkflowRealtime,
} from "../../lib/adminLeaveRequests";
import {
  employeesWithBirthdayToday,
  employeesWithAnniversaryToday,
} from "../../utils/employeeMasterReminders";
import { formatDateTimeDdMmYyyy } from "../../utils/dateDisplay";
import {
  SparkKpi,
  ChartPanel,
  AreaTrendChart,
  DonutChart,
  BarCompareChart,
  RadialScoreChart,
  sparkFromValue,
  CHART_SERIES,
} from "../../components/charts/DashboardCharts";

const base = "/app/admin";

async function safeHeadCount(query) {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

function fmtTime(ts) {
  if (!ts) return "";
  return formatDateTimeDdMmYyyy(ts) || String(ts);
}

function activitySummary(row) {
  return (
    row?.details?.summary ||
    `${String(row?.details?.verb || row?.action || "Activity").trim()} · ${String(row?.entity || "record")}`.trim()
  );
}

function activityWho(row) {
  const email = String(row?.user_email || "").trim();
  if (!email.includes("@")) return row?.user_id ? "User" : "System";
  const local = email.split("@")[0] || "";
  const raw = (local.split(".")[0] || local).trim();
  if (!raw) return "Someone";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function bucketActivityByDay(rows, days = 14) {
  const map = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }
  for (const row of rows || []) {
    const key = String(row.created_at || "").slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([name, value], i) => ({
    name: `D${i + 1}`,
    day: name,
    value,
  }));
}

export default function AdminOpsDashboard() {
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const [activeEmployees, setActiveEmployees] = useState(0);
  const [inactiveEmployees, setInactiveEmployees] = useState(0);
  const [leaveCounts, setLeaveCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    all: 0,
  });
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [activityTrend, setActivityTrend] = useState([]);
  const [watchItems, setWatchItems] = useState([]);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    try {
      const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [
        active,
        inactive,
        leaves,
        pendingInbox,
        activity,
        celebrationRows,
      ] = await Promise.all([
        safeHeadCount(
          supabase
            .from("admin_ifsp_employee_master")
            .select("id", { count: "exact", head: true })
            .eq("status", "Active")
        ),
        safeHeadCount(
          supabase
            .from("admin_ifsp_employee_master")
            .select("id", { count: "exact", head: true })
            .in("status", ["Inactive", "Left"])
        ),
        fetchLeaveStatusCounts().catch(() => ({
          pending: 0,
          approved: 0,
          rejected: 0,
          all: 0,
        })),
        fetchLeaveRequests({ status: "pending", page: 1, pageSize: 6 }).catch(() => ({
          rows: [],
        })),
        (async () => {
          try {
            const { data, error } = await supabase
              .from("erp_activity_log")
              .select("id, created_at, action, entity, user_email, user_id, details")
              .gte("created_at", since14)
              .order("created_at", { ascending: false })
              .limit(200);
            if (error) return [];
            return data || [];
          } catch {
            return [];
          }
        })(),
        (async () => {
          try {
            const { data, error } = await supabase
              .from("admin_ifsp_employee_master")
              .select(
                "id, employee_id, full_name, date_of_birth, date_of_anniversary, status, birthday_reminder, anniversary_reminder"
              )
              .eq("status", "Active")
              .limit(5000);
            if (error) return [];
            return data || [];
          } catch {
            return [];
          }
        })(),
      ]);

      if (!mountedRef.current) return;

      setActiveEmployees(active);
      setInactiveEmployees(inactive);
      setLeaveCounts({
        pending: leaves.pending ?? 0,
        approved: leaves.approved ?? 0,
        rejected: leaves.rejected ?? 0,
        all: leaves.all ?? 0,
      });
      setPendingLeaves(pendingInbox.rows || []);
      setActivityRows((activity || []).slice(0, 12));
      setActivityTrend(bucketActivityByDay(activity || [], 14));

      const watch = [];
      for (const e of employeesWithBirthdayToday(celebrationRows)) {
        watch.push({
          id: `bday-${e.id}`,
          sev: "People",
          t: `Birthday today — ${e.full_name || "Employee"} (${e.employee_id || "—"})`,
          path: `${base}/alerts-notifications`,
        });
      }
      for (const e of employeesWithAnniversaryToday(celebrationRows)) {
        watch.push({
          id: `ann-${e.id}`,
          sev: "People",
          t: `Work anniversary — ${e.full_name || "Employee"} (${e.employee_id || "—"})`,
          path: `${base}/alerts-notifications`,
        });
      }
      if ((leaves.pending ?? 0) > 0) {
        watch.push({
          id: "leave-queue",
          sev: "Leave",
          t: `${leaves.pending} leave request${leaves.pending === 1 ? "" : "s"} waiting in the admin queue`,
          path: `${base}/employee/leaves-permissions`,
        });
      }
      if (inactive > 0) {
        watch.push({
          id: "inactive",
          sev: "Exit",
          t: `${inactive} inactive / left employee record${inactive === 1 ? "" : "s"} on master`,
          path: `${base}/employee/exit-ff`,
        });
      }
      setWatchItems(watch.slice(0, 9));
      setUpdatedAt(new Date());
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    const schedule = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        load({ showLoading: false });
      }, 400);
    };

    const unsubLeave = subscribeLeaveWorkflowRealtime(() => {
      setLive(true);
      schedule();
    });

    const channel = supabase
      .channel("admin-ops-dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_ifsp_employee_master" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "erp_activity_log" },
        schedule
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive(true);
      });

    const interval = window.setInterval(() => load({ showLoading: false }), 45000);
    const onFocus = () => schedule();
    const onVis = () => {
      if (document.visibilityState === "visible") schedule();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      unsubLeave();
      channel.unsubscribe();
    };
  }, [load]);

  const leaveN = leaveCounts.pending;
  const activity24h = useMemo(() => {
    const cut = Date.now() - 24 * 60 * 60 * 1000;
    return activityTrend.reduce((sum, d) => {
      const t = d.day ? new Date(`${d.day}T12:00:00`).getTime() : 0;
      return t >= cut ? sum + d.value : sum;
    }, 0);
  }, [activityTrend]);

  const peopleKpis = [
    {
      label: "Active employees",
      value: loading ? "—" : String(activeEmployees),
      n: activeEmployees,
      sub: "Employee master · Active",
      path: `${base}/employee/master`,
      color: CHART_SERIES[0],
    },
    {
      label: "Leave – admin queue",
      value: loading ? "—" : String(leaveN),
      n: leaveN,
      sub: "Pending LMS / Indus One requests",
      path: `${base}/employee/leaves-permissions`,
      color: CHART_SERIES[2],
    },
    {
      label: "Leaves approved",
      value: loading ? "—" : String(leaveCounts.approved),
      n: leaveCounts.approved,
      sub: "Across open leave inbox",
      path: `${base}/employee/leaves-permissions`,
      color: CHART_SERIES[5],
    },
    {
      label: "Inactive / left",
      value: loading ? "—" : String(inactiveEmployees),
      n: inactiveEmployees,
      sub: "Master status Inactive or Left",
      path: `${base}/employee/exit-ff`,
      color: CHART_SERIES[3],
    },
    {
      label: "Activity · 14 days",
      value: loading ? "—" : String(activityRows.length ? activityTrend.reduce((a, x) => a + x.value, 0) : 0),
      n: activityTrend.reduce((a, x) => a + x.value, 0),
      sub: activity24h ? `${activity24h} in last 24h` : "From activity log",
      path: `${base}/alerts-notifications`,
      color: CHART_SERIES[1],
    },
  ];

  const leaveMix = useMemo(
    () =>
      [
        { name: "Pending", value: Math.max(leaveCounts.pending, 0) },
        { name: "Approved", value: Math.max(leaveCounts.approved, 0) },
        { name: "Rejected", value: Math.max(leaveCounts.rejected, 0) },
      ].filter((x) => x.value > 0),
    [leaveCounts]
  );

  const leaveBars = useMemo(
    () => [
      { name: "Pending", value: leaveCounts.pending },
      { name: "Approved", value: leaveCounts.approved },
      { name: "Rejected", value: leaveCounts.rejected },
      { name: "All", value: leaveCounts.all },
    ],
    [leaveCounts]
  );

  const opsHealth = Math.max(
    15,
    Math.min(100, 100 - leaveN * 3 - Math.min(inactiveEmployees, 20))
  );

  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Admin operations"
        subtitle="Live headcount, leave queue, and recent system activity — figures refresh automatically."
      >
        {live ? <StatusChip label="Live" severity="info" /> : null}
        {updatedLabel ? (
          <span className="text-[11px] text-ink-secondary font-mono">Updated {updatedLabel}</span>
        ) : null}
        <button
          type="button"
          onClick={() => load({ showLoading: false })}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent border border-border px-2.5 py-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {peopleKpis.map((k) => (
          <SparkKpi
            key={k.label}
            label={k.label}
            value={k.value}
            sub={k.sub}
            series={sparkFromValue(k.n)}
            color={k.color}
            onClick={() => navigate(k.path)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartPanel title="Activity pulse" subtitle="Logged events · last 14 days" className="lg:col-span-2" height={210}>
          <AreaTrendChart
            data={activityTrend.length ? activityTrend : [{ name: "D1", value: 0 }]}
            series={[{ key: "value", name: "Events", color: CHART_SERIES[0] }]}
            height={210}
          />
        </ChartPanel>
        <ChartPanel title="Ops readiness" subtitle="Leave backlog pressure" height={210}>
          <RadialScoreChart
            value={opsHealth}
            label="Ready"
            color={opsHealth >= 70 ? CHART_SERIES[5] : CHART_SERIES[2]}
            height={190}
          />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartPanel title="Leave inbox mix" height={240}>
          {leaveMix.length ? (
            <DonutChart
              data={leaveMix}
              centerLabel="Requests"
              centerValue={leaveCounts.all}
              height={220}
            />
          ) : (
            <p className="text-xs text-ink-secondary p-4">No leave requests loaded yet.</p>
          )}
        </ChartPanel>
        <ChartPanel title="Leave queue depth" height={240}>
          <BarCompareChart
            data={leaveBars}
            series={[{ key: "value", name: "Count", color: CHART_SERIES[1] }]}
            height={220}
          />
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Leave queue — act next"
          right={<Badge tone="bg-critical-soft text-critical border-critical-border">Live</Badge>}
        >
          {pendingLeaves.length === 0 ? (
            <p className="text-xs text-ink-secondary">No pending leave requests in the admin queue.</p>
          ) : (
            <ul className="space-y-2">
              {pendingLeaves.map((p) => {
                const emp = p.employee || {};
                const name = emp.full_name || p.employee_code || emp.employee_code || "Employee";
                const leaveLabel = p.leave_type_code || p.leave_type || "Leave";
                return (
                <li
                  key={p.id || `${name}-${p.from_date}`}
                  className="flex gap-2 text-xs border border-border p-2 bg-surface cursor-pointer hover:border-primary/40"
                  onClick={() => navigate(`${base}/employee/leaves-permissions`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(`${base}/employee/leaves-permissions`);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="font-semibold text-ink shrink-0">{name}</span>
                  <span className="text-ink-secondary truncate">
                    {leaveLabel}
                    {p.from_date ? ` · ${p.from_date}` : ""}
                    {p.to_date && p.to_date !== p.from_date ? ` → ${p.to_date}` : ""}
                  </span>
                  <span className="ml-auto text-[11px] text-ink-muted whitespace-nowrap">Pending</span>
                </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkedChip label="Leave → Attendance" toHint="Daily register" />
            <button
              type="button"
              className="text-[11px] text-accent font-medium"
              onClick={() => navigate(`${base}/employee/leaves-permissions`)}
            >
              Open leave inbox →
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Recent activity"
          right={
            <button
              type="button"
              className="text-[11px] text-accent font-medium"
              onClick={() => navigate(`${base}/alerts-notifications`)}
            >
              Alerts →
            </button>
          }
        >
          {activityRows.length === 0 ? (
            <p className="text-xs text-ink-secondary">No activity logged in the last 14 days.</p>
          ) : (
            <ul className="space-y-2">
              {activityRows.map((a) => (
                <li key={a.id} className="text-xs border-b border-border pb-2 last:border-0">
                  <span className="text-[11px] text-ink-muted font-mono mr-2">{fmtTime(a.created_at)}</span>
                  <span className="text-ink">{activitySummary(a)}</span>
                  <span className="text-[11px] text-ink-secondary ml-1">· {activityWho(a)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Watchlist"
        right={<Badge tone="bg-neutral-soft text-neutral-state border-neutral-border">Live signals</Badge>}
      >
        {watchItems.length === 0 ? (
          <p className="text-xs text-ink-secondary">No birthday, anniversary, or leave backlog signals right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
            {watchItems.map((x) => (
              <div key={x.id} className="border border-border bg-surface px-2 py-2 flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-critical uppercase tracking-wide">{x.sev}</span>
                <span className="text-ink">{x.t}</span>
                <button
                  type="button"
                  onClick={() => navigate(x.path)}
                  className="text-left text-[11px] text-accent font-medium"
                >
                  Open →
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Module shortcuts">
        <p className="text-xs text-ink-secondary mb-2">
          Store and gate screens are still local workflows — counts are not shown here until those modules are connected to live data.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-[11px] border border-border px-2 py-1" onClick={() => navigate(`${base}/store/site-stock`)}>
            Store
          </button>
          <button type="button" className="text-[11px] border border-border px-2 py-1" onClick={() => navigate(`${base}/gate/employee-movement`)}>
            Gate
          </button>
          <button type="button" className="text-[11px] border border-border px-2 py-1" onClick={() => navigate(`${base}/employee/attendance-daily`)}>
            Attendance
          </button>
          <button type="button" className="text-[11px] border border-border px-2 py-1" onClick={() => navigate(`${base}/salary-admin/dashboard`)}>
            Salary admin
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

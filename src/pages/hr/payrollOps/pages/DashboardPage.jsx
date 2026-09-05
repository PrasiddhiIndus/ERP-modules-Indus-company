import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiTile, SectionCard } from "../../../adminOperations/components/AdminUi";
import { CHART_SERIES, TOKENS } from "../../../../theme/tokens";
import { compactInrTick } from "../../../../components/charts/DashboardCharts";
import {
  COMPLIANCE,
  SALARY_HISTORY,
  daysUntil,
  inr,
  shortSiteName,
} from "../payrollOpsData";
import { payrollOpsAppPath } from "../payrollOpsNav";
import { usePayrollOps } from "../payrollOpsScope";
import { PayrollStatusChip } from "../PayrollOpsUi";

const TIP = {
  background: TOKENS.surface,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 8,
  fontSize: 12,
};

export default function PayrollOpsDashboardPage() {
  const navigate = useNavigate();
  const { sites, employeesBySite, month, year, openProcess } = usePayrollOps();

  const totalDisbursed = useMemo(() => {
    let t = 0;
    Object.values(SALARY_HISTORY).forEach((rows) => {
      rows.forEach((r) => {
        if (r.month === month && r.year === Number(year)) t += r.amount;
      });
    });
    return t;
  }, [month, year]);

  const totalEmployees = Object.values(employeesBySite).reduce((a, e) => a + e.length, 0);
  const heldSites = sites.filter((s) => s.status === "held").length;
  const pendingSites = sites.filter((s) => s.status === "pending" || s.status === "in-progress").length;

  const trend = useMemo(() => {
    return ["March", "April", "May", "June", "July"].map((m) => {
      let t = 0;
      Object.values(SALARY_HISTORY).forEach((rows) => rows.forEach((r) => { if (r.month === m) t += r.amount; }));
      return { month: m.slice(0, 3), Disbursed: Math.round(t) };
    });
  }, []);

  const bySite = useMemo(
    () =>
      sites.map((s) => {
        const row = (SALARY_HISTORY[s.id] || []).find((r) => r.month === month && r.year === Number(year));
        return { name: shortSiteName(s), amount: row ? Math.round(row.amount) : 0 };
      }),
    [sites, month, year]
  );

  const deductionMix = useMemo(
    () =>
      sites.map((s) => {
        const emps = employeesBySite[s.id] || [];
        const t = { name: shortSiteName(s), PF: 0, ESI: 0, "P.Tax": 0, Loan: 0, Other: 0 };
        emps.forEach((e) => {
          t.PF += e.pf;
          t.ESI += e.esi;
          t["P.Tax"] += e.ptax;
          t.Loan += e.loan;
          t.Other += e.lwf + e.canteen + e.held;
        });
        Object.keys(t).forEach((k) => {
          if (k !== "name") t[k] = Math.round(t[k]);
        });
        return t;
      }),
    [sites, employeesBySite]
  );

  const otTrend = useMemo(
    () =>
      ["March", "April", "May", "June", "July"].map((m) => ({
        month: m.slice(0, 3),
        "Avg OT hrs": { March: 2.1, April: 2.6, May: 3.0, June: 3.4, July: 3.8 }[m],
      })),
    []
  );

  const attendanceUtil = useMemo(
    () =>
      sites.map((s) => {
        const emps = employeesBySite[s.id] || [];
        const workingDays = emps.reduce((a, e) => a + e.workingDays, 0) || 1;
        const pDays = emps.reduce((a, e) => a + e.pDays, 0);
        return { name: shortSiteName(s), "Attendance %": Math.round((pDays / workingDays) * 1000) / 10 };
      }),
    [sites, employeesBySite]
  );

  const complianceSnapshot = useMemo(() => {
    const c = { Filed: 0, Pending: 0, Upcoming: 0, Overdue: 0 };
    Object.values(COMPLIANCE).forEach((items) => items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; }));
    return [
      { name: "Filed", value: c.Filed, fill: TOKENS.success },
      { name: "Pending", value: c.Pending, fill: CHART_SERIES[2] },
      { name: "Upcoming", value: c.Upcoming, fill: TOKENS.info },
      { name: "Overdue", value: c.Overdue, fill: TOKENS.critical },
    ];
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Disbursed this cycle" value={inr(totalDisbursed)} sub={`${month} ${year} · ${sites.length} sites`} />
        <KpiTile label="Active workforce" value={String(totalEmployees)} sub="On-site deployed people" />
        <KpiTile label="Sites on hold" value={String(heldSites)} sub={heldSites ? "Needs review" : "None held"} />
        <KpiTile label="Pending processing" value={String(pendingSites)} sub="Sites yet to be run" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard title="Disbursal trend — last 5 months">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid stroke={TOKENS.chartGrid} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={{ stroke: TOKENS.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} tickFormatter={compactInrTick} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={TIP} />
              <Line type="monotone" dataKey="Disbursed" stroke={CHART_SERIES[1]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title={`Disbursed by site — ${month.slice(0, 3)} ${year}`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bySite} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={TOKENS.chartGrid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} tickFormatter={compactInrTick} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: TOKENS.text }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={TIP} />
              <Bar dataKey="amount" radius={[0, 3, 3, 0]}>
                {bySite.map((_, i) => (
                  <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard title="Deduction mix by site">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deductionMix}>
              <CartesianGrid stroke={TOKENS.chartGrid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={{ stroke: TOKENS.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} tickFormatter={compactInrTick} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={TIP} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="PF" stackId="d" fill={CHART_SERIES[1]} />
              <Bar dataKey="ESI" stackId="d" fill={TOKENS.success} />
              <Bar dataKey="P.Tax" stackId="d" fill={CHART_SERIES[2]} />
              <Bar dataKey="Loan" stackId="d" fill={TOKENS.neutralState} />
              <Bar dataKey="Other" stackId="d" fill={TOKENS.critical} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Average OT hours / employee">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={otTrend}>
              <CartesianGrid stroke={TOKENS.chartGrid} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={{ stroke: TOKENS.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TIP} />
              <Line type="monotone" dataKey="Avg OT hrs" stroke={CHART_SERIES[2]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard title="Attendance utilization" right={<span className="type-meta text-ink-muted">Present days vs working days</span>}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={attendanceUtil}>
              <CartesianGrid stroke={TOKENS.chartGrid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={{ stroke: TOKENS.border }} tickLine={false} />
              <YAxis domain={[80, 100]} tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={TIP} />
              <Bar dataKey="Attendance %" fill={TOKENS.success} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard
          title="Statutory snapshot"
          right={
            <button type="button" className="text-[11px] font-medium text-accent hover:underline" onClick={() => navigate(payrollOpsAppPath("compliance"))}>
              Open compliance
            </button>
          }
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={complianceSnapshot} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke={TOKENS.chartGrid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: TOKENS.textMuted }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: TOKENS.text }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TIP} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {complianceSnapshot.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard
        title="Site status this cycle"
        right={
          <button type="button" className="text-[11px] font-medium text-accent hover:underline" onClick={() => navigate(payrollOpsAppPath("sites"))}>
            View all sites
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {sites.map((s) => {
            const d = daysUntil(s.expectedDisbursement);
            const overdue = d < 0 && s.status !== "processed";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => openProcess(s.id, [s.id])}
                className="rounded-lg border border-border bg-surface p-3 text-left hover:border-accent-border"
              >
                <p className="text-xs font-semibold text-ink">{shortSiteName(s)}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{s.location}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PayrollStatusChip status={s.status} />
                  {s.status !== "processed" ? (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${overdue ? "text-critical" : "text-ink-muted"}`}>
                      <CalendarClock className="h-3 w-3" />
                      {overdue ? `${Math.abs(d)}d overdue` : `due in ${d}d`}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

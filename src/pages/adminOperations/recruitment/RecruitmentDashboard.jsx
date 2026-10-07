import React from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, ClipboardList, FileCheck2, FileSignature, UserCheck, UserPlus, Users } from "lucide-react";
import { getDashboardSummary } from "./recruitmentService";
import { stageMeta } from "./recruitmentConfig";
import { AsyncBoundary, Avatar, Card, EmptyState, StatTile, StatusPill, btn, fmtDate, fmtDateTime, useRecruitmentData } from "./RecruitmentUi";

const OFFER_CHART = [
  { key: "accepted", label: "Accepted", color: "var(--success)" },
  { key: "declined", label: "Declined", color: "var(--critical)" },
  { key: "expired", label: "Expired", color: "var(--warning)" },
  { key: "pending", label: "Pending", color: "var(--info)" },
];

const tooltipStyle = { fontSize: 11, borderRadius: 6, border: "1px solid var(--border)" };

export default function RecruitmentDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useRecruitmentData(getDashboardSummary);

  return (
    <AsyncBoundary loading={loading} error={error} onRetry={reload} rows={8}>
      {data ? <DashboardBody data={data} navigate={navigate} /> : null}
    </AsyncBoundary>
  );
}

function DashboardBody({ data, navigate }) {
  const offerData = OFFER_CHART.map((o) => ({
    ...o,
    value: o.key === "pending" ? data.offersPending : data.offerCounts[o.key] || 0,
  })).filter((o) => o.value > 0);
  const totalRequired = data.positions.reduce((s, p) => s + p.required, 0);
  const totalFilled = data.positions.reduce((s, p) => s + p.filled, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatTile label="Open requisitions" value={data.openRequisitions} sub={`${data.pendingRequisitions} awaiting review`} icon={ClipboardList} tone="info" onClick={() => navigate("requisitions")} />
        <StatTile label="Candidates" value={data.totalCandidates} sub="In pipeline" icon={Users} onClick={() => navigate("candidates")} />
        <StatTile label="Interviews today" value={data.interviewsToday.length} sub="Scheduled" icon={CalendarClock} tone="accent" onClick={() => navigate("interviews")} />
        <StatTile label="Interviews attended" value={data.interviewsAttended} sub={`${data.interviewsNoShow} no-shows`} icon={CalendarClock} tone="success" onClick={() => navigate("interviews")} />
        <StatTile label="Offers pending" value={data.offersPending} sub="Awaiting response" icon={FileSignature} tone="warning" onClick={() => navigate("offers")} />
        <StatTile label="Documents pending" value={data.documentsPending} sub={`${data.documentsToReview} to review`} icon={FileCheck2} tone="warning" onClick={() => navigate("documents")} />
        <StatTile label="Upcoming joinings" value={data.upcomingJoinings.length} sub="Next 14 days" icon={UserPlus} tone="success" onClick={() => navigate("joining")} />
        <StatTile label="Ready to convert" value={data.readyToConvert} sub="To Employee Master" icon={UserCheck} tone="accent" onClick={() => navigate("conversion")} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Pipeline by stage" className="xl:col-span-2" right={<button type="button" className={btn.ghost} onClick={() => navigate("candidates?view=board")}>Open board</button>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stageCounts} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} interval={0} angle={-20} textAnchor="end" height={48} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--row-hover)" }} />
                <Bar dataKey="count" name="Candidates" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Offer outcomes">
          {offerData.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={offerData} dataKey="value" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {offerData.map((o) => (
                      <Cell key={o.key} fill={o.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No offers yet" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Interviews today" right={<button type="button" className={btn.ghost} onClick={() => navigate("interviews")}>All interviews</button>}>
          {data.interviewsToday.length ? (
            <ul className="divide-y divide-divider">
              {data.interviewsToday.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => navigate(`candidates/${i.candidateId}`)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-row-hover focus:outline-none focus-visible:bg-accent-soft">
                    <Avatar name={i.candidateName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">{i.candidateName}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{i.position} · {i.mode} · {i.interviewer}</span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-secondary">{fmtDateTime(i.scheduledAt).split(", ")[1]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No interviews today" message="Scheduled interviews for today will appear here." />
          )}
        </Card>

        <Card title="Upcoming joinings" right={<button type="button" className={btn.ghost} onClick={() => navigate("joining")}>Joining board</button>}>
          {data.upcomingJoinings.length ? (
            <ul className="divide-y divide-divider">
              {data.upcomingJoinings.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => navigate(`candidates/${c.id}`)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-row-hover focus:outline-none focus-visible:bg-accent-soft">
                    <Avatar name={c.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">{c.name}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{c.designation} · {c.site}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] tabular-nums text-ink-secondary">{fmtDate(c.expectedJoining)}</span>
                      <StatusPill meta={stageMeta(c.stage)} size="xs" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No joinings in the next 14 days" />
          )}
        </Card>

        <Card title="Positions required vs filled" right={<span className="text-[11px] tabular-nums text-ink-secondary">{totalFilled}/{totalRequired} filled</span>}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.positions} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--divider)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--row-hover)" }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="required" name="Required" fill="var(--chart-inactive)" radius={[0, 3, 3, 0]} maxBarSize={12} />
                <Bar dataKey="filled" name="Filled" fill="var(--success)" radius={[0, 3, 3, 0]} maxBarSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

import React from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, CalendarClock, ClipboardList, FileSignature, UserPlus, Users } from "lucide-react";
import { getDashboardSummary } from "./recruitmentService";
import { stageMeta } from "./recruitmentConfig";
import { AsyncBoundary, Avatar, Card, EmptyState, StatTile, StatusPill, btn, fmtDate, fmtDateTime, useRecruitmentData } from "./RecruitmentUi";

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
  const attention = [
    { key: "approvals", count: data.pendingRequisitions, label: "requisitions waiting for approval", to: "requisitions" },
    { key: "evaluate", count: data.interviewsToEvaluate, label: "attended interviews to evaluate", to: "interviews" },
    { key: "offers", count: data.offersPending, label: "offers awaiting the candidate's response", to: "offers" },
    { key: "documents", count: data.documentsToReview, label: "uploaded documents to review", to: "documents" },
    { key: "convert", count: data.readyToConvert, label: "joined candidates to convert to employees", to: "conversion" },
  ].filter((a) => a.count > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Open requisitions"
          value={data.openRequisitions}
          sub="Approved · ready to recruit"
          icon={ClipboardList}
          tone="info"
          onClick={() => navigate("requisitions")}
        />
        <StatTile label="Candidates in progress" value={data.totalCandidates} sub="Across all openings" icon={Users} onClick={() => navigate("candidates")} />
        <StatTile label="Interviews today" value={data.interviewsToday.length} sub="Scheduled" icon={CalendarClock} tone="accent" onClick={() => navigate("interviews")} />
        <StatTile label="Offers pending" value={data.offersPending} sub="Awaiting response" icon={FileSignature} tone="warning" onClick={() => navigate("offers")} />
        <StatTile label="Joining in 14 days" value={data.upcomingJoinings.length} sub="Upcoming joinings" icon={UserPlus} tone="success" onClick={() => navigate("joining")} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Needs attention" className="xl:col-span-2">
          {attention.length ? (
            <ul className="divide-y divide-divider">
              {attention.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => navigate(a.to)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-row-hover focus:outline-none focus-visible:bg-accent-soft">
                    <span className="inline-flex min-w-[1.75rem] justify-center rounded-full bg-warning-soft px-2 text-xs font-semibold tabular-nums text-warning">{a.count}</span>
                    <span className="min-w-0 flex-1 text-xs text-ink">{a.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="All caught up" message="Nothing is waiting on you right now." />
          )}
        </Card>

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
      </div>
    </div>
  );
}

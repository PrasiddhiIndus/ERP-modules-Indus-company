import React, { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, List, Monitor, Phone, Building2 } from "lucide-react";
import { INTERVIEW_MODES, interviewStatusMeta, recommendationMeta } from "./recruitmentConfig";
import { listCandidates, listInterviews } from "./recruitmentService";
import {
  AsyncBoundary,
  Avatar,
  DataTable,
  SearchBox,
  SegmentedToggle,
  SelectField,
  StatTile,
  StatusPill,
  Tabs,
  btn,
  fmtDateTime,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import InterviewDetailDrawer from "./InterviewDetailDrawer";
import ScheduleInterviewModal from "./ScheduleInterviewModal";

const MODE_ICONS = { office: Building2, online: Monitor, phone: Phone };

async function loadInterviewsPage() {
  const [interviews, candidates] = await Promise.all([listInterviews(), listCandidates()]);
  return { interviews, candidates };
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function dayKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TAB_FILTERS = {
  upcoming: (i) => i.status === "scheduled",
  to_evaluate: (i) => i.status === "attended",
  evaluated: (i) => i.status === "evaluated",
  no_show: (i) => i.status === "no_show",
  cancelled: (i) => ["cancelled", "rescheduled"].includes(i.status),
  all: () => true,
};

export default function InterviewsPage() {
  const caps = useCapabilities();
  const { data, loading, error, reload } = useRecruitmentData(loadInterviewsPage);
  const [view, setView] = useState("list");
  const [tab, setTab] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [openId, setOpenId] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const interviews = data?.interviews || [];
  const candidates = data?.candidates || [];
  const candById = useMemo(() => Object.fromEntries(candidates.map((c) => [c.id, c])), [candidates]);
  const interviewerNames = useMemo(() => [...new Set(interviews.flatMap((i) => i.interviewers.map((p) => p?.name)).filter(Boolean))].sort(), [interviews]);

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return interviews.filter((i) => {
      if (mode && i.modeKey !== mode) return false;
      if (interviewer && !i.interviewers.some((p) => p?.name === interviewer)) return false;
      if (q && ![i.candidateName, i.position, i.interviewer, i.requisitionNo].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [interviews, search, mode, interviewer]);

  const filtered = baseFiltered.filter(TAB_FILTERS[tab]);
  const counts = Object.fromEntries(Object.entries(TAB_FILTERS).map(([k, fn]) => [k, baseFiltered.filter(fn).length]));
  const today = dayKey(new Date());
  const todayCount = interviews.filter((i) => i.status === "scheduled" && dayKey(new Date(i.scheduledAt)) === today).length;

  const open = interviews.find((i) => i.id === openId) || null;

  const columns = [
    {
      key: "candidateName",
      label: "Candidate",
      render: (i) => (
        <span className="flex items-center gap-2">
          <Avatar name={i.candidateName} size="sm" />
          <span>
            <span className="block font-medium">{i.candidateName}</span>
            <span className="block text-[11px] text-ink-muted">{i.position || "—"}</span>
          </span>
        </span>
      ),
    },
    { key: "scheduledAt", label: "Date & time", render: (i) => <span className="tabular-nums">{fmtDateTime(i.scheduledAt)}</span> },
    { key: "round", label: "Round" },
    {
      key: "mode",
      label: "Mode",
      render: (i) => {
        const Icon = MODE_ICONS[i.modeKey] || Building2;
        return (
          <span className="inline-flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-ink-muted" aria-hidden /> {i.mode}
          </span>
        );
      },
    },
    { key: "interviewer", label: "Interviewers" },
    { key: "status", label: "Status", render: (i) => <StatusPill meta={interviewStatusMeta(i.status)} /> },
    { key: "overallRating", label: "Rating", align: "right", render: (i) => (i.overallRating != null ? `★ ${i.overallRating}` : "—") },
    { key: "recommendation", label: "Recommendation", render: (i) => (i.recommendation ? <StatusPill meta={recommendationMeta(i.recommendation)} size="xs" /> : "—") },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Today" value={todayCount} tone="accent" />
        <StatTile label="Upcoming" value={counts.upcoming} tone="info" onClick={() => setTab("upcoming")} />
        <StatTile label="To evaluate" value={counts.to_evaluate} tone="warning" onClick={() => setTab("to_evaluate")} />
        <StatTile label="Evaluated" value={counts.evaluated} tone="success" onClick={() => setTab("evaluated")} />
        <StatTile label="No-shows" value={counts.no_show} tone="critical" onClick={() => setTab("no_show")} />
      </div>

      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-3">
          <SegmentedToggle
            ariaLabel="Interview view"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "List", icon: List },
              { value: "calendar", label: "Calendar", icon: CalendarDays },
            ]}
          />
          {caps.interviews ? (
            <button type="button" className={btn.primary} onClick={() => setScheduleOpen(true)}>
              <CalendarPlus className="h-3.5 w-3.5" /> Schedule interview
            </button>
          ) : null}
        </div>

        {view === "list" ? (
          <div className="px-4 pt-2">
            <Tabs
              ariaLabel="Interview status"
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "upcoming", label: "Scheduled", count: counts.upcoming },
                { key: "to_evaluate", label: "To evaluate", count: counts.to_evaluate },
                { key: "evaluated", label: "Evaluated", count: counts.evaluated },
                { key: "no_show", label: "No-shows", count: counts.no_show },
                { key: "cancelled", label: "Cancelled / moved", count: counts.cancelled },
                { key: "all", label: "All", count: counts.all },
              ]}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Search candidate, position, interviewer…" className="w-full sm:w-72" />
          <SelectField label="Mode" value={mode} onChange={setMode} options={INTERVIEW_MODES.map((m) => ({ value: m.key, label: m.label }))} className="w-32" />
          <SelectField label="Interviewer" value={interviewer} onChange={setInterviewer} options={interviewerNames} className="w-44" />
        </div>

        <div className="px-4 pb-4">
          <AsyncBoundary loading={loading} error={error} onRetry={reload}>
            {view === "list" ? (
              <DataTable
                columns={columns}
                rows={filtered}
                onRowClick={(i) => setOpenId(i.id)}
                initialSort={{ key: "scheduledAt", dir: tab === "upcoming" ? "asc" : "desc" }}
                emptyTitle="No interviews here"
                emptyMessage="Interviews are scheduled for shortlisted candidates."
              />
            ) : (
              <WeekCalendar interviews={baseFiltered.filter((i) => i.status !== "rescheduled")} onOpen={(i) => setOpenId(i.id)} />
            )}
          </AsyncBoundary>
        </div>
      </div>

      {open ? <InterviewDetailDrawer interview={open} candidate={candById[open.candidateId]} onClose={() => setOpenId(null)} /> : null}
      <ScheduleInterviewModal open={scheduleOpen} candidates={candidates} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}

function WeekCalendar({ interviews, onOpen }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const todayKey = dayKey(new Date());
  const byDay = interviews.reduce((acc, i) => {
    const k = dayKey(new Date(i.scheduledAt));
    (acc[k] = acc[k] || []).push(i);
    return acc;
  }, {});

  const shift = (n) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + n * 7);
    setWeekStart(d);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink">
          {days[0].toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {days[6].toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
        <div className="flex items-center gap-1">
          <button type="button" className={btn.ghost} onClick={() => shift(-1)} aria-label="Previous week">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={btn.ghost} onClick={() => setWeekStart(startOfWeek(new Date()))}>
            This week
          </button>
          <button type="button" className={btn.ghost} onClick={() => shift(1)} aria-label="Next week">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((d) => {
          const k = dayKey(d);
          const items = (byDay[k] || []).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          const isToday = k === todayKey;
          return (
            <div key={k} className={`min-h-[140px] rounded-md border p-2 ${isToday ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}>
              <p className={`mb-1.5 text-[11px] font-semibold ${isToday ? "text-accent-deep" : "text-ink-secondary"}`}>
                {d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit" })}
              </p>
              <ul className="space-y-1">
                {items.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(i)}
                      className="w-full rounded border border-border bg-surface px-1.5 py-1 text-left hover:border-accent-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
                    >
                      <span className="block text-[10px] tabular-nums text-ink-muted">
                        {new Date(i.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {i.mode}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-ink">{i.candidateName}</span>
                      <span className="mt-0.5 block">
                        <StatusPill meta={interviewStatusMeta(i.status)} size="xs" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

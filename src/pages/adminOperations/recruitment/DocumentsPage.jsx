import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Send, UserRound } from "lucide-react";
import { DOCUMENT_STATUSES } from "./recruitmentConfig";
import { listDocuments } from "./recruitmentService";
import {
  AsyncBoundary,
  Avatar,
  EmptyState,
  ProgressBar,
  SearchBox,
  StatTile,
  btn,
  inputClass,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import { DocumentChecklist, SendEmailModal } from "./RecruitmentForms";

const FILTERS = [
  { key: "review", label: "Needs review" },
  { key: "pending", label: "Awaiting upload" },
  { key: "rejected", label: "Has rejections" },
  { key: "complete", label: "Fully verified" },
  { key: "", label: "All in progress" },
  { key: "history", label: "Include closed / joined" },
];

export default function DocumentsPage() {
  const caps = useCapabilities();
  const { data, loading, error, reload } = useRecruitmentData(listDocuments);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("review");
  const [selectedId, setSelectedId] = useState(null);
  const [reminderFor, setReminderFor] = useState(null);

  const docs = data || [];

  const groups = useMemo(() => {
    const map = new Map();
    docs.forEach((d) => {
      if (!map.has(d.candidateId)) {
        map.set(d.candidateId, {
          candidate: { id: d.candidateId, name: d.candidateName, live: d.candidateLive, stage: d.candidateStage },
          docs: [],
        });
      }
      map.get(d.candidateId).docs.push(d);
    });
    return [...map.values()].map((g) => {
      const required = g.docs.filter((d) => d.required);
      return {
        ...g,
        collecting: g.candidate.live && ["documents", "ready_to_join"].includes(g.candidate.stage),
        verified: required.filter((d) => d.status === "verified").length,
        total: required.length,
        review: g.docs.filter((d) => ["submitted", "under_review"].includes(d.status)).length,
        pending: g.docs.filter((d) => d.status === "pending").length,
        rejected: g.docs.filter((d) => d.status === "rejected").length,
      };
    });
  }, [docs]);

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (q && !g.candidate.name.toLowerCase().includes(q)) return false;
      if (filter === "history") return true;
      if (!g.collecting) return false;
      if (filter === "review") return g.review > 0;
      if (filter === "pending") return g.pending > 0;
      if (filter === "rejected") return g.rejected > 0;
      if (filter === "complete") return g.verified === g.total;
      return true;
    });
  }, [groups, search, filter]);

  const selected = visibleGroups.find((g) => g.candidate.id === selectedId) || visibleGroups[0] || null;

  const totals = useMemo(() => {
    const t = Object.fromEntries(DOCUMENT_STATUSES.map((s) => [s.key, 0]));
    groups.filter((g) => g.collecting).forEach((g) => g.docs.forEach((d) => (t[d.status] = (t[d.status] || 0) + 1)));
    return t;
  }, [groups]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {DOCUMENT_STATUSES.map((s) => (
          <StatTile key={s.key} label={s.label} value={totals[s.key] || 0} tone={s.tone} />
        ))}
      </div>

      <AsyncBoundary loading={loading} error={error} onRetry={reload} rows={6}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-card border border-border bg-surface shadow-card">
            <div className="space-y-2 border-b border-divider p-3">
              <SearchBox value={search} onChange={setSearch} placeholder="Search candidate…" />
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputClass} aria-label="Filter candidates">
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {visibleGroups.length ? (
              <ul className="max-h-[60vh] divide-y divide-divider overflow-y-auto" aria-label="Candidates">
                {visibleGroups.map((g) => {
                  const active = selected?.candidate.id === g.candidate.id;
                  return (
                    <li key={g.candidate.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(g.candidate.id)}
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left focus:outline-none focus-visible:bg-accent-soft ${active ? "bg-accent-soft" : "hover:bg-row-hover"}`}
                      >
                        <Avatar name={g.candidate.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink">{g.candidate.name}</span>
                          <ProgressBar value={g.verified} total={g.total} tone={g.verified === g.total ? "success" : "accent"} />
                        </span>
                        {g.review ? (
                          <span className="rounded-full bg-warning px-1.5 text-[10px] font-semibold text-white" title="Needs review">
                            {g.review}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-3">
                <EmptyState title="No candidates" message="Document collection starts once the signed appointment letter is received." />
              </div>
            )}
          </aside>

          <section className="rounded-card border border-border bg-surface shadow-card">
            {selected ? (
              <>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{selected.candidate.name}</h2>
                    <p className="text-[11px] text-ink-muted">
                      {selected.verified} of {selected.total} required documents verified
                      {selected.collecting ? "" : " · collection closed"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`../candidates/${selected.candidate.id}`} className={btn.secondary}>
                      <UserRound className="h-3.5 w-3.5" /> Candidate
                    </Link>
                    {caps.documents && selected.collecting && (selected.pending || selected.rejected) ? (
                      <button type="button" className={btn.secondary} onClick={() => setReminderFor(selected.candidate)}>
                        <Send className="h-3.5 w-3.5" /> Send reminder
                      </button>
                    ) : null}
                  </div>
                </header>
                <div className="p-4">
                  <DocumentChecklist candidate={selected.candidate} documents={selected.docs} canManage={Boolean(caps.documents)} />
                </div>
              </>
            ) : (
              <div className="p-4">
                <EmptyState title="Select a candidate" message="Choose a candidate to review their documents." />
              </div>
            )}
          </section>
        </div>
      </AsyncBoundary>

      <SendEmailModal open={Boolean(reminderFor)} candidate={reminderFor} templateKey="document_reminder" onClose={() => setReminderFor(null)} />
    </div>
  );
}

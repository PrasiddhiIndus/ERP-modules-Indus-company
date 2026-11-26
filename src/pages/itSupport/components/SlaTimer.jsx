import React, { useEffect, useState } from "react";

function parseDue(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function formatRemaining(ms) {
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  if (d > 0) return `${d}d ${hh}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Green = > 50% time left, amber = < 50%, red = breached / overdue.
 * When completedAt is set (closed ticket), shows elapsed start→close time instead of a live countdown.
 * Clearing completedAt on reopen resumes the normal SLA cycle.
 */
export default function SlaTimer({
  dueAt,
  breached = false,
  paused = false,
  label = "SLA",
  startedAt = null,
  completedAt = null,
}) {
  const [now, setNow] = useState(Date.now());
  const completed = parseDue(completedAt);

  useEffect(() => {
    if (paused || breached || completed) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [paused, breached, completed]);

  // Closed / completed: freeze at start → close duration (never "Overdue").
  if (completed) {
    const start = parseDue(startedAt);
    const durationMs = start != null ? Math.max(0, completed - start) : null;
    const tone = breached
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-zinc-100 text-zinc-700 border-zinc-200";
    const text =
      durationMs != null ? formatRemaining(durationMs) : "—";

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${tone}`}>
        <span className="opacity-70">{label}</span>
        <span>{text}</span>
      </span>
    );
  }

  const due = parseDue(dueAt);
  if (!due) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium bg-surface-sunken text-ink-muted border-border">
        {label}: —
      </span>
    );
  }

  const remaining = due - now;
  const overdue = breached || remaining <= 0;

  let tone = "bg-emerald-50 text-emerald-700 border-emerald-200";
  let text = `${formatRemaining(remaining)} left`;

  if (paused) {
    tone = "bg-slate-100 text-slate-600 border-slate-300";
    text = "Paused";
  } else if (overdue) {
    tone = "bg-red-50 text-red-700 border-red-200";
    text = overdue && remaining <= 0 ? `Overdue ${formatRemaining(remaining)}` : "Breached";
  } else {
    // Approximate: if less than 4 hours left → amber (no created_at here for %)
    const fourHours = 4 * 60 * 60 * 1000;
    if (remaining < fourHours) {
      tone = "bg-amber-50 text-amber-800 border-amber-200";
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${tone}`}>
      <span className="opacity-70">{label}</span>
      <span>{text}</span>
    </span>
  );
}

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { INTERVIEW_MODES, RECRUITMENT_BASE } from "./recruitmentConfig";
import { getSettings, rescheduleInterview, scheduleInterview } from "./recruitmentService";
import { ActionModal, EmployeeNameSuggest, Field, inputClass, textareaClass } from "./RecruitmentUi";

function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultSlot() {
  const d = new Date(Date.now() + 86400000);
  d.setHours(11, 0, 0, 0);
  return toLocalInput(d);
}

function normalizePanel(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === "string" ? { name: x, email: "" } : { name: String(x?.name || "").trim(), email: String(x?.email || "").trim() }))
    .filter((x) => x.name);
}

/**
 * Schedule a new interview round (shortlisted candidates) or reschedule an existing one (`interview` set).
 */
export default function ScheduleInterviewModal({ open, candidate, candidates = [], interview, onClose }) {
  const [form, setForm] = useState(null);
  const [panel, setPanel] = useState([]);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraftName("");
    setDraftEmail("");
    setForm({
      candidateId: candidate?.id || interview?.candidateId || "",
      scheduledAt: interview ? toLocalInput(interview.scheduledAt) : defaultSlot(),
      mode: interview?.modeKey || "office",
      interviewers: interview?.interviewers?.map((i) => i.name).filter(Boolean) || [],
      location: interview?.location || "",
      roundName: interview?.round || "",
      durationMins: interview?.durationMins || 45,
      reason: "",
    });
    getSettings()
      .then((s) => {
        const fromSettings = normalizePanel(s.interviewers);
        const fromInterview = normalizePanel(interview?.interviewers);
        // Merge so reschedule still shows people already on the interview
        const byName = new Map();
        [...fromSettings, ...fromInterview].forEach((p) => {
          if (!byName.has(p.name.toLowerCase())) byName.set(p.name.toLowerCase(), p);
        });
        setPanel([...byName.values()]);
      })
      .catch(() => setPanel(normalizePanel(interview?.interviewers)));
  }, [open, candidate, interview]);

  if (!open || !form) return null;
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleInterviewer = (name) =>
    set("interviewers", form.interviewers.includes(name) ? form.interviewers.filter((n) => n !== name) : [...form.interviewers, name]);

  const removeInterviewer = (name) => {
    set(
      "interviewers",
      form.interviewers.filter((n) => n.toLowerCase() !== String(name).toLowerCase())
    );
  };

  const addInterviewer = (override) => {
    const name = String(override?.name ?? draftName).trim();
    if (!name) return;
    const email = String(override?.email ?? draftEmail).trim();
    const exists = panel.some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!exists) {
      setPanel((prev) => [...prev, { name, email }]);
    } else {
      setPanel((prev) =>
        prev.map((p) => (p.name.toLowerCase() === name.toLowerCase() ? { ...p, email: email || p.email } : p))
      );
    }
    setForm((f) => {
      if (!f) return f;
      if (f.interviewers.some((n) => n.toLowerCase() === name.toLowerCase())) return f;
      return { ...f, interviewers: [...f.interviewers, name] };
    });
    setDraftName("");
    setDraftEmail("");
  };

  const eligible = candidates.filter((c) => c.live && c.stage === "shortlisted");
  const isReschedule = Boolean(interview);
  const chosen = form.interviewers.map((name) => panel.find((p) => p.name === name) || { name, email: "" });

  return (
    <ActionModal
      open={open}
      title={isReschedule ? `Reschedule · ${interview.candidateName}` : candidate ? `Schedule interview · ${candidate.name}` : "Schedule interview"}
      onClose={onClose}
      widthClass="max-w-3xl"
      submitLabel={isReschedule ? "Reschedule" : "Schedule"}
      canSubmit={Boolean(form.candidateId && form.scheduledAt && form.interviewers.length && (!isReschedule || form.reason.trim()))}
      onSubmit={async () => {
        const scheduledAt = new Date(form.scheduledAt).toISOString();
        if (isReschedule) {
          await rescheduleInterview(interview.id, { scheduledAt, reason: form.reason.trim(), mode: form.mode, location: form.location, interviewers: chosen }, interview.version);
          toast.success("Interview rescheduled", "Send the updated invitation to the candidate.");
        } else {
          await scheduleInterview(form.candidateId, {
            scheduledAt,
            mode: form.mode,
            interviewers: chosen,
            roundName: form.roundName.trim() || undefined,
            durationMins: Number(form.durationMins) || 45,
            location: form.location,
          });
          toast.success("Interview scheduled", "Send the invitation from the candidate's profile.");
        }
        onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!candidate && !isReschedule ? (
          <Field label="Candidate *" className="sm:col-span-2">
            <select value={form.candidateId} onChange={(e) => set("candidateId", e.target.value)} className={inputClass}>
              <option value="">Select a shortlisted candidate</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.designation || "No requisition"}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Date & time *">
          <input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} className={inputClass} />
        </Field>
        {!isReschedule ? (
          <Field label="Round name">
            <input value={form.roundName} onChange={(e) => set("roundName", e.target.value)} className={inputClass} placeholder="e.g. Technical round" />
          </Field>
        ) : (
          <div />
        )}
        <Field label="Mode">
          <div role="radiogroup" aria-label="Interview mode" className="flex gap-1">
            {INTERVIEW_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={form.mode === m.key}
                onClick={() => set("mode", m.key)}
                className={`h-9 flex-1 rounded-md border text-xs font-medium ${form.mode === m.key ? "border-accent bg-accent-soft text-accent-deep" : "border-border text-ink-secondary hover:bg-surface-sunken"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>
        {!isReschedule ? (
          <Field label="Duration (minutes)">
            <input type="number" min={10} max={480} value={form.durationMins} onChange={(e) => set("durationMins", e.target.value)} className={inputClass} />
          </Field>
        ) : (
          <div />
        )}
        <Field label={form.mode === "online" ? "Meeting link" : form.mode === "phone" ? "Phone number" : "Venue"} className="sm:col-span-2">
          <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder={form.mode === "online" ? "https://meet…" : form.mode === "phone" ? "Number to call" : "Office / room"} />
        </Field>
        <Field label="Interviewers *" className="sm:col-span-2">
          {form.interviewers.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {form.interviewers.map((name) => {
                const p = panel.find((x) => x.name === name) || { name, email: "" };
                return (
                  <span
                    key={name}
                    title={p.email || undefined}
                    className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft py-1 pl-2.5 pr-1 text-[11px] text-accent-deep"
                  >
                    <span>
                      {p.name}
                      {p.email ? <span className="ml-1 opacity-70">· {p.email}</span> : null}
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-accent-deep hover:bg-white/70"
                      aria-label={`Remove ${p.name}`}
                      title="Remove interviewer"
                      onClick={() => removeInterviewer(name)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="mb-2 text-[11px] text-ink-muted">No interviewers selected yet.</p>
          )}
          {panel.filter((p) => !form.interviewers.includes(p.name)).length ? (
            <div className="mb-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted">From saved panel</p>
              <div className="flex flex-wrap gap-1.5">
                {panel
                  .filter((p) => !form.interviewers.includes(p.name))
                  .map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      title={p.email ? `Add ${p.name} (${p.email})` : `Add ${p.name}`}
                      onClick={() => toggleInterviewer(p.name)}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-ink-secondary hover:bg-surface-sunken"
                    >
                      + {p.name}
                    </button>
                  ))}
              </div>
            </div>
          ) : !panel.length ? (
            <p className="mb-2 text-[11px] text-ink-muted">
              No saved panel yet. Pick an employee below (email fills from profile), or manage the list in{" "}
              <Link to={`${RECRUITMENT_BASE}/settings`} className="font-medium text-accent-deep underline" onClick={onClose}>
                Recruitment Settings
              </Link>
              .
            </p>
          ) : null}
          <div className="flex flex-wrap items-start gap-2">
            <EmployeeNameSuggest
              value={draftName}
              onChange={setDraftName}
              onPick={(emp) => {
                // One click: fill + add to this interview
                addInterviewer({ name: emp.name || "", email: emp.email || "" });
              }}
              placeholder="Type employee name…"
              aria-label="Interviewer name"
            />
            <input
              type="email"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInterviewer();
                }
              }}
              placeholder="Email (auto-filled, editable)"
              className={`${inputClass} min-w-[12rem] flex-1`}
              aria-label="Interviewer email"
            />
            <button type="button" className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-secondary hover:bg-surface-sunken disabled:opacity-50" disabled={!draftName.trim()} onClick={() => addInterviewer()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Selecting a suggestion adds them in one click. Email comes from Employee Master or the user profile when available — you can still edit it.
            {panel.length ? (
              <>
                {" "}
                Reusable panel:{" "}
                <Link to={`${RECRUITMENT_BASE}/settings`} className="text-accent-deep underline" onClick={onClose}>
                  Settings → Interview panel
                </Link>
                .
              </>
            ) : null}
          </p>
        </Field>
        {isReschedule ? (
          <Field label="Reason for rescheduling *" className="sm:col-span-2">
            <textarea className={textareaClass} rows={3} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
          </Field>
        ) : null}
      </div>
    </ActionModal>
  );
}

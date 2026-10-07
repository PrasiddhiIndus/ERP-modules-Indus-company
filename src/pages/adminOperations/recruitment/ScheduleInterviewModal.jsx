import React, { useEffect, useState } from "react";
import { toast } from "../../../lib/toast";
import { INTERVIEW_MODES } from "./recruitmentConfig";
import { getSettings, rescheduleInterview, scheduleInterview } from "./recruitmentService";
import { ActionModal, Field, inputClass, textareaClass } from "./RecruitmentUi";

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

/**
 * Schedule a new interview round (shortlisted candidates) or reschedule an existing one (`interview` set).
 */
export default function ScheduleInterviewModal({ open, candidate, candidates = [], interview, onClose }) {
  const [form, setForm] = useState(null);
  const [panel, setPanel] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm({
      candidateId: candidate?.id || interview?.candidateId || "",
      scheduledAt: interview ? toLocalInput(interview.scheduledAt) : defaultSlot(),
      mode: interview?.modeKey || "office",
      interviewers: interview?.interviewers?.map((i) => i.name) || [],
      location: interview?.location || "",
      roundName: interview?.round || "",
      durationMins: interview?.durationMins || 45,
      reason: "",
    });
    getSettings()
      .then((s) => setPanel(s.interviewers || []))
      .catch(() => setPanel([]));
  }, [open, candidate, interview]);

  if (!open || !form) return null;
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleInterviewer = (name) =>
    set("interviewers", form.interviewers.includes(name) ? form.interviewers.filter((n) => n !== name) : [...form.interviewers, name]);

  const eligible = candidates.filter((c) => c.live && c.stage === "shortlisted");
  const isReschedule = Boolean(interview);
  const chosen = form.interviewers.map((name) => panel.find((p) => p.name === name) || { name, email: "" });

  return (
    <ActionModal
      open={open}
      title={isReschedule ? `Reschedule · ${interview.candidateName}` : candidate ? `Schedule interview · ${candidate.name}` : "Schedule interview"}
      onClose={onClose}
      widthClass="max-w-lg"
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                className={`h-8 flex-1 rounded-md border text-xs font-medium ${form.mode === m.key ? "border-accent bg-accent-soft text-accent-deep" : "border-border text-ink-secondary hover:bg-surface-sunken"}`}
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
          {panel.length ? (
            <div className="flex flex-wrap gap-1.5">
              {panel.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={form.interviewers.includes(p.name)}
                  onClick={() => toggleInterviewer(p.name)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${form.interviewers.includes(p.name) ? "border-accent bg-accent-soft text-accent-deep" : "border-border text-ink-secondary hover:bg-surface-sunken"}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-ink-muted">Add the interview panel in Recruitment Settings first.</p>
          )}
        </Field>
        {isReschedule ? (
          <Field label="Reason for rescheduling *" className="sm:col-span-2">
            <textarea className={textareaClass} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
          </Field>
        ) : null}
      </div>
    </ActionModal>
  );
}

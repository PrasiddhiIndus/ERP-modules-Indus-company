import React, { useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, CalendarX, Mail, Star, XCircle } from "lucide-react";
import { Drawer } from "../components/AdminUi";
import { toast } from "../../../lib/toast";
import { INTERVIEW_RECOMMENDATIONS, interviewStatusMeta, recommendationMeta } from "./recruitmentConfig";
import { evaluateInterview, getSettings, setInterviewStatus } from "./recruitmentService";
import { ActionModal, DetailGrid, Field, ReasonModal, StatusPill, btn, fmtDateTime, runAction, textareaClass, useCapabilities } from "./RecruitmentUi";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import { SendEmailModal } from "./RecruitmentForms";

function RatingInput({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-ink">{label}</span>
      <div role="radiogroup" aria-label={`${label} rating`} className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of 5`}
            onClick={() => onChange(n)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
          >
            <Star className={`h-4 w-4 ${n <= (value || 0) ? "fill-warning text-warning" : "text-ink-muted"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

function EvaluationModal({ open, interview, onClose }) {
  const [criteria, setCriteria] = useState([]);
  const [ratings, setRatings] = useState({});
  const [recommendation, setRecommendation] = useState("");
  const [remarks, setRemarks] = useState("");
  useEffect(() => {
    if (!open) return;
    setRatings(interview?.ratings || {});
    setRecommendation(interview?.recommendation || "");
    setRemarks(interview?.remarks || "");
    getSettings()
      .then((s) => setCriteria(s.evaluationCriteria || []))
      .catch(() => setCriteria([]));
  }, [open, interview]);
  const keys = criteria.length ? criteria : Object.keys(ratings);
  const ratedAll = keys.length > 0 && keys.every((k) => ratings[k] > 0);
  return (
    <ActionModal
      open={open}
      title={`Evaluation · ${interview?.candidateName || ""}`}
      onClose={onClose}
      submitLabel="Save evaluation"
      canSubmit={ratedAll && Boolean(recommendation)}
      onSubmit={async () => {
        const payload = Object.fromEntries(keys.map((k) => [k, ratings[k]]));
        await evaluateInterview(interview.id, { ratings: payload, recommendation, remarks: remarks.trim() }, interview.version);
        toast.success("Evaluation saved");
        onClose();
      }}
    >
      <div className="divide-y divide-divider rounded-md border border-border px-3">
        {keys.map((k) => (
          <RatingInput key={k} label={k} value={ratings[k]} onChange={(n) => setRatings((r) => ({ ...r, [k]: n }))} />
        ))}
      </div>
      <Field label="Recommendation *">
        <div role="radiogroup" aria-label="Recommendation" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {INTERVIEW_RECOMMENDATIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={recommendation === r.key}
              onClick={() => setRecommendation(r.key)}
              className={`h-8 rounded-md border text-xs font-medium ${recommendation === r.key ? "border-accent bg-accent-soft text-accent-deep" : "border-border text-ink-secondary hover:bg-surface-sunken"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label={["hold", "reject"].includes(recommendation) ? "Remarks *" : "Remarks"}>
        <textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Interviewer notes" />
      </Field>
    </ActionModal>
  );
}

/** Interview details with the actions valid for its current status. */
export default function InterviewDetailDrawer({ interview, candidate, onClose }) {
  const caps = useCapabilities();
  const [modal, setModal] = useState(null);
  if (!interview) return null;

  const canAct = caps.interviews && interview.candidateLive;
  const started = new Date(interview.scheduledAt).getTime() <= Date.now();
  const ratings = interview.ratings || {};

  return (
    <Drawer open title={`Interview · ${interview.candidateName}`} onClose={onClose} widthClass="max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill meta={interviewStatusMeta(interview.status)} />
          <span className="text-[11px] text-ink-muted">{interview.round}</span>
          {interview.recommendation ? <StatusPill meta={recommendationMeta(interview.recommendation)} /> : null}
        </div>
        {interview.statusReason ? <p className="rounded-md bg-surface-sunken px-3 py-2 text-[11px] text-ink-secondary">{interview.statusReason}</p> : null}

        <DetailGrid
          items={[
            ["Candidate", interview.candidateName],
            ["Position", interview.position],
            ["Phone", candidate?.phone || interview.candidatePhone],
            ["Date & time", fmtDateTime(interview.scheduledAt)],
            ["Mode", interview.mode],
            ["Venue / link", interview.location],
            ["Interviewers", interview.interviewer],
            ["Invitation sent", interview.inviteSentAt ? fmtDateTime(interview.inviteSentAt) : "Not yet"],
          ]}
        />

        {interview.overallRating != null ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold text-ink">
              Evaluation · {interview.overallRating} / 5 <span className="font-normal text-ink-muted">by {interview.evaluatedBy || "—"}</span>
            </h3>
            <ul className="space-y-1">
              {Object.entries(ratings).map(([k, v]) => (
                <li key={k} className="flex justify-between text-xs">
                  <span className="text-ink-secondary">{k}</span>
                  <span className="tabular-nums">{v} / 5</span>
                </li>
              ))}
            </ul>
            {interview.remarks ? <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface-sunken px-2 py-1.5 text-[11px]">{interview.remarks}</p> : null}
          </section>
        ) : null}

        {canAct ? (
          <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
            {interview.status === "scheduled" ? (
              <>
                <button type="button" className={btn.secondary} onClick={() => setModal("email")}>
                  <Mail className="h-3.5 w-3.5" /> {interview.inviteSentAt ? "Resend invitation" : "Send invitation"}
                </button>
                <button
                  type="button"
                  className={btn.primary}
                  disabled={!started}
                  title={started ? undefined : "Available once the interview time arrives"}
                  onClick={() => runAction(() => setInterviewStatus(interview.id, "attended", null, { version: interview.version }), "Marked attended")}
                >
                  <CalendarCheck className="h-3.5 w-3.5" /> Attended
                </button>
                <button type="button" className={btn.secondary} disabled={!started} onClick={() => setModal("no_show")}>
                  <CalendarX className="h-3.5 w-3.5" /> No-show
                </button>
                <button type="button" className={btn.secondary} onClick={() => setModal("reschedule")}>
                  <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                </button>
                <button type="button" className={btn.ghost} onClick={() => setModal("cancel")}>
                  <XCircle className="h-3.5 w-3.5" /> Cancel
                </button>
              </>
            ) : null}
            {interview.status === "no_show" ? (
              <button type="button" className={btn.secondary} onClick={() => setModal("reschedule")}>
                <CalendarClock className="h-3.5 w-3.5" /> Reschedule
              </button>
            ) : null}
            {["attended", "evaluated"].includes(interview.status) && interview.candidateStage === "interview" ? (
              <button type="button" className={btn.primary} onClick={() => setModal("evaluate")}>
                <Star className="h-3.5 w-3.5" /> {interview.status === "evaluated" ? "Update evaluation" : "Record evaluation"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <EvaluationModal open={modal === "evaluate"} interview={interview} onClose={() => setModal(null)} />
      <ScheduleInterviewModal open={modal === "reschedule"} interview={interview} onClose={() => setModal(null)} />
      <SendEmailModal
        open={modal === "email"}
        candidate={candidate || { id: interview.candidateId, name: interview.candidateName }}
        templateKey="interview_invite"
        relatedId={interview.id}
        onClose={() => setModal(null)}
      />
      <NoShowModal open={modal === "no_show"} interview={interview} onClose={() => setModal(null)} />
      <ReasonModal
        open={modal === "cancel"}
        title="Cancel interview"
        label="Reason"
        submitLabel="Cancel interview"
        onClose={() => setModal(null)}
        onSubmit={async (reason) => {
          await setInterviewStatus(interview.id, "cancelled", reason, { version: interview.version });
          toast.success("Interview cancelled");
          setModal(null);
        }}
      />
    </Drawer>
  );
}

function NoShowModal({ open, interview, onClose }) {
  const [reason, setReason] = useState("");
  const [close, setClose] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("");
      setClose(false);
    }
  }, [open]);
  return (
    <ActionModal
      open={open}
      title="Record no-show"
      onClose={onClose}
      tone="danger"
      submitLabel="Record no-show"
      onSubmit={async () => {
        await setInterviewStatus(interview.id, "no_show", reason.trim() || null, { closeCandidate: close, version: interview.version });
        toast.success("No-show recorded");
        onClose();
      }}
    >
      <Field label="Notes">
        <textarea className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} />
        Close the candidate as No-show (otherwise you can reschedule)
      </label>
    </ActionModal>
  );
}

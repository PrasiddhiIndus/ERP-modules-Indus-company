import React, { useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, CalendarX, Mail, Star, XCircle } from "lucide-react";
import { Drawer } from "../components/AdminUi";
import { toast } from "../../../lib/toast";
import { EVALUATION_CRITERIA, INTERVIEW_RECOMMENDATIONS, interviewStatusMeta, recommendationMeta } from "./recruitmentConfig";
import { evaluateInterview, setInterviewStatus } from "./recruitmentService";
import { ActionModal, DetailGrid, Field, ReasonModal, StatusPill, btn, fmtDateTime, inputClass, runAction, textareaClass, useCapabilities } from "./RecruitmentUi";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import { SendEmailModal } from "./RecruitmentForms";

function scoreEntries(ratings) {
  const raw = ratings && typeof ratings === "object" ? ratings : {};
  const scored = Object.entries(raw).filter(([k, v]) => k !== "__remarks" && (typeof v === "number" || (typeof v === "string" && /^[1-5]$/.test(String(v)))));
  // Prefer standard parameter order when present
  const order = new Map(EVALUATION_CRITERIA.map((k, i) => [k, i]));
  return scored.sort((a, b) => (order.has(a[0]) ? order.get(a[0]) : 999) - (order.has(b[0]) ? order.get(b[0]) : 999));
}

function averageOf(ratings, keys) {
  const vals = keys.map((k) => Number(ratings[k])).filter((n) => n >= 1 && n <= 5);
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10;
}

function EvaluationModal({ open, interview, onClose }) {
  const keys = EVALUATION_CRITERIA;
  const [ratings, setRatings] = useState({});
  const [rowRemarks, setRowRemarks] = useState({});
  const [recommendation, setRecommendation] = useState("");
  const [remarks, setRemarks] = useState("");
  useEffect(() => {
    if (!open) return;
    const raw = interview?.ratings && typeof interview.ratings === "object" ? interview.ratings : {};
    const { __remarks: savedRowRemarks, ...scores } = raw;
    setRatings(scores);
    setRowRemarks(savedRowRemarks && typeof savedRowRemarks === "object" ? savedRowRemarks : {});
    setRecommendation(interview?.recommendation || "");
    setRemarks(interview?.remarks || "");
  }, [open, interview]);
  const avg = averageOf(ratings, keys);
  return (
    <ActionModal
      open={open}
      title={`Evaluation · ${interview?.candidateName || ""}`}
      onClose={onClose}
      widthClass="max-w-3xl"
      submitLabel="Save evaluation"
      canSubmit={Boolean(recommendation)}
      onSubmit={async () => {
        const notes = {};
        keys.forEach((k) => {
          const t = String(rowRemarks[k] || "").trim();
          if (t) notes[k] = t;
        });
        const scores = {};
        keys.forEach((k) => {
          const n = Number(ratings[k]);
          if (n >= 1 && n <= 5) scores[k] = n;
        });
        const payload = {
          ...scores,
          ...(Object.keys(notes).length ? { __remarks: notes } : {}),
        };
        await evaluateInterview(interview.id, { ratings: payload, recommendation, remarks: remarks.trim() }, interview.version);
        toast.success("Evaluation saved");
        onClose();
      }}
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-divider bg-surface-sunken text-[11px] font-semibold text-ink-secondary">
              <th scope="col" className="px-2.5 py-2 font-semibold">
                Parameter
              </th>
              <th scope="col" className="w-36 px-2.5 py-2 font-semibold">
                Rating (1-5)
              </th>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                Comments
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-b border-divider align-middle">
                <td className="px-2.5 py-1.5 text-ink">{k}</td>
                <td className="px-2.5 py-1.5">
                  <div role="radiogroup" aria-label={`${k} rating`} className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={Number(ratings[k]) === n}
                        aria-label={`${n} of 5`}
                        onClick={() =>
                          setRatings((r) => {
                            if (Number(r[k]) === n) {
                              const next = { ...r };
                              delete next[k];
                              return next;
                            }
                            return { ...r, [k]: n };
                          })
                        }
                        className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
                      >
                        <Star className={`h-4 w-4 ${n <= (Number(ratings[k]) || 0) ? "fill-warning text-warning" : "text-ink-muted"}`} />
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-2.5 py-1.5">
                  <input
                    type="text"
                    value={rowRemarks[k] || ""}
                    onChange={(e) => setRowRemarks((r) => ({ ...r, [k]: e.target.value }))}
                    placeholder="Comments"
                    aria-label={`${k} comments`}
                    className={inputClass}
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-surface-sunken">
              <td className="px-2.5 py-2 font-semibold text-ink">Average Rating</td>
              <td className="px-2.5 py-2 tabular-nums font-semibold text-ink">{avg != null ? `${avg} / 5` : "—"}</td>
              <td className="px-2.5 py-2 text-ink-muted">—</td>
            </tr>
          </tbody>
        </table>
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
  const rowNotes = ratings.__remarks && typeof ratings.__remarks === "object" ? ratings.__remarks : {};

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
              Evaluation <span className="font-normal text-ink-muted">by {interview.evaluatedBy || "—"}</span>
            </h3>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-divider bg-surface-sunken text-[11px] font-semibold text-ink-secondary">
                    <th scope="col" className="px-2.5 py-1.5">
                      Parameter
                    </th>
                    <th scope="col" className="w-24 px-2.5 py-1.5">
                      Rating (1-5)
                    </th>
                    <th scope="col" className="px-2.5 py-1.5">
                      Comments
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scoreEntries(ratings).map(([k, v]) => (
                    <tr key={k} className="border-b border-divider align-top">
                      <td className="px-2.5 py-1.5 text-ink-secondary">{k}</td>
                      <td className="px-2.5 py-1.5 tabular-nums">{v} / 5</td>
                      <td className="px-2.5 py-1.5 text-[11px] text-ink-muted">{rowNotes[k] || "—"}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-sunken">
                    <td className="px-2.5 py-1.5 font-semibold text-ink">Average Rating</td>
                    <td className="px-2.5 py-1.5 tabular-nums font-semibold">{interview.overallRating} / 5</td>
                    <td className="px-2.5 py-1.5 text-ink-muted">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
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

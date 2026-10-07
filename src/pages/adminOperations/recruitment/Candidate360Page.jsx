import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  ExternalLink,
  FilePlus2,
  FileSignature,
  Mail,
  MapPin,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Phone,
  PhoneCall,
  RotateCcw,
  Send,
  Upload,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { toast } from "../../../lib/toast";
import {
  CALL_OUTCOMES,
  CLOSE_OUTCOMES,
  PIPELINE_STAGES,
  SCREENING_RESULTS,
  STAGE_INDEX,
  appointmentStatusMeta,
  candidateStatusMeta,
  deliveryStatusMeta,
  interviewStatusMeta,
  offerStatusMeta,
  outcomeMeta,
  recommendationMeta,
} from "./recruitmentConfig";
import {
  addCandidateNote,
  cancelAppointment,
  closeCandidate,
  getCandidateWorkspace,
  markJoiningNoShow,
  moveCandidateStage,
  prepareAppointmentLetter,
  prepareOfferLetter,
  reopenCandidate,
  retryCommunication,
  setCandidateResume,
  updateCandidate,
  withdrawOffer,
} from "./recruitmentService";
import {
  ActionModal,
  AsyncBoundary,
  Avatar,
  Card,
  DetailGrid,
  EmptyState,
  Field,
  FileButton,
  FilePicker,
  ProgressBar,
  ReadinessIndicator,
  ReasonModal,
  StatusPill,
  Tabs,
  btn,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  inputClass,
  runAction,
  textareaClass,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import ActivityTimeline from "./ActivityTimeline";
import InterviewDetailDrawer from "./InterviewDetailDrawer";
import ScheduleInterviewModal from "./ScheduleInterviewModal";
import {
  AppointmentModal,
  ConvertModal,
  DocumentChecklist,
  JoiningDateModal,
  MarkJoinedModal,
  OfferModal,
  OfferResponseModal,
  ScreeningModal,
  SendEmailModal,
  UploadModal,
} from "./RecruitmentForms";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "screening", label: "Screening" },
  { key: "interviews", label: "Interviews" },
  { key: "offers", label: "Offer & Appointment" },
  { key: "documents", label: "Documents" },
  { key: "communication", label: "Communication" },
  { key: "activity", label: "Activity Timeline" },
];

export default function Candidate360Page() {
  const { candidateId } = useParams();
  const { data, loading, error, reload } = useRecruitmentData(() => getCandidateWorkspace(candidateId), [candidateId]);

  return (
    <div className="space-y-3">
      <Link to=".." relative="path" className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All candidates
      </Link>
      <AsyncBoundary loading={loading} error={error} onRetry={reload} rows={6}>
        {data ? <Workspace data={data} /> : null}
      </AsyncBoundary>
    </div>
  );
}

function StageTracker({ stage, outcome }) {
  const current = STAGE_INDEX[stage] ?? 0;
  return (
    <ol className="flex min-w-max items-center" aria-label="Recruitment journey">
      {PIPELINE_STAGES.map((s, i) => {
        const done = i < current || (i === current && stage === "employee_created");
        const active = i === current && !done;
        const stopped = active && outcome;
        return (
          <li key={s.key} className="flex items-center" aria-current={active ? "step" : undefined}>
            <span className="flex flex-col items-center gap-1 px-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  done ? "border-success bg-success text-white" : stopped ? "border-critical bg-critical text-white" : active ? "border-accent bg-accent text-white" : "border-border bg-surface text-ink-muted"
                }`}
              >
                {done ? "✓" : stopped ? "✕" : i + 1}
              </span>
              <span className={`whitespace-nowrap text-[10px] ${active ? "font-semibold text-ink" : "text-ink-muted"}`}>{s.label}</span>
            </span>
            {i < PIPELINE_STAGES.length - 1 ? <span className={`mb-4 h-px w-6 ${i < current ? "bg-success" : "bg-border"}`} aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function EditProfileModal({ open, candidate, onClose }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (!open || !candidate) return;
    setForm({
      fullName: candidate.name,
      phone: candidate.phone,
      email: candidate.email,
      alternatePhone: candidate.alternatePhone,
      qualification: candidate.qualification,
      experienceYears: candidate.experienceYears ?? "",
      currentCompany: candidate.currentCompany,
      currentDesignation: candidate.currentDesignation,
      currentLocation: candidate.currentLocation,
      homeTown: candidate.homeTown,
      expectedCtc: candidate.expectedSalary ?? "",
      noticePeriodDays: candidate.noticePeriodDays ?? "",
      skills: candidate.skills,
    });
  }, [open, candidate]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fields = [
    ["fullName", "Full name"],
    ["phone", "Mobile number"],
    ["email", "Email"],
    ["alternatePhone", "Alternate phone"],
    ["qualification", "Qualification"],
    ["experienceYears", "Experience (years)", "number"],
    ["currentCompany", "Current company"],
    ["currentDesignation", "Current designation"],
    ["currentLocation", "Current location"],
    ["homeTown", "Home town"],
    ["expectedCtc", "Expected salary (monthly)", "number"],
    ["noticePeriodDays", "Notice period (days)", "number"],
  ];
  return (
    <ActionModal
      open={open}
      title="Edit profile"
      onClose={onClose}
      widthClass="max-w-2xl"
      onSubmit={async () => {
        await updateCandidate(candidate.id, form, candidate.version);
        toast.success("Profile updated");
        onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map(([k, label, type]) => (
          <Field key={k} label={label}>
            <input type={type || "text"} className={inputClass} value={form[k] ?? ""} onChange={set(k)} />
          </Field>
        ))}
        <Field label="Skills" className="sm:col-span-2">
          <input className={inputClass} value={form.skills ?? ""} onChange={set("skills")} />
        </Field>
      </div>
    </ActionModal>
  );
}

function CloseCandidateModal({ open, candidate, onClose }) {
  const [outcome, setOutcome] = useState("rejected");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setOutcome("rejected");
      setReason("");
    }
  }, [open]);
  return (
    <ActionModal
      open={open}
      title={`Close candidate · ${candidate?.name || ""}`}
      description="Open interviews, offers and letters are cancelled. The record stays in history and can be reopened."
      onClose={onClose}
      tone="danger"
      submitLabel="Close candidate"
      canSubmit={reason.trim().length > 0}
      onSubmit={async () => {
        await closeCandidate(candidate.id, outcome, reason.trim(), candidate.version);
        toast.success(`Candidate marked ${outcomeMeta(outcome).label.toLowerCase()}`);
        onClose();
      }}
    >
      <Field label="Outcome">
        <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {CLOSE_OUTCOMES.map((k) => (
            <option key={k} value={k}>
              {outcomeMeta(k).label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reason *">
        <textarea className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

function NoteModal({ open, candidate, onClose }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);
  return (
    <ActionModal
      open={open}
      title="Add note"
      onClose={onClose}
      submitLabel="Add note"
      canSubmit={note.trim().length > 0}
      onSubmit={async () => {
        await addCandidateNote(candidate.id, note.trim());
        toast.success("Note added to timeline");
        onClose();
      }}
    >
      <Field label="Note">
        <textarea className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
    </ActionModal>
  );
}

function ResumeModal({ open, candidate, onClose }) {
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (open) setFile(null);
  }, [open]);
  return (
    <ActionModal
      open={open}
      title="Upload resume"
      onClose={onClose}
      submitLabel="Upload"
      canSubmit={Boolean(file)}
      onSubmit={async () => {
        await setCandidateResume(candidate.id, file);
        toast.success("Resume uploaded");
        onClose();
      }}
    >
      <FilePicker label="Resume" onChange={setFile} />
    </ActionModal>
  );
}

/** The single most relevant action for the candidate's current stage. */
function NextStep({ data, caps, open }) {
  const { candidate: c, interviews, offers, appointments, screenings } = data;
  const offer = offers.find((o) => ["draft", "generated", "sent", "viewed", "accepted"].includes(o.status));
  const appt = appointments.find((a) => ["generated", "sent", "viewed", "signed"].includes(a.status));
  const scheduled = interviews.find((i) => i.status === "scheduled");
  const latest = interviews[0];
  const passed = screenings.some((s) => s.kind === "screening" && s.result === "pass");

  let title = "";
  let hint = "";
  const actions = [];
  const add = (cap, label, onClick, Icon, primary = false, extra = {}) => {
    if (caps[cap]) actions.push({ label, onClick, Icon, primary, ...extra });
  };

  if (c.outcome) {
    title = `Closed — ${outcomeMeta(c.outcome).label}`;
    hint = c.outcomeReason;
    add("candidates", "Reopen", () => open("reopen"), RotateCcw, true);
  } else {
    switch (c.stage) {
      case "new":
        title = "Contact the candidate";
        hint = "Log the call and start screening.";
        add("candidates", "Log call / screening", () => open("screening"), PhoneCall, true);
        add("candidates", "Move to Screening", () => runAction(() => moveCandidateStage(c.id, "screening", null, c.version), "Moved to Screening"), ArrowRight);
        break;
      case "screening":
        title = passed ? "Screening passed — shortlist the candidate" : "Complete screening";
        hint = passed ? "" : "Record a passed screening to shortlist.";
        add("candidates", "Log call / screening", () => open("screening"), PhoneCall, !passed);
        if (passed) add("candidates", "Shortlist", () => runAction(() => moveCandidateStage(c.id, "shortlisted", null, c.version), "Shortlisted"), ArrowRight, true);
        break;
      case "shortlisted":
        title = "Schedule the interview";
        hint = c.requisitionId ? "" : "Link the candidate to an approved requisition before the interview.";
        add("interviews", "Schedule interview", () => open("schedule"), CalendarPlus, true);
        break;
      case "interview":
        if (scheduled) {
          title = `Interview on ${fmtDateTime(scheduled.scheduledAt)}`;
          hint = scheduled.inviteSentAt ? "Invitation sent." : "Invitation not sent yet.";
          add("interviews", "Open interview", () => open("interview", scheduled), CalendarPlus, true);
        } else if (latest?.status === "evaluated" && ["hire", "strong_hire"].includes(latest.recommendation)) {
          title = `Recommended: ${recommendationMeta(latest.recommendation).label}`;
          add("candidates", "Select candidate", () => runAction(() => moveCandidateStage(c.id, "selected", null, c.version), "Candidate selected"), UserCheck, true);
          add("interviews", "Schedule another round", () => open("schedule"), CalendarPlus);
        } else if (latest?.status === "attended") {
          title = "Record the interview evaluation";
          add("interviews", "Record evaluation", () => open("interview", latest), Pencil, true);
        } else {
          title = latest ? `Last interview: ${interviewStatusMeta(latest.status).label}` : "Interview";
          if (latest) add("interviews", "Open interview", () => open("interview", latest), CalendarPlus, true);
          add("interviews", "Schedule another round", () => open("schedule"), CalendarPlus);
        }
        break;
      case "selected":
        title = offer ? "Finish and generate the offer" : "Prepare the offer";
        add("offers", offer ? "Edit & generate offer" : "Prepare offer", () => open("offer", offer || null), FilePlus2, true);
        break;
      case "offer":
        if (offer && !offer.generatedDoc) {
          title = "Offer letter document pending";
          add("offers", "Prepare letter", () => runAction(() => prepareOfferLetter(offer.id), "Offer letter ready"), FileSignature, true);
        } else if (offer?.status === "generated") {
          title = `Send offer ${offer.offerNo}`;
          hint = `Valid until ${fmtDate(offer.validUntil)}.`;
          add("offers", "Send offer", () => open("email", { templateKey: "offer_letter", relatedId: offer.id }), Send, true);
        } else if (offer) {
          title = `Awaiting response · ${offerStatusMeta(offer.status).label}`;
          hint = `Valid until ${fmtDate(offer.validUntil)}. The candidate can respond from the secure link.`;
          add("offers", "Record response", () => open("offerResponse", offer), FileSignature, true);
          add("offers", "Resend offer", () => open("email", { templateKey: "offer_letter", relatedId: offer.id }), Send);
        }
        if (offer) add("offers", "Withdraw offer", () => open("withdrawOffer", offer), XCircle);
        break;
      case "offer_accepted":
        title = "Issue the appointment letter";
        add("offers", "Generate appointment letter", () => open("appointment"), FileSignature, true);
        break;
      case "appointment":
        if (appt && !appt.generatedDoc) {
          title = "Appointment letter document pending";
          add("offers", "Prepare letter", () => runAction(() => prepareAppointmentLetter(appt.id), "Appointment letter ready"), FileSignature, true);
        } else if (appt?.status === "generated") {
          title = `Send appointment letter ${appt.letterNo}`;
          add("offers", "Send letter", () => open("email", { templateKey: "appointment_letter", relatedId: appt.id }), Send, true);
        } else if (appt) {
          title = "Awaiting signed appointment letter";
          hint = "The candidate can upload the signed copy from the secure link.";
          add("offers", "Upload signed copy", () => open("upload", { kind: "appointment_signed", appointment: appt }), Upload, true);
          add("offers", "Resend letter", () => open("email", { templateKey: "appointment_letter", relatedId: appt.id }), Send);
        }
        if (appt) add("offers", "Cancel letter", () => open("cancelAppointment", appt), XCircle);
        break;
      case "documents":
        title = `Collect documents · ${c.documents.verified}/${c.documents.total} verified`;
        hint = c.documents.toReview ? `${c.documents.toReview} waiting for review.` : "";
        add("documents", "Request documents", () => open("email", { templateKey: "document_request" }), Send, true);
        add("joining", "Joining date", () => open("joiningDate"), CalendarPlus);
        break;
      case "ready_to_join":
        title = `Ready to join${c.expectedJoining ? ` on ${fmtDate(c.expectedJoining)}` : ""}`;
        add("joining", "Mark joined", () => open("joined"), UserCheck, true);
        add("joining", "Change joining date", () => open("joiningDate"), CalendarPlus);
        add("joining", "Send joining reminder", () => open("email", { templateKey: "joining_reminder" }), Send);
        add("joining", "Did not join", () => open("noShow"), UserX);
        break;
      case "joined":
        title = "Create the employee record";
        add("conversion", "Create employee", () => open("convert"), UserCheck, true);
        break;
      case "employee_created":
        title = `Employee created${c.employeeCode ? ` · ${c.employeeCode}` : ""}`;
        hint = `Converted ${fmtDate(c.convertedAt)}${c.convertedBy ? ` by ${c.convertedBy}` : ""}.`;
        actions.push({ label: "Open in Employee Master", href: `/app/admin/employee/master/${c.employeeMasterId}`, Icon: ExternalLink, primary: true });
        break;
      default:
        break;
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-divider bg-surface-sunken/50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="type-mono-caption">Next step</p>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {hint ? <p className="text-[11px] text-ink-secondary">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) =>
          a.href ? (
            <Link key={a.label} to={a.href} className={a.primary ? btn.primary : btn.secondary}>
              <a.Icon className="h-3.5 w-3.5" /> {a.label}
            </Link>
          ) : (
            <button key={a.label} type="button" className={a.primary ? btn.primary : btn.secondary} onClick={a.onClick}>
              <a.Icon className="h-3.5 w-3.5" /> {a.label}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function Workspace({ data }) {
  const caps = useCapabilities();
  const { candidate: c, requisition, screenings, interviews, offers, appointments, documents, communications, activity } = data;
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const open = (name, payload = null) => {
    setMenuOpen(false);
    setModal({ name, payload });
  };
  const close = () => setModal(null);
  const is = (name) => modal?.name === name;

  const tabs = TABS.map((t) => ({
    ...t,
    count: { interviews: interviews.length, offers: offers.length + appointments.length || undefined, documents: documents.length || undefined, communication: communications.length || undefined }[t.key],
  }));

  return (
    <div className="space-y-3">
      <section className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-start gap-4 p-4">
          <Avatar name={c.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{c.name}</h2>
              <StatusPill meta={candidateStatusMeta(c)} />
              <span className="font-mono text-[11px] text-ink-muted">{c.candidateNo}</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-secondary">
              {[c.designation, c.requisitionNo, c.source ? `Source: ${c.source}` : null, c.referredByName ? `Referred by ${c.referredByName}` : null].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-secondary">
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone className="h-3 w-3" /> {c.phone}
                </a>
              ) : null}
              {c.email ? (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Mail className="h-3 w-3" /> {c.email}
                </a>
              ) : null}
              {c.site ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {c.site}
                </span>
              ) : null}
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            {c.email ? (
              <button type="button" className={btn.secondary} onClick={() => open("email", { templateKey: "general" })}>
                <Mail className="h-3.5 w-3.5" /> Email
              </button>
            ) : null}
            <button type="button" className={btn.secondary} onClick={() => open("note")}>
              <MessageSquarePlus className="h-3.5 w-3.5" /> Note
            </button>
            {caps.candidates && c.stage !== "employee_created" ? (
              <>
                <button type="button" className={btn.secondary} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-label="More actions">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 top-9 z-20 w-48 rounded-md border border-border bg-surface py-1 shadow-card">
                    <button type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-surface-sunken" onClick={() => open("edit")}>
                      Edit profile
                    </button>
                    <button type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-surface-sunken" onClick={() => open("resume")}>
                      {c.resume ? "Replace resume" : "Upload resume"}
                    </button>
                    {c.live && STAGE_INDEX[c.stage] < STAGE_INDEX.joined ? (
                      <button type="button" className="block w-full px-3 py-1.5 text-left text-xs text-critical hover:bg-critical-soft" onClick={() => open("close")}>
                        Close candidate
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto border-t border-divider px-4 py-3">
          <StageTracker stage={c.stage} outcome={c.outcome} />
        </div>
        <NextStep data={data} caps={caps} open={open} />
      </section>

      <section className="rounded-card border border-border bg-surface shadow-card">
        <div className="px-4 pt-1">
          <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Candidate sections" />
        </div>
        <div className="p-4">
          {tab === "overview" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="Profile" className="lg:col-span-2">
                <DetailGrid
                  items={[
                    ["Qualification", c.qualification],
                    ["Experience", c.experienceYears != null ? `${c.experienceYears} yrs` : ""],
                    ["Current company", c.currentCompany],
                    ["Current designation", c.currentDesignation],
                    ["Current location", c.currentLocation],
                    ["Notice period", c.noticePeriodDays != null ? `${c.noticePeriodDays} days` : ""],
                    ["Expected salary", c.expectedSalary != null ? fmtMoney(c.expectedSalary) : ""],
                    ["Recruiter", c.recruiter],
                    ["Added on", `${fmtDate(c.addedOn)}${c.addedBy ? ` by ${c.addedBy}` : ""}`],
                    ["Expected joining", fmtDate(c.expectedJoining)],
                    ["Requisition", requisition ? `${requisition.requisitionNo} · ${requisition.designation}` : "Not linked"],
                    ["Resume", c.resume ? <FileButton candidateId={c.id} category="resume" file={c.resume} /> : "Not uploaded"],
                  ]}
                />
              </Card>
              <div className="space-y-4">
                {STAGE_INDEX[c.stage] >= STAGE_INDEX.offer_accepted ? (
                  <Card title="Joining readiness">
                    <ReadinessIndicator readiness={c.readiness} />
                  </Card>
                ) : null}
                <Card title="Status at a glance">
                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between"><dt className="text-ink-muted">Interview</dt><dd>{c.interviewStatus ? <StatusPill meta={interviewStatusMeta(c.interviewStatus)} /> : "—"}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-ink-muted">Offer</dt><dd>{c.offerStatus ? <StatusPill meta={offerStatusMeta(c.offerStatus)} /> : "—"}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-ink-muted">Appointment</dt><dd>{c.appointmentStatus ? <StatusPill meta={appointmentStatusMeta(c.appointmentStatus)} /> : "—"}</dd></div>
                    <div className="flex items-center justify-between gap-4"><dt className="text-ink-muted">Documents</dt><dd className="w-28">{c.documents.total ? <ProgressBar value={c.documents.verified} total={c.documents.total} tone="success" /> : "—"}</dd></div>
                  </dl>
                </Card>
              </div>
              <Card title="Recent activity" className="lg:col-span-3" right={<button type="button" className={btn.ghost} onClick={() => setTab("activity")}>Full timeline</button>}>
                <ActivityTimeline items={activity.slice(0, 4)} />
              </Card>
            </div>
          ) : null}

          {tab === "screening" ? (
            <div className="space-y-3">
              {caps.candidates && c.live ? (
                <button type="button" className={btn.secondary} onClick={() => open("screening")}>
                  <PhoneCall className="h-3.5 w-3.5" /> Log call / screening
                </button>
              ) : null}
              {screenings.length ? (
                <ul className="divide-y divide-divider rounded-lg border border-border">
                  {screenings.map((s) => (
                    <li key={s.id} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ink">
                          {s.kind === "call" ? `Call · ${CALL_OUTCOMES.find((o) => o.key === s.callOutcome)?.label || "—"}` : "Screening"}
                        </span>
                        <span className="flex items-center gap-2">
                          {s.result ? <StatusPill meta={SCREENING_RESULTS.find((r) => r.key === s.result)} size="xs" /> : null}
                          <span className="text-[11px] tabular-nums text-ink-muted">{fmtDateTime(s.at)}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-secondary">by {s.by || "—"}{s.followUpAt ? ` · follow up ${fmtDateTime(s.followUpAt)}` : ""}</p>
                      {s.notes ? <p className="mt-1 whitespace-pre-wrap text-[11px] text-ink">{s.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No calls or screening yet" />
              )}
            </div>
          ) : null}

          {tab === "interviews" ? (
            interviews.length ? (
              <ul className="divide-y divide-divider rounded-lg border border-border">
                {interviews.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => open("interview", i)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-row-hover focus:outline-none focus-visible:bg-accent-soft">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-ink">{i.round} · {i.mode}</span>
                        <span className="block text-[11px] text-ink-muted">{fmtDateTime(i.scheduledAt)} · {i.interviewer || "—"}</span>
                      </span>
                      {i.overallRating != null ? <span className="text-[11px] text-ink-secondary">★ {i.overallRating}</span> : null}
                      {i.recommendation ? <StatusPill meta={recommendationMeta(i.recommendation)} size="xs" /> : null}
                      <StatusPill meta={interviewStatusMeta(i.status)} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No interviews yet" message="Interviews are scheduled once the candidate is shortlisted." />
            )
          ) : null}

          {tab === "offers" ? (
            <div className="space-y-4">
              <Card title="Offers">
                {offers.length ? (
                  <ul className="divide-y divide-divider">
                    {offers.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[11px] text-ink">{o.offerNo || "Draft"}</span>
                          <span className="block text-[11px] text-ink-muted">
                            {o.position} · {o.monthlyGross != null ? `${fmtMoney(o.monthlyGross)} / month` : "Salary not set"} · Joining {fmtDate(o.joiningDate)}
                            {o.validUntil ? ` · valid until ${fmtDate(o.validUntil)}` : ""}
                          </span>
                          {o.responseNote || o.closedReason ? <span className="block text-[11px] text-ink-secondary">{o.responseNote || o.closedReason}</span> : null}
                        </span>
                        <StatusPill meta={offerStatusMeta(o.status)} />
                        <FileButton candidateId={c.id} category="offer" file={o.generatedDoc} label="Letter" />
                        {o.signedDoc ? <FileButton candidateId={c.id} category="offer" file={o.signedDoc} label="Signed copy" /> : null}
                        {caps.offers && o.status === "accepted" && !o.signedDoc ? (
                          <button type="button" className={btn.ghost} onClick={() => open("upload", { kind: "offer_signed", offer: o })}>
                            <Upload className="h-3.5 w-3.5" /> Signed copy
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No offer yet" message="Offers are prepared once the candidate is Selected." />
                )}
              </Card>
              <Card title="Appointment letters">
                {appointments.length ? (
                  <ul className="divide-y divide-divider">
                    {appointments.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[11px] text-ink">{a.letterNo}</span>
                          <span className="block text-[11px] text-ink-muted">
                            Joining {fmtDate(a.joiningDate)}{a.reportingTo ? ` · reports to ${a.reportingTo}` : ""}{a.signedOn ? ` · signed ${fmtDate(a.signedOn)}` : ""}
                          </span>
                          {a.closedReason ? <span className="block text-[11px] text-ink-secondary">{a.closedReason}</span> : null}
                        </span>
                        <StatusPill meta={appointmentStatusMeta(a.status)} />
                        <FileButton candidateId={c.id} category="appointment" file={a.generatedDoc} label="Letter" />
                        {a.signedDoc ? <FileButton candidateId={c.id} category="appointment" file={a.signedDoc} label="Signed copy" /> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No appointment letter yet" message="Appointment letters follow an accepted offer." />
                )}
              </Card>
            </div>
          ) : null}

          {tab === "documents" ? (
            documents.length ? (
              <DocumentChecklist candidate={c} documents={documents} canManage={Boolean(caps.documents)} />
            ) : (
              <EmptyState title="No documents requested yet" message="The document checklist opens after the signed appointment letter is received." />
            )
          ) : null}

          {tab === "communication" ? (
            communications.length ? (
              <ul className="divide-y divide-divider rounded-lg border border-border">
                {communications.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <Mail className="h-4 w-4 text-ink-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">{m.subject}</span>
                      <span className="block text-[11px] text-ink-muted">
                        {fmtDateTime(m.sentAt)} · {m.templateName}{m.sentBy ? ` · ${m.sentBy}` : ""}{m.relatedDocument ? ` · ${m.relatedDocument}` : ""}
                      </span>
                      {m.deliveryStatus === "failed" && m.error ? <span className="block text-[11px] text-critical">{m.error}</span> : null}
                    </span>
                    <StatusPill meta={deliveryStatusMeta(m.deliveryStatus)} />
                    {m.deliveryStatus === "failed" ? (
                      <button type="button" className={btn.ghost} onClick={() => runAction(() => retryCommunication(m.id), "Email resent")}>
                        <RotateCcw className="h-3.5 w-3.5" /> Retry
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Mail} title="No emails sent yet" />
            )
          ) : null}

          {tab === "activity" ? <ActivityTimeline items={activity} /> : null}
        </div>
      </section>

      <ScreeningModal open={is("screening")} candidate={c} onClose={close} />
      <ScheduleInterviewModal open={is("schedule")} candidate={c} onClose={close} />
      {is("interview") ? <InterviewDetailDrawer interview={interviews.find((i) => i.id === modal.payload?.id) || modal.payload} candidate={c} onClose={close} /> : null}
      <OfferModal open={is("offer")} candidate={c} offer={modal?.payload} onClose={close} />
      <OfferResponseModal open={is("offerResponse")} offer={modal?.payload} onClose={close} />
      <AppointmentModal open={is("appointment")} candidate={c} onClose={close} />
      <UploadModal open={is("upload")} kind={modal?.payload?.kind} offer={modal?.payload?.offer} appointment={modal?.payload?.appointment} candidateId={c.id} onClose={close} />
      <JoiningDateModal open={is("joiningDate")} candidate={c} onClose={close} />
      <MarkJoinedModal open={is("joined")} candidate={c} onClose={close} />
      <ConvertModal open={is("convert")} candidate={c} onClose={close} />
      <SendEmailModal open={is("email")} candidate={c} templateKey={modal?.payload?.templateKey} relatedId={modal?.payload?.relatedId} onClose={close} />
      <EditProfileModal open={is("edit")} candidate={c} onClose={close} />
      <ResumeModal open={is("resume")} candidate={c} onClose={close} />
      <NoteModal open={is("note")} candidate={c} onClose={close} />
      <CloseCandidateModal open={is("close")} candidate={c} onClose={close} />
      <ReasonModal
        open={is("reopen")}
        title="Reopen candidate"
        submitLabel="Reopen"
        tone="primary"
        onClose={close}
        onSubmit={async (reason) => {
          await reopenCandidate(c.id, reason, c.version);
          toast.success("Candidate reopened");
          close();
        }}
      />
      <ReasonModal
        open={is("withdrawOffer")}
        title="Withdraw offer"
        description="The candidate returns to Selected so a revised offer can be prepared."
        submitLabel="Withdraw offer"
        onClose={close}
        onSubmit={async (reason) => {
          await withdrawOffer(modal.payload.id, reason, modal.payload.version);
          toast.success("Offer withdrawn");
          close();
        }}
      />
      <ReasonModal
        open={is("cancelAppointment")}
        title="Cancel appointment letter"
        submitLabel="Cancel letter"
        onClose={close}
        onSubmit={async (reason) => {
          await cancelAppointment(modal.payload.id, reason, modal.payload.version);
          toast.success("Appointment letter cancelled");
          close();
        }}
      />
      <ReasonModal
        open={is("noShow")}
        title="Candidate did not join"
        description="Closes the candidate as No-show."
        submitLabel="Record no-show"
        onClose={close}
        onSubmit={async (reason) => {
          await markJoiningNoShow(c.id, reason, c.version);
          toast.success("No-show recorded");
          close();
        }}
      />
    </div>
  );
}

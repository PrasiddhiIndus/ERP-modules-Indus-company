/**
 * Workflow action forms shared by the recruitment pages. Each form calls one workflow action;
 * the server validates the transition and the form shows its message if the action is not allowed.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Link2, Upload, X } from "lucide-react";
import { toast } from "../../../lib/toast";
import { CALL_OUTCOMES, EMPLOYMENT_TYPES, SCREENING_RESULTS, TEMPLATE_PLACEHOLDERS, candidateStatusMeta, documentStatusMeta } from "./recruitmentConfig";
import {
  attachSignedOffer,
  convertToEmployee,
  createCandidate,
  generateAppointment,
  generateOffer,
  getSettings,
  listRequisitions,
  listTemplates,
  logScreening,
  markJoined,
  recordOfferResponse,
  recordSignedAppointment,
  reviewDocument,
  saveOfferDraft,
  searchEmployees,
  sendCommunication,
  setCandidateResume,
  submitDocument,
  updateJoining,
} from "./recruitmentService";
import { ActionModal, Field, FileButton, FilePicker, StatusPill, btn, fmtDate, inputClass, textareaClass } from "./RecruitmentUi";

const todayIso = () => new Date().toLocaleDateString("en-CA");

function newKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

// ---------------------------------------------------------------------------
// Employee picker (referrals)
// ---------------------------------------------------------------------------
function EmployeePicker({ value, onChange }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (term.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    timer.current = setTimeout(() => searchEmployees(term).then(setResults), 250);
    return () => clearTimeout(timer.current);
  }, [term]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-sunken px-2 py-1.5 text-xs">
        <span>
          {value.name} {value.code ? <span className="text-ink-muted">· {value.code}</span> : null}
        </span>
        <button type="button" className={btn.ghost} onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className={inputClass} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search employee name or code" />
      {results.length ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-card">
          {results.map((e) => (
            <li key={e.id}>
              <button type="button" className="w-full px-2 py-1.5 text-left text-xs hover:bg-surface-sunken" onClick={() => onChange(e)}>
                {e.name} <span className="text-ink-muted">{[e.code, e.designation].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add candidate (with duplicate detection)
// ---------------------------------------------------------------------------
const EMPTY_CANDIDATE = {
  fullName: "",
  phone: "",
  email: "",
  source: "",
  requisitionId: "",
  experienceYears: "",
  qualification: "",
  currentCompany: "",
  currentDesignation: "",
  currentLocation: "",
  expectedCtc: "",
  noticePeriodDays: "",
  referralNotes: "",
};

export function AddCandidateModal({ open, onClose, onCreated, defaultRequisitionId = "" }) {
  const [form, setForm] = useState(EMPTY_CANDIDATE);
  const [referrer, setReferrer] = useState(null);
  const [resume, setResume] = useState(null);
  const [options, setOptions] = useState({ sources: [], requisitions: [] });
  const [duplicate, setDuplicate] = useState(null);
  const keyRef = useRef(newKey());

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_CANDIDATE, requisitionId: defaultRequisitionId || "" });
    setReferrer(null);
    setResume(null);
    setDuplicate(null);
    keyRef.current = newKey();
    Promise.all([getSettings(), listRequisitions()])
      .then(([s, reqs]) => {
        setOptions({
          sources: s.sources,
          requisitions: reqs.filter((r) => ["approved", "open"].includes(r.status)),
        });
        setForm((f) => ({ ...f, source: f.source || s.sources[0] || "Direct application" }));
      })
      .catch(() => {});
  }, [open, defaultRequisitionId]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (["phone", "email"].includes(k)) setDuplicate(null);
  };
  const isReferral = form.source.trim().toLowerCase() === "referral";

  const submit = async () => {
    const payload = {
      ...form,
      referredByEmployeeId: isReferral ? referrer?.id : null,
    };
    const confirm = Boolean(duplicate && !duplicate.blocking);
    const out = await createCandidate(payload, { confirmDuplicate: confirm, requestKey: keyRef.current });
    if (out?.status === "duplicate") {
      setDuplicate(out);
      return;
    }
    const cand = out?.candidate;
    if (resume && cand?.id) {
      try {
        await setCandidateResume(cand.id, resume);
      } catch (err) {
        toast.error("Candidate added, resume not attached", err.message);
      }
    }
    toast.success("Candidate added", cand?.candidate_no);
    onCreated?.(cand);
  };

  return (
    <ActionModal
      open={open}
      title="Add candidate"
      onClose={onClose}
      widthClass="max-w-2xl"
      submitLabel={duplicate && !duplicate.blocking ? "Add anyway" : "Add candidate"}
      canSubmit={Boolean(form.fullName.trim() && (form.phone.trim() || form.email.trim()) && (!isReferral || referrer) && !duplicate?.blocking)}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name *" className="sm:col-span-2">
          <input className={inputClass} value={form.fullName} onChange={set("fullName")} autoFocus />
        </Field>
        <Field label="Mobile number">
          <input className={inputClass} inputMode="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Source">
          <select className={inputClass} value={form.source} onChange={set("source")}>
            {[...new Set([...options.sources, form.source].filter(Boolean))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Requisition">
          <select className={inputClass} value={form.requisitionId} onChange={set("requisitionId")}>
            <option value="">Not linked yet</option>
            {options.requisitions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.requisitionNo} · {r.designation}
              </option>
            ))}
          </select>
        </Field>
        {isReferral ? (
          <>
            <Field label="Referred by *">
              <EmployeePicker value={referrer} onChange={setReferrer} />
            </Field>
            <Field label="Referral notes">
              <input className={inputClass} value={form.referralNotes} onChange={set("referralNotes")} />
            </Field>
          </>
        ) : null}
      </div>

      <details className="rounded-md border border-divider px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-ink-secondary">Experience & resume (optional)</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Experience (years)">
            <input type="number" min={0} step="0.5" className={inputClass} value={form.experienceYears} onChange={set("experienceYears")} />
          </Field>
          <Field label="Qualification">
            <input className={inputClass} value={form.qualification} onChange={set("qualification")} />
          </Field>
          <Field label="Current company">
            <input className={inputClass} value={form.currentCompany} onChange={set("currentCompany")} />
          </Field>
          <Field label="Current designation">
            <input className={inputClass} value={form.currentDesignation} onChange={set("currentDesignation")} />
          </Field>
          <Field label="Current location">
            <input className={inputClass} value={form.currentLocation} onChange={set("currentLocation")} />
          </Field>
          <Field label="Expected salary (monthly)">
            <input type="number" min={0} className={inputClass} value={form.expectedCtc} onChange={set("expectedCtc")} />
          </Field>
          <Field label="Notice period (days)">
            <input type="number" min={0} className={inputClass} value={form.noticePeriodDays} onChange={set("noticePeriodDays")} />
          </Field>
          <FilePicker label="Resume" required={false} onChange={setResume} />
        </div>
      </details>

      {duplicate ? (
        <div className={`rounded-md border px-3 py-2 text-[11px] ${duplicate.blocking ? "border-critical-border bg-critical-soft" : "border-warning-border bg-warning-soft"}`}>
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <AlertTriangle className="h-3.5 w-3.5" />
            {duplicate.blocking
              ? "This person is already in an active recruitment pipeline. Continue with the existing record."
              : "A previous candidate has the same mobile number or email. Review before adding again."}
          </p>
          <ul className="mt-2 space-y-1">
            {duplicate.matches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <a href={`/app/admin/recruitment/candidates/${m.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-deep hover:underline">
                  {m.name} <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-ink-muted">
                  {m.candidateNo} · matched on {m.matchedOn} · added {fmtDate(m.createdAt)}
                </span>
                <StatusPill meta={candidateStatusMeta({ stage: m.stage, outcome: m.outcome })} size="xs" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ActionModal>
  );
}

// ---------------------------------------------------------------------------
// Call / screening log
// ---------------------------------------------------------------------------
export function ScreeningModal({ open, candidate, onClose }) {
  const [kind, setKind] = useState("call");
  const [callOutcome, setCallOutcome] = useState("connected");
  const [result, setResult] = useState("pass");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  useEffect(() => {
    if (open) {
      setKind("call");
      setCallOutcome("connected");
      setResult("pass");
      setNotes("");
      setFollowUpAt("");
    }
  }, [open]);
  return (
    <ActionModal
      open={open}
      title={`Log call / screening · ${candidate?.name || ""}`}
      onClose={onClose}
      canSubmit={kind === "call" || notes.trim().length > 0}
      onSubmit={async () => {
        await logScreening(candidate.id, {
          kind,
          callOutcome: kind === "call" ? callOutcome : null,
          result: kind === "screening" ? result : null,
          notes,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
        });
        toast.success(kind === "call" ? "Call logged" : "Screening recorded");
        onClose();
      }}
    >
      <Field label="Entry">
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="call">Call attempt</option>
          <option value="screening">Screening result</option>
        </select>
      </Field>
      {kind === "call" ? (
        <Field label="Call outcome">
          <select className={inputClass} value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)}>
            {CALL_OUTCOMES.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Screening result">
          <select className={inputClass} value={result} onChange={(e) => setResult(e.target.value)}>
            {SCREENING_RESULTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={kind === "screening" ? "Notes *" : "Notes"}>
        <textarea className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Field label="Follow up on">
        <input type="datetime-local" className={inputClass} value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
      </Field>
      {kind === "screening" && result === "pass" ? <p className="text-[11px] text-ink-muted">A passed screening lets you shortlist the candidate.</p> : null}
    </ActionModal>
  );
}

// ---------------------------------------------------------------------------
// Offer draft / generate
// ---------------------------------------------------------------------------
export function OfferModal({ open, candidate, offer, onClose }) {
  const [form, setForm] = useState({});
  const [generate, setGenerate] = useState(true);
  useEffect(() => {
    if (!open) return;
    setGenerate(true);
    setForm({
      designation: offer?.position || candidate?.designation || "",
      department: offer?.department || candidate?.department || "",
      location: offer?.location || candidate?.site || "",
      employmentType: offer?.employmentType || "Permanent",
      monthlyGross: offer?.monthlyGross ?? "",
      joiningDate: offer?.joiningDate || candidate?.expectedJoining || "",
      terms: offer?.terms || "",
    });
  }, [open, offer, candidate]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <ActionModal
      open={open}
      title={offer ? `Edit offer · ${candidate?.name || ""}` : `Prepare offer · ${candidate?.name || ""}`}
      onClose={onClose}
      widthClass="max-w-xl"
      submitLabel={generate ? "Save & generate offer" : "Save draft"}
      canSubmit={Boolean(form.designation?.trim())}
      onSubmit={async () => {
        const payload = { ...form, monthlyGross: form.monthlyGross === "" ? null : Number(form.monthlyGross) };
        const saved = await saveOfferDraft(candidate.id, offer?.id, payload, offer?.version);
        if (generate) {
          await generateOffer(saved.id, saved.version);
          toast.success("Offer generated", "Send it to the candidate from the offer card.");
        } else {
          toast.success("Offer draft saved");
        }
        onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Position *">
          <input className={inputClass} value={form.designation || ""} onChange={set("designation")} />
        </Field>
        <Field label="Department">
          <input className={inputClass} value={form.department || ""} onChange={set("department")} />
        </Field>
        <Field label="Location">
          <input className={inputClass} value={form.location || ""} onChange={set("location")} />
        </Field>
        <Field label="Employment type">
          <select className={inputClass} value={form.employmentType || "Permanent"} onChange={set("employmentType")}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Monthly gross (₹)">
          <input type="number" min={0} className={inputClass} value={form.monthlyGross ?? ""} onChange={set("monthlyGross")} />
        </Field>
        <Field label="Proposed joining date">
          <input type="date" min={todayIso()} className={inputClass} value={form.joiningDate || ""} onChange={set("joiningDate")} />
        </Field>
        <Field label="Additional terms" className="sm:col-span-2">
          <textarea className={textareaClass} value={form.terms || ""} onChange={set("terms")} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} />
        Generate the offer now (assigns the reference number, validity and letter)
      </label>
    </ActionModal>
  );
}

export function OfferResponseModal({ open, offer, onClose }) {
  const [response, setResponse] = useState("accepted");
  const [note, setNote] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  useEffect(() => {
    if (open) {
      setResponse("accepted");
      setNote("");
      setJoiningDate(offer?.joiningDate || "");
    }
  }, [open, offer]);
  return (
    <ActionModal
      open={open}
      title={`Record response · ${offer?.offerNo || ""}`}
      description="Use this when the candidate replied by phone or email instead of the secure link."
      onClose={onClose}
      tone={response === "declined" ? "danger" : "primary"}
      submitLabel={response === "accepted" ? "Record acceptance" : "Record decline"}
      canSubmit={note.trim().length > 0}
      onSubmit={async () => {
        await recordOfferResponse(offer.id, response, note.trim(), response === "accepted" ? joiningDate : null, offer.version);
        toast.success(response === "accepted" ? "Offer accepted" : "Offer declined");
        onClose();
      }}
    >
      <Field label="Response">
        <select className={inputClass} value={response} onChange={(e) => setResponse(e.target.value)}>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
        </select>
      </Field>
      {response === "accepted" ? (
        <Field label="Confirmed joining date">
          <input type="date" min={todayIso()} className={inputClass} value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
        </Field>
      ) : null}
      <Field label="How was it confirmed? *">
        <textarea className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Accepted on call with recruiter, 12 Oct" />
      </Field>
    </ActionModal>
  );
}

// ---------------------------------------------------------------------------
// Appointment letter
// ---------------------------------------------------------------------------
export function AppointmentModal({ open, candidate, onClose }) {
  const [joiningDate, setJoiningDate] = useState("");
  const [reportingTo, setReportingTo] = useState("");
  const [terms, setTerms] = useState("");
  useEffect(() => {
    if (open) {
      setJoiningDate(candidate?.expectedJoining || "");
      setReportingTo("");
      setTerms("");
    }
  }, [open, candidate]);
  return (
    <ActionModal
      open={open}
      title={`Appointment letter · ${candidate?.name || ""}`}
      description="Salary, position and location are taken from the accepted offer."
      onClose={onClose}
      submitLabel="Generate letter"
      canSubmit={Boolean(joiningDate)}
      onSubmit={async () => {
        await generateAppointment(candidate.id, { joiningDate, reportingTo, terms });
        toast.success("Appointment letter generated", "Send it to the candidate for signature.");
        onClose();
      }}
    >
      <Field label="Joining date *">
        <input type="date" min={todayIso()} className={inputClass} value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
      </Field>
      <Field label="Reporting to">
        <input className={inputClass} value={reportingTo} onChange={(e) => setReportingTo(e.target.value)} />
      </Field>
      <Field label="Additional terms">
        <textarea className={textareaClass} value={terms} onChange={(e) => setTerms(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

// ---------------------------------------------------------------------------
// Uploads (signed letters, documents)
// ---------------------------------------------------------------------------
/** kind: offer_signed | appointment_signed | document */
export function UploadModal({ open, kind, offer, appointment, candidateId, document, onClose }) {
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (open) setFile(null);
  }, [open]);
  const titles = {
    offer_signed: "Upload signed offer",
    appointment_signed: "Upload signed appointment letter",
    document: `Upload ${document?.docLabel || "document"}`,
  };
  return (
    <ActionModal
      open={open}
      title={titles[kind] || "Upload"}
      description={kind === "appointment_signed" ? "Recording the signed letter starts document collection." : undefined}
      onClose={onClose}
      submitLabel="Upload"
      canSubmit={Boolean(file)}
      onSubmit={async () => {
        if (kind === "offer_signed") await attachSignedOffer(offer, file);
        else if (kind === "appointment_signed") await recordSignedAppointment(appointment, file);
        else await submitDocument(candidateId, document.docKey, file);
        toast.success("File uploaded");
        onClose();
      }}
    >
      <FilePicker onChange={setFile} />
    </ActionModal>
  );
}

/** A candidate's joining document checklist with upload and review actions. */
export function DocumentChecklist({ candidate, documents, canManage }) {
  const [upload, setUpload] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const collecting = candidate.live && ["documents", "ready_to_join"].includes(candidate.stage);
  const review = async (doc, action, why) => {
    try {
      await reviewDocument(doc.id, action, why, doc.version);
      toast.success(action === "verify" ? `${doc.docLabel} verified` : action === "reject" ? `${doc.docLabel} rejected` : "Review started");
      return true;
    } catch (err) {
      toast.error("Could not update document", err.message);
      return false;
    }
  };
  return (
    <>
      <ul className="divide-y divide-divider rounded-lg border border-border">
        {documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-ink">
                {d.docLabel} {d.required ? null : <span className="text-[10px] text-ink-muted">(optional)</span>}
              </span>
              <span className="block text-[11px] text-ink-muted">
                {d.submittedOn ? `Submitted ${fmtDate(d.submittedOn)}${d.submittedVia === "candidate_link" ? " by candidate" : ""}` : "Not uploaded"}
                {d.reviewedBy ? ` · reviewed by ${d.reviewedBy}` : ""}
              </span>
              {d.status === "rejected" && d.remarks ? <span className="block text-[11px] text-critical">{d.remarks}</span> : null}
            </span>
            <StatusPill meta={documentStatusMeta(d.status)} />
            <FileButton candidateId={candidate.id} category="document" file={d.file} label="View" />
            {canManage && collecting ? (
              <span className="flex flex-wrap gap-1">
                {["pending", "rejected", "submitted"].includes(d.status) ? (
                  <button type="button" className={btn.ghost} onClick={() => setUpload(d)}>
                    <Upload className="h-3.5 w-3.5" /> {d.status === "pending" ? "Upload" : "Replace"}
                  </button>
                ) : null}
                {d.status === "submitted" ? (
                  <button type="button" className={btn.ghost} onClick={() => review(d, "start_review")}>
                    Start review
                  </button>
                ) : null}
                {["submitted", "under_review"].includes(d.status) ? (
                  <>
                    <button type="button" className={btn.ghost} onClick={() => review(d, "verify")}>
                      <Check className="h-3.5 w-3.5" /> Verify
                    </button>
                    <button
                      type="button"
                      className={btn.ghost}
                      onClick={() => {
                        setReason("");
                        setRejecting(d);
                      }}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <UploadModal open={Boolean(upload)} kind="document" candidateId={candidate.id} document={upload} onClose={() => setUpload(null)} />
      <ActionModal
        open={Boolean(rejecting)}
        title={`Reject ${rejecting?.docLabel || "document"}`}
        description="The candidate is asked to resubmit with this reason."
        tone="danger"
        submitLabel="Reject"
        canSubmit={reason.trim().length > 0}
        onClose={() => setRejecting(null)}
        onSubmit={async () => {
          await reviewDocument(rejecting.id, "reject", reason.trim(), rejecting.version);
          toast.success(`${rejecting.docLabel} rejected`);
          setRejecting(null);
        }}
      >
        <Field label="Reason *">
          <textarea className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </ActionModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------
export function JoiningDateModal({ open, candidate, onClose }) {
  const [date, setDate] = useState("");
  const [remarks, setRemarks] = useState("");
  useEffect(() => {
    if (open) {
      setDate(candidate?.expectedJoining || "");
      setRemarks(candidate?.joiningRemarks || "");
    }
  }, [open, candidate]);
  return (
    <ActionModal
      open={open}
      title={`Joining date · ${candidate?.name || ""}`}
      onClose={onClose}
      canSubmit={Boolean(date)}
      onSubmit={async () => {
        await updateJoining(candidate.id, date, remarks, candidate.version);
        toast.success("Joining date updated");
        onClose();
      }}
    >
      <Field label="Expected joining date *">
        <input type="date" min={todayIso()} className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Remarks">
        <textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

export function MarkJoinedModal({ open, candidate, onClose }) {
  const [date, setDate] = useState(todayIso());
  const [remarks, setRemarks] = useState("");
  useEffect(() => {
    if (open) {
      setDate(todayIso());
      setRemarks("");
    }
  }, [open]);
  return (
    <ActionModal
      open={open}
      title={`Mark joined · ${candidate?.name || ""}`}
      onClose={onClose}
      submitLabel="Mark joined"
      canSubmit={Boolean(date)}
      onSubmit={async () => {
        const out = await markJoined(candidate.id, date, remarks, candidate.version);
        const conv = out?.conversion;
        if (conv?.status === "converted") toast.success("Joined and employee created", conv.employeeCode ? `Employee code ${conv.employeeCode}` : undefined);
        else if (conv?.status === "duplicate") toast.success("Marked joined", "A matching employee exists — review it under Employee Conversion.");
        else if (conv?.status === "failed") toast.success("Marked joined", "Employee creation needs attention under Employee Conversion.");
        else toast.success("Marked joined");
        onClose();
      }}
    >
      <Field label="Actual joining date *">
        <input type="date" max={todayIso()} className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Remarks">
        <textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
    </ActionModal>
  );
}

// ---------------------------------------------------------------------------
// Employee conversion
// ---------------------------------------------------------------------------
export function ConvertModal({ open, candidate, onClose, onConverted }) {
  const [code, setCode] = useState("");
  const [matches, setMatches] = useState(null);
  const [linkId, setLinkId] = useState(null);
  useEffect(() => {
    if (open) {
      setCode("");
      setMatches(null);
      setLinkId(null);
    }
  }, [open]);
  return (
    <ActionModal
      open={open}
      title={`Create employee · ${candidate?.name || ""}`}
      description="Creates the Employee Master record from the recruitment details. Existing employees are never changed."
      onClose={onClose}
      submitLabel={matches ? (linkId ? "Link to selected employee" : "Select an employee") : "Create employee"}
      canSubmit={!matches || Boolean(linkId)}
      onSubmit={async () => {
        const out = await convertToEmployee(candidate.id, matches ? { linkEmployeeId: linkId } : { employeeCode: code.trim() });
        if (out?.status === "duplicate") {
          setMatches(out.matches || []);
          return;
        }
        toast.success(out?.linked ? "Linked to existing employee" : "Employee created", out?.employeeCode ? `Employee code ${out.employeeCode}` : undefined);
        onConverted?.(out);
        onClose();
      }}
    >
      {!matches ? (
        <Field label="Employee code (optional)">
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Leave blank to assign automatically" />
        </Field>
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-2 py-1.5 text-[11px] text-ink">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            An active employee already has this mobile number or email. Link this candidate to that employee instead of creating a duplicate.
          </p>
          {matches.map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${linkId === m.id ? "border-accent bg-accent-soft" : "border-border"}`}>
              <input type="radio" name="link-employee" checked={linkId === m.id} onChange={() => setLinkId(m.id)} />
              <Link2 className="h-3.5 w-3.5 text-ink-muted" />
              <span className="font-medium">{m.name}</span>
              <span className="text-ink-muted">{[m.employeeCode, m.employeeId, m.designation, m.status].filter(Boolean).join(" · ")}</span>
            </label>
          ))}
        </div>
      )}
    </ActionModal>
  );
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
/**
 * Sends a template email. `candidates` (optional) enables choosing the recipient; otherwise `candidate` is fixed.
 * `templateKey` pre-selects a template; `relatedId` ties it to an interview / offer / appointment.
 */
export function SendEmailModal({ open, candidate, candidates, templateKey, relatedId, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [key, setKey] = useState(templateKey || "general");
  const [candidateId, setCandidateId] = useState(candidate?.id || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const idemRef = useRef(newKey());

  useEffect(() => {
    if (!open) return;
    idemRef.current = newKey();
    setKey(templateKey || "general");
    setCandidateId(candidate?.id || "");
    listTemplates()
      .then((rows) => setTemplates(rows.filter((t) => t.active)))
      .catch(() => setTemplates([]));
  }, [open, templateKey, candidate]);

  const tpl = useMemo(() => templates.find((t) => t.key === key), [templates, key]);
  useEffect(() => {
    setSubject(tpl?.subject || "");
    setBody(tpl?.body || "");
  }, [tpl]);

  const recipient = candidate || candidates?.find((c) => c.id === candidateId);
  return (
    <ActionModal
      open={open}
      title="Send email"
      onClose={onClose}
      widthClass="max-w-2xl"
      submitLabel="Send"
      canSubmit={Boolean(recipient?.id && tpl && subject.trim() && body.trim())}
      onSubmit={async () => {
        const out = await sendCommunication({
          candidateId: recipient.id,
          templateKey: key,
          relatedId: key === templateKey ? relatedId : undefined,
          subject: subject === tpl.subject ? null : subject,
          body: body === tpl.body ? null : body,
          idempotencyKey: `manual:${idemRef.current}`,
        });
        if (out?.delivered === false || out?.communication?.status === "failed") {
          throw new Error(out?.communication?.error || "The email could not be delivered. It is saved in history and can be retried.");
        }
        toast.success(out?.alreadyHandled ? "Email already sent" : "Email sent", recipient.email);
        onClose();
      }}
    >
      {candidate ? (
        <p className="text-xs text-ink-secondary">
          To: <span className="font-medium text-ink">{candidate.name}</span> {candidate.email ? `<${candidate.email}>` : "(no email on file)"}
        </p>
      ) : (
        <Field label="Candidate *">
          <select className={inputClass} value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
            <option value="">Select candidate</option>
            {(candidates || [])
              .filter((c) => c.email)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="Template">
        <select className={inputClass} value={key} onChange={(e) => setKey(e.target.value)}>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subject *">
        <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Message *">
        <textarea className={`${textareaClass} min-h-[180px] font-mono`} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <p className="text-[10px] text-ink-muted">
        Placeholders such as {TEMPLATE_PLACEHOLDERS.slice(0, 4).join(", ")} are filled in automatically when the email is sent.
      </p>
    </ActionModal>
  );
}

/**
 * In-house Recruitment data service.
 *
 * Reads come straight from the recruitment records (access is enforced server-side); every change goes
 * through a workflow action that validates the transition, records who did it and keeps the history.
 * Files, letters and emails go through the company API server.
 */
import { supabase } from "../../../lib/supabase";
import { fetchApiWithAuth } from "../../../lib/apiBase";
import { PIPELINE_STAGES, STAGE_INDEX } from "./recruitmentConfig";

export const RECRUITMENT_DATA_EVENT = "admin-recruitment-data-updated";

const T = {
  requisitions: "admin_recruitment_requisitions",
  candidates: "admin_recruitment_candidates",
  overview: "admin_recruitment_candidate_overview",
  screenings: "admin_recruitment_screenings",
  interviews: "admin_recruitment_interviews",
  offers: "admin_recruitment_offers",
  appointments: "admin_recruitment_appointments",
  documents: "admin_recruitment_candidate_documents",
  documentTypes: "admin_recruitment_document_types",
  templates: "admin_recruitment_templates",
  communications: "admin_recruitment_communications",
  events: "admin_recruitment_events",
  settings: "admin_recruitment_settings",
};

const PAGE = 1000;

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(RECRUITMENT_DATA_EVENT));
}

function friendly(error, fallback) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "").trim();
  if (code === "42501") return msg && !/row-level security|permission denied for/i.test(msg) ? msg : "You do not have permission for this action.";
  if (code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205") {
    console.error("[recruitment]", error);
    return "Recruitment is being updated. Please refresh in a minute.";
  }
  if (code === "P0001" || code === "40001") return msg || fallback;
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Could not reach the server. Check your connection and try again.";
  console.error("[recruitment]", error);
  return fallback;
}

async function selectAll(table, columns = "*", build = (q) => q) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(supabase.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) throw new Error(friendly(error, "Could not load recruitment data."));
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function call(fn, args, fallback = "The action could not be completed.") {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendly(error, fallback));
  notify();
  return data;
}

async function api(path, body, fallback) {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetchApiWithAuth(path, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(res.error || fallback);
  return res.data;
}

const requestKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const num = (v) => (v == null || v === "" ? null : Number(v));

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------
const rank = (stage) => STAGE_INDEX[stage] ?? -1;

function readinessFor(c) {
  const r = rank(c.stage);
  const docsDone = c.docs_required_total > 0 ? c.docs_required_verified >= c.docs_required_total : r >= rank("documents");
  const checks = [
    { key: "offer", label: "Offer accepted", ok: r >= rank("offer_accepted") },
    { key: "appointment", label: "Appointment letter signed", ok: r >= rank("documents") },
    { key: "documents", label: "Mandatory documents verified", ok: r >= rank("documents") && docsDone },
    { key: "date", label: "Joining date set", ok: Boolean(c.expected_joining_date || c.actual_joining_date) },
  ];
  const done = checks.filter((x) => x.ok).length;
  return { checks, done, total: checks.length, ready: r >= rank("ready_to_join") && done === checks.length };
}

function mapCandidate(c) {
  const total = Number(c.docs_required_total || 0);
  const verified = Number(c.docs_required_verified || 0);
  return {
    id: c.id,
    candidateNo: c.candidate_no,
    name: c.full_name,
    phone: c.phone || "",
    email: c.email || "",
    alternatePhone: c.alternate_phone || "",
    gender: c.gender || "",
    dateOfBirth: c.date_of_birth,
    designation: c.requisition_designation || c.current_designation || "",
    department: c.requisition_department || "",
    requisitionId: c.requisition_id,
    requisitionNo: c.requisition_no || "",
    requisitionStatus: c.requisition_status || "",
    stage: c.stage,
    outcome: c.outcome || "",
    outcomeReason: c.outcome_reason || "",
    live: !c.outcome && c.stage !== "employee_created",
    source: c.source,
    referredByName: c.referred_by_name || "",
    referredByEmployeeId: c.referred_by_employee_id,
    referralNotes: c.referral_notes || "",
    experienceYears: num(c.experience_years),
    site: c.requisition_location || c.current_location || "",
    currentLocation: c.current_location || "",
    currentCompany: c.current_company || "",
    currentDesignation: c.current_designation || "",
    currentCtc: num(c.current_ctc),
    expectedSalary: num(c.expected_ctc),
    noticePeriodDays: c.notice_period_days,
    qualification: c.qualification || "",
    skills: c.skills || "",
    homeTown: c.home_town || "",
    expectedJoining: c.expected_joining_date,
    actualJoining: c.actual_joining_date,
    joiningRemarks: c.joining_remarks || "",
    addedOn: c.created_at,
    addedBy: c.created_by_name || "",
    lastActivityAt: c.last_activity_at,
    recruiter: c.recruiter_name || "",
    recruiterId: c.recruiter_id,
    resume: c.resume || null,
    employeeCode: c.employee_code || "",
    employeeSystemId: c.employee_system_id || "",
    employeeMasterId: c.employee_master_id,
    convertedAt: c.converted_at,
    convertedBy: c.converted_by_name || "",
    conversionStatus: c.stage === "employee_created" ? "converted" : "pending",
    interviewStatus: c.latest_interview_status || "",
    nextInterviewAt: c.next_interview_at,
    offerId: c.offer_id,
    offerStatus: c.offer_status || "",
    offerRef: c.offer_ref || "",
    offerValidUntil: c.offer_valid_until,
    appointmentId: c.appointment_id,
    appointmentStatus: c.appointment_status || "",
    appointmentRef: c.appointment_ref || "",
    documents: { total, verified, pending: Math.max(0, total - verified), toReview: Number(c.docs_to_review || 0) },
    readiness: readinessFor(c),
    version: c.version,
  };
}

function mapRequisition(r, candidateCount = 0) {
  return {
    id: r.id,
    requisitionNo: r.requisition_no,
    source: r.source,
    designation: r.designation,
    department: r.department || "",
    positions: r.openings,
    filled: r.filled_count,
    location: r.location || "",
    employmentType: r.employment_type || "",
    experienceMin: num(r.experience_min),
    experienceMax: num(r.experience_max),
    skills: r.skills || "",
    qualification: r.qualification || "",
    requiredBy: r.required_by,
    justification: r.reason || "",
    otherRequirements: r.other_requirements || "",
    priority: r.priority,
    status: r.status,
    statusReason: r.status_reason || "",
    approvalLevelsRequired: r.approval_levels_required,
    approvalLevelDone: r.approval_level_done,
    raisedBy: r.raised_by_name || "",
    raisedById: r.raised_by,
    raisedOn: r.created_at,
    submittedAt: r.submitted_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by_name || "",
    version: r.version,
    candidateCount,
  };
}

const MODE_LABEL = { office: "Office", online: "Online", phone: "Phone" };

function mapInterview(i) {
  const cand = i.candidate || {};
  const interviewers = Array.isArray(i.interviewers) ? i.interviewers : [];
  return {
    id: i.id,
    candidateId: i.candidate_id,
    candidateName: cand.full_name || "",
    candidatePhone: cand.phone || "",
    candidateLive: cand.outcome == null && cand.stage !== "employee_created",
    candidateStage: cand.stage,
    position: cand.requisition?.designation || "",
    requisitionNo: cand.requisition?.requisition_no || "",
    round: i.round_name,
    roundNo: i.round_no,
    scheduledAt: i.scheduled_at,
    durationMins: i.duration_mins,
    modeKey: i.mode,
    mode: MODE_LABEL[i.mode] || i.mode,
    location: i.location || "",
    interviewers,
    interviewer: interviewers.map((x) => x?.name).filter(Boolean).join(", "),
    status: i.status,
    statusReason: i.status_reason || "",
    rescheduledFrom: i.rescheduled_from,
    attendedAt: i.attended_at,
    ratings: i.ratings || null,
    overallRating: num(i.overall_rating),
    recommendation: i.recommendation || "",
    remarks: i.remarks || "",
    evaluatedBy: i.evaluated_by_name || "",
    evaluatedAt: i.evaluated_at,
    inviteSentAt: i.invite_sent_at,
    reminderSentAt: i.reminder_sent_at,
    createdBy: i.created_by_name || "",
    version: i.version,
  };
}

function mapOffer(o) {
  const cand = o.candidate || {};
  return {
    id: o.id,
    candidateId: o.candidate_id,
    candidateName: cand.full_name || "",
    candidateEmail: cand.email || "",
    candidateStage: cand.stage,
    candidateLive: cand.outcome == null && cand.stage !== "employee_created",
    offerNo: o.offer_ref || "",
    status: o.status,
    position: o.designation,
    department: o.department || "",
    location: o.location || "",
    employmentType: o.employment_type || "",
    monthlyGross: num(o.monthly_gross),
    annualCtc: num(o.annual_ctc),
    joiningDate: o.joining_date,
    validUntil: o.valid_until,
    terms: o.terms || "",
    generatedDoc: o.generated_doc || null,
    signedDoc: o.signed_doc || null,
    generatedOn: o.generated_at,
    generatedBy: o.generated_by_name || "",
    sentOn: o.sent_at,
    sendCount: o.send_count,
    viewedOn: o.viewed_at,
    respondedAt: o.responded_at,
    signedOn: o.signed_doc?.uploadedAt || null,
    responseNote: o.response_note || "",
    responseChannel: o.response_channel || "",
    responseRecordedBy: o.response_recorded_by_name || "",
    closedReason: o.closed_reason || "",
    reminderCount: o.reminder_count,
    createdOn: o.created_at,
    version: o.version,
  };
}

function mapAppointment(a) {
  const cand = a.candidate || {};
  return {
    id: a.id,
    candidateId: a.candidate_id,
    candidateName: cand.full_name || "",
    candidateEmail: cand.email || "",
    candidateLive: cand.outcome == null && cand.stage !== "employee_created",
    offerId: a.offer_id,
    letterNo: a.appointment_ref,
    status: a.status,
    position: a.designation,
    department: a.department || "",
    location: a.location || "",
    employmentType: a.employment_type || "",
    monthlyGross: num(a.monthly_gross),
    joiningDate: a.joining_date,
    reportingTo: a.reporting_to || "",
    terms: a.terms || "",
    generatedDoc: a.generated_doc || null,
    signedDoc: a.signed_doc || null,
    generatedOn: a.generated_at,
    generatedBy: a.generated_by_name || "",
    sentOn: a.sent_at,
    sendCount: a.send_count,
    viewedOn: a.viewed_at,
    signedOn: a.signed_at,
    signedChannel: a.signed_channel || "",
    closedReason: a.closed_reason || "",
    createdOn: a.created_at,
    version: a.version,
  };
}

function mapDocument(d) {
  const cand = d.candidate || {};
  return {
    id: d.id,
    candidateId: d.candidate_id,
    candidateName: cand.full_name || "",
    candidateStage: cand.stage,
    candidateLive: cand.outcome == null && cand.stage !== "employee_created",
    docKey: d.document_key,
    docLabel: d.label,
    required: d.required,
    status: d.status,
    file: d.file || null,
    fileName: d.file?.fileName || "",
    submittedOn: d.submitted_at,
    submittedVia: d.submitted_via || "",
    submissionCount: d.submission_count,
    reviewedBy: d.reviewed_by_name || "",
    reviewedAt: d.reviewed_at,
    remarks: d.rejection_reason || "",
    version: d.version,
  };
}

function mapTemplate(t) {
  return {
    id: t.key,
    key: t.key,
    type: t.key,
    name: t.name,
    category: t.category,
    subject: t.subject,
    body: t.body,
    active: t.active,
    isSystem: t.is_system,
    updatedOn: t.updated_at,
    updatedBy: t.updated_by_name || "System",
  };
}

function mapCommunication(m, templateNames = {}) {
  return {
    id: m.id,
    candidateId: m.candidate_id,
    candidateName: m.candidate?.full_name || "",
    recipient: m.recipient,
    subject: m.subject,
    body: m.body || "",
    templateType: m.template_key || "",
    templateName: templateNames[m.template_key] || (m.template_key ? m.template_key.replace(/_/g, " ") : "Custom email"),
    sentAt: m.sent_at || m.created_at,
    createdAt: m.created_at,
    deliveryStatus: m.status,
    error: m.error || "",
    attempts: m.attempts,
    trigger: m.trigger,
    relatedType: m.related_type || "",
    relatedDocument: Array.isArray(m.attachments) && m.attachments.length ? m.attachments.map((a) => a.fileName).join(", ") : "",
    sentBy: m.created_by_name || (m.trigger === "automation" ? "Automation" : ""),
  };
}

function mapEvent(e) {
  return {
    id: String(e.id),
    type: e.action,
    entityType: e.entity_type,
    at: e.created_at,
    by: e.actor_name || (e.actor_kind === "system" ? "System" : "—"),
    actorKind: e.actor_kind,
    note: e.summary || "",
    from: e.from_status,
    to: e.to_status,
    details: e.details || {},
  };
}

function mapSettings(s, types) {
  return {
    companyName: s?.company_name || "",
    offerValidityDays: s?.offer_validity_days ?? 7,
    approvalLevels: s?.approval_levels ?? 1,
    portalLinkDays: s?.portal_link_days ?? 14,
    autoReminders: s?.auto_reminders || {},
    interviewReminderHours: s?.interview_reminder_hours ?? 24,
    offerReminderDays: s?.offer_reminder_days ?? 2,
    documentReminderDays: s?.document_reminder_days ?? 2,
    joiningReminderDays: s?.joining_reminder_days ?? 1,
    maxReminders: s?.max_reminders ?? 3,
    autoConvertOnJoin: Boolean(s?.auto_convert_on_join),
    sources: Array.isArray(s?.sources) ? s.sources : [],
    interviewers: (Array.isArray(s?.interviewers) ? s.interviewers : []).map((x) => (typeof x === "string" ? { name: x, email: "" } : { name: x?.name || "", email: x?.email || "" })),
    evaluationCriteria: Array.isArray(s?.evaluation_criteria) ? s.evaluation_criteria : [],
    documentTypes: (types || []).map((t) => ({ key: t.key, label: t.label, description: t.description || "", required: t.required, active: t.active, sortOrder: t.sort_order })),
  };
}

const CANDIDATE_EMBED = "candidate:admin_recruitment_candidates(full_name, phone, email, stage, outcome, requisition:admin_recruitment_requisitions(requisition_no, designation))";

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------
let capsCache = null;
let capsAt = 0;

/** What the signed-in user may do (the server enforces the same rules). */
export async function getCapabilities({ fresh = false } = {}) {
  if (!fresh && capsCache && Date.now() - capsAt < 60_000) return capsCache;
  const { data, error } = await supabase.rpc("admin_recruitment_my_capabilities");
  if (error) throw new Error(friendly(error, "Could not check your recruitment access."));
  capsCache = data || {};
  capsAt = Date.now();
  return capsCache;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listRequisitions() {
  const [rows, cands] = await Promise.all([
    selectAll(T.requisitions, "*", (q) => q.order("created_at", { ascending: false })),
    selectAll(T.candidates, "requisition_id"),
  ]);
  const counts = cands.reduce((acc, c) => {
    if (c.requisition_id) acc[c.requisition_id] = (acc[c.requisition_id] || 0) + 1;
    return acc;
  }, {});
  return rows.map((r) => mapRequisition(r, counts[r.id] || 0));
}

export async function getRequisitionHistory(requisitionId) {
  const rows = await selectAll(T.events, "*", (q) => q.eq("requisition_id", requisitionId).eq("entity_type", "requisition").order("created_at", { ascending: false }));
  return rows.map(mapEvent);
}

export async function countPendingApprovals() {
  const { count, error } = await supabase.from(T.requisitions).select("id", { count: "exact", head: true }).eq("status", "pending_approval");
  if (error) return 0;
  return count || 0;
}

/** Small counts for the section navigation. */
export async function getNavBadges() {
  const head = (table, build) => build(supabase.from(table).select("id", { count: "exact", head: true })).then(({ count }) => count || 0);
  const [requisitions, documents, conversion] = await Promise.all([
    head(T.requisitions, (q) => q.eq("status", "pending_approval")),
    head(T.overview, (q) => q.is("outcome", null).in("stage", ["documents", "ready_to_join"]).gt("docs_to_review", 0)),
    head(T.candidates, (q) => q.is("outcome", null).eq("stage", "joined")),
  ]);
  return { requisitions, documents, conversion };
}

export async function listCandidates() {
  const rows = await selectAll(T.overview, "*", (q) => q.order("last_activity_at", { ascending: false }));
  return rows.map(mapCandidate);
}

export async function getCandidateWorkspace(id) {
  const { data: row, error } = await supabase.from(T.overview).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(friendly(error, "Could not load the candidate."));
  if (!row) throw new Error("Candidate not found.");
  const [reqRes, screenings, interviews, offers, appointments, documents, comms, events, templates] = await Promise.all([
    row.requisition_id ? supabase.from(T.requisitions).select("*").eq("id", row.requisition_id).maybeSingle() : Promise.resolve({ data: null }),
    selectAll(T.screenings, "*", (q) => q.eq("candidate_id", id).order("created_at", { ascending: false })),
    selectAll(T.interviews, `*, ${CANDIDATE_EMBED}`, (q) => q.eq("candidate_id", id).order("scheduled_at", { ascending: false })),
    selectAll(T.offers, `*, ${CANDIDATE_EMBED}`, (q) => q.eq("candidate_id", id).order("created_at", { ascending: false })),
    selectAll(T.appointments, `*, ${CANDIDATE_EMBED}`, (q) => q.eq("candidate_id", id).order("created_at", { ascending: false })),
    selectAll(T.documents, `*, ${CANDIDATE_EMBED}`, (q) => q.eq("candidate_id", id)),
    selectAll(T.communications, `*, ${CANDIDATE_EMBED}`, (q) => q.eq("candidate_id", id).order("created_at", { ascending: false })),
    selectAll(T.events, "*", (q) => q.eq("candidate_id", id).order("created_at", { ascending: false })),
    selectAll(T.templates, "key, name"),
  ]);
  const names = Object.fromEntries(templates.map((t) => [t.key, t.name]));
  return {
    candidate: mapCandidate(row),
    requisition: reqRes?.data ? mapRequisition(reqRes.data) : null,
    screenings: screenings.map((s) => ({
      id: s.id,
      kind: s.kind,
      callOutcome: s.call_outcome || "",
      result: s.result || "",
      notes: s.notes || "",
      followUpAt: s.follow_up_at,
      by: s.created_by_name || "",
      at: s.created_at,
    })),
    interviews: interviews.map(mapInterview),
    offers: offers.map(mapOffer),
    appointments: appointments.map(mapAppointment),
    documents: documents.map(mapDocument),
    communications: comms.map((m) => mapCommunication(m, names)),
    activity: events.map(mapEvent),
  };
}

export async function listInterviews() {
  return (await selectAll(T.interviews, `*, ${CANDIDATE_EMBED}`, (q) => q.order("scheduled_at", { ascending: false }))).map(mapInterview);
}

export async function listOffers() {
  return (await selectAll(T.offers, `*, ${CANDIDATE_EMBED}`, (q) => q.order("created_at", { ascending: false }))).map(mapOffer);
}

export async function listAppointments() {
  return (await selectAll(T.appointments, `*, ${CANDIDATE_EMBED}`, (q) => q.order("created_at", { ascending: false }))).map(mapAppointment);
}

export async function listDocuments() {
  return (await selectAll(T.documents, `*, ${CANDIDATE_EMBED}`)).map(mapDocument);
}

export async function listTemplates() {
  return (await selectAll(T.templates, "*", (q) => q.order("category").order("name"))).map(mapTemplate);
}

export async function listCommunications() {
  const [rows, templates] = await Promise.all([
    selectAll(T.communications, `*, ${CANDIDATE_EMBED}`, (q) => q.order("created_at", { ascending: false })),
    selectAll(T.templates, "key, name"),
  ]);
  const names = Object.fromEntries(templates.map((t) => [t.key, t.name]));
  return rows.map((m) => mapCommunication(m, names));
}

export async function getSettings() {
  const [{ data: s, error }, types] = await Promise.all([
    supabase.from(T.settings).select("*").maybeSingle(),
    selectAll(T.documentTypes, "*", (q) => q.order("sort_order")),
  ]);
  if (error) throw new Error(friendly(error, "Could not load recruitment settings."));
  return mapSettings(s, types);
}

export async function searchEmployees(term) {
  const q = String(term || "").trim();
  if (q.length < 2) return [];
  const safe = q.replace(/[%,()]/g, " ");
  const { data, error } = await supabase
    .from("admin_ifsp_employee_master")
    .select("id, full_name, employee_code, designation")
    .or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`)
    .limit(15);
  if (error) return [];
  return (data || []).map((e) => ({ id: e.id, name: e.full_name, code: e.employee_code || "", designation: e.designation || "" }));
}

export async function getDashboardSummary() {
  const [candidates, requisitions, interviews, offers, documents] = await Promise.all([
    listCandidates(),
    selectAll(T.requisitions, "id, designation, status, openings, filled_count"),
    selectAll(T.interviews, `*, ${CANDIDATE_EMBED}`, (q) => q.in("status", ["scheduled", "attended", "evaluated", "no_show"])),
    selectAll(T.offers, "status"),
    selectAll(T.documents, "status, required, candidate:admin_recruitment_candidates(stage, outcome)"),
  ]);
  const today = new Date().toLocaleDateString("en-CA");
  const in14 = new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-CA");
  const live = candidates.filter((c) => c.live);
  const mappedInterviews = interviews.map(mapInterview);
  const offerCounts = offers.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {});
  const liveDocs = documents.filter((d) => d.candidate && d.candidate.outcome == null && ["documents", "ready_to_join"].includes(d.candidate.stage));
  return {
    openRequisitions: requisitions.filter((r) => ["approved", "open"].includes(r.status)).length,
    pendingRequisitions: requisitions.filter((r) => r.status === "pending_approval").length,
    totalCandidates: live.length,
    stageCounts: PIPELINE_STAGES.map((s) => ({ ...s, count: live.filter((c) => c.stage === s.key).length })),
    interviewsToday: mappedInterviews.filter((i) => i.status === "scheduled" && new Date(i.scheduledAt).toLocaleDateString("en-CA") === today),
    interviewsAttended: mappedInterviews.filter((i) => ["attended", "evaluated"].includes(i.status)).length,
    interviewsNoShow: mappedInterviews.filter((i) => i.status === "no_show").length,
    offersPending: (offerCounts.generated || 0) + (offerCounts.sent || 0) + (offerCounts.viewed || 0) + (offerCounts.draft || 0),
    offerCounts,
    documentsPending: liveDocs.filter((d) => d.required && d.status !== "verified").length,
    documentsToReview: liveDocs.filter((d) => ["submitted", "under_review"].includes(d.status)).length,
    upcomingJoinings: live
      .filter((c) => rank(c.stage) >= rank("offer_accepted") && rank(c.stage) < rank("joined") && c.expectedJoining && c.expectedJoining >= today && c.expectedJoining <= in14)
      .sort((a, b) => a.expectedJoining.localeCompare(b.expectedJoining)),
    positions: requisitions
      .filter((r) => ["approved", "open", "filled"].includes(r.status))
      .map((r) => ({ id: r.id, label: r.designation, required: r.openings, filled: r.filled_count })),
    readyToConvert: candidates.filter((c) => c.stage === "joined" && !c.outcome).length,
  };
}

// ---------------------------------------------------------------------------
// Requisitions
// ---------------------------------------------------------------------------
export function saveRequisition(id, payload, version) {
  return call("admin_recruitment_requisition_save", { p_id: id || null, p_payload: payload, p_expected_version: version ?? null }, "Could not save the requisition.");
}

export function submitRequisition(id, version) {
  return call("admin_recruitment_requisition_submit", { p_id: id, p_expected_version: version ?? null }, "Could not submit the requisition.");
}

export function decideRequisition(id, decision, remarks, version) {
  return call("admin_recruitment_requisition_decide", { p_id: id, p_decision: decision, p_remarks: remarks || null, p_expected_version: version ?? null }, "Could not record the decision.");
}

/** action: open | fill | cancel | reopen */
export function transitionRequisition(id, action, remarks, version) {
  return call("admin_recruitment_requisition_transition", { p_id: id, p_action: action, p_remarks: remarks || null, p_expected_version: version ?? null }, "Could not update the requisition.");
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
/** Returns { status: 'created', candidate } or { status: 'duplicate', blocking, matches }. */
export async function createCandidate(payload, { confirmDuplicate = false, requestKey: key } = {}) {
  return call(
    "admin_recruitment_candidate_create",
    { p_payload: payload, p_confirm_duplicate: confirmDuplicate, p_request_key: key || requestKey() },
    "Could not add the candidate."
  );
}

export function updateCandidate(id, payload, version) {
  return call("admin_recruitment_candidate_update", { p_id: id, p_payload: payload, p_expected_version: version ?? null }, "Could not update the candidate.");
}

export function addCandidateNote(id, note) {
  return call("admin_recruitment_candidate_note", { p_id: id, p_note: note }, "Could not add the note.");
}

export function logScreening(candidateId, payload) {
  return call("admin_recruitment_screening_log", { p_candidate_id: candidateId, p_payload: payload }, "Could not save the entry.");
}

export function moveCandidateStage(id, stage, note, version) {
  return call("admin_recruitment_candidate_move", { p_id: id, p_to: stage, p_note: note || null, p_expected_version: version ?? null }, "Could not move the candidate.");
}

export function closeCandidate(id, outcome, reason, version) {
  return call("admin_recruitment_candidate_close", { p_id: id, p_outcome: outcome, p_reason: reason, p_expected_version: version ?? null }, "Could not close the candidate.");
}

export function reopenCandidate(id, reason, version) {
  return call("admin_recruitment_candidate_reopen", { p_id: id, p_reason: reason, p_expected_version: version ?? null }, "Could not reopen the candidate.");
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
/** category: resume | offer | appointment | document */
export async function uploadCandidateFile(candidateId, category, file) {
  const form = new FormData();
  form.append("candidateId", candidateId);
  form.append("category", category);
  form.append("fileName", file.name);
  form.append("file", file);
  const out = await api("/api/admin-recruitment/files/upload", form, "Upload failed.");
  return out.file;
}

export async function getFileUrl(candidateId, category, file, { download = false } = {}) {
  if (!file?.objectKey) throw new Error("No file available.");
  const out = await api(
    "/api/admin-recruitment/files/presign",
    { candidateId, category, objectKey: file.objectKey, fileName: file.fileName, download },
    "Could not open the file."
  );
  return out.url;
}

export async function setCandidateResume(candidateId, file) {
  const stored = await uploadCandidateFile(candidateId, "resume", file);
  return call("admin_recruitment_candidate_set_resume", { p_id: candidateId, p_file: stored }, "Could not attach the resume.");
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------
export function scheduleInterview(candidateId, payload) {
  return call("admin_recruitment_interview_schedule", { p_candidate_id: candidateId, p_payload: payload, p_request_key: requestKey() }, "Could not schedule the interview.");
}

/** status: attended | no_show | cancelled */
export function setInterviewStatus(id, status, reason, { closeCandidate: close = false, version } = {}) {
  return call(
    "admin_recruitment_interview_set_status",
    { p_id: id, p_status: status, p_reason: reason || null, p_close_candidate: close, p_expected_version: version ?? null },
    "Could not update the interview."
  );
}

export function rescheduleInterview(id, payload, version) {
  return call("admin_recruitment_interview_reschedule", { p_id: id, p_payload: payload, p_expected_version: version ?? null }, "Could not reschedule the interview.");
}

export function evaluateInterview(id, { ratings, recommendation, remarks }, version) {
  return call(
    "admin_recruitment_interview_evaluate",
    { p_id: id, p_ratings: ratings, p_recommendation: recommendation, p_remarks: remarks || null, p_expected_version: version ?? null },
    "Could not save the evaluation."
  );
}

// ---------------------------------------------------------------------------
// Offers & appointment letters
// ---------------------------------------------------------------------------
export function saveOfferDraft(candidateId, offerId, payload, version) {
  return call("admin_recruitment_offer_save_draft", { p_candidate_id: candidateId, p_offer_id: offerId || null, p_payload: payload, p_expected_version: version ?? null }, "Could not save the offer.");
}

async function prepareLetter(kind, id) {
  const out = await api("/api/admin-recruitment/letters/generate", { kind, id }, "Could not prepare the letter document.");
  notify();
  return out.file;
}

/** Generates the offer (reference + validity) and prepares the letter document. */
export async function generateOffer(offerId, version) {
  const offer = await call("admin_recruitment_offer_generate", { p_offer_id: offerId, p_expected_version: version ?? null }, "Could not generate the offer.");
  try {
    await prepareLetter("offer", offerId);
  } catch (err) {
    throw new Error(`Offer generated, but the letter document could not be prepared: ${err.message} Use "Prepare letter" to retry.`);
  }
  return offer;
}

export function prepareOfferLetter(offerId) {
  return prepareLetter("offer", offerId);
}

export function recordOfferResponse(offerId, response, note, joiningDate, version) {
  return call(
    "admin_recruitment_offer_record_response",
    { p_offer_id: offerId, p_response: response, p_note: note, p_joining_date: joiningDate || null, p_expected_version: version ?? null },
    "Could not record the response."
  );
}

export function withdrawOffer(offerId, reason, version) {
  return call("admin_recruitment_offer_withdraw", { p_offer_id: offerId, p_reason: reason, p_expected_version: version ?? null }, "Could not withdraw the offer.");
}

export async function attachSignedOffer(offer, file) {
  const stored = await uploadCandidateFile(offer.candidateId, "offer", file);
  return call("admin_recruitment_offer_attach_signed", { p_offer_id: offer.id, p_file: stored }, "Could not store the signed offer.");
}

export async function generateAppointment(candidateId, payload) {
  const appt = await call("admin_recruitment_appointment_generate", { p_candidate_id: candidateId, p_payload: payload, p_request_key: requestKey() }, "Could not generate the appointment letter.");
  try {
    await prepareLetter("appointment", appt.id);
  } catch (err) {
    throw new Error(`Appointment letter created, but the document could not be prepared: ${err.message} Use "Prepare letter" to retry.`);
  }
  return appt;
}

export function prepareAppointmentLetter(appointmentId) {
  return prepareLetter("appointment", appointmentId);
}

export async function recordSignedAppointment(appointment, file) {
  const stored = await uploadCandidateFile(appointment.candidateId, "appointment", file);
  return call("admin_recruitment_appointment_record_signed", { p_appointment_id: appointment.id, p_file: stored, p_expected_version: appointment.version ?? null }, "Could not store the signed letter.");
}

export function cancelAppointment(appointmentId, reason, version) {
  return call("admin_recruitment_appointment_cancel", { p_appointment_id: appointmentId, p_reason: reason, p_expected_version: version ?? null }, "Could not cancel the appointment letter.");
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function submitDocument(candidateId, documentKey, file) {
  const stored = await uploadCandidateFile(candidateId, "document", file);
  return call("admin_recruitment_document_submit", { p_candidate_id: candidateId, p_document_key: documentKey, p_file: stored }, "Could not submit the document.");
}

/** action: start_review | verify | reject */
export function reviewDocument(documentId, action, reason, version) {
  return call("admin_recruitment_document_review", { p_document_id: documentId, p_action: action, p_reason: reason || null, p_expected_version: version ?? null }, "Could not update the document.");
}

// ---------------------------------------------------------------------------
// Joining & conversion
// ---------------------------------------------------------------------------
export function updateJoining(candidateId, expectedDate, remarks, version) {
  return call("admin_recruitment_joining_update", { p_candidate_id: candidateId, p_expected_date: expectedDate, p_remarks: remarks || null, p_expected_version: version ?? null }, "Could not update the joining date.");
}

export function markJoined(candidateId, actualDate, remarks, version) {
  return call("admin_recruitment_mark_joined", { p_candidate_id: candidateId, p_actual_date: actualDate, p_remarks: remarks || null, p_expected_version: version ?? null }, "Could not mark the candidate as joined.");
}

export function markJoiningNoShow(candidateId, reason, version) {
  return call("admin_recruitment_mark_joining_no_show", { p_candidate_id: candidateId, p_reason: reason, p_expected_version: version ?? null }, "Could not record the no-show.");
}

/** Returns { status: 'converted', employeeMasterId, employeeCode, ... } or { status: 'duplicate', matches }. */
export function convertToEmployee(candidateId, { employeeCode, linkEmployeeId } = {}) {
  return call(
    "admin_recruitment_convert_to_employee",
    { p_candidate_id: candidateId, p_employee_code: employeeCode || null, p_link_employee_id: linkEmployeeId || null },
    "Could not create the employee."
  );
}

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------
export async function sendCommunication({ candidateId, templateKey, relatedType, relatedId, subject, body, idempotencyKey }) {
  const out = await api(
    "/api/admin-recruitment/communications/send",
    { candidateId, templateKey, relatedType, relatedId, subject, body, idempotencyKey: idempotencyKey || `manual:${requestKey()}` },
    "Could not send the email."
  );
  notify();
  return out;
}

export async function retryCommunication(id) {
  const out = await api(`/api/admin-recruitment/communications/${id}/retry`, {}, "Could not resend the email.");
  notify();
  return out;
}

export function saveTemplate(template) {
  return call(
    "admin_recruitment_template_save",
    {
      p_key: template.key || null,
      p_name: template.name,
      p_category: template.category || "general",
      p_subject: template.subject,
      p_body: template.body,
      p_active: template.active !== false,
    },
    "Could not save the template."
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export function saveSettings(settings) {
  return call(
    "admin_recruitment_settings_save",
    {
      p_payload: {
        companyName: settings.companyName,
        offerValidityDays: settings.offerValidityDays,
        approvalLevels: settings.approvalLevels,
        portalLinkDays: settings.portalLinkDays,
        autoReminders: settings.autoReminders,
        interviewReminderHours: settings.interviewReminderHours,
        offerReminderDays: settings.offerReminderDays,
        documentReminderDays: settings.documentReminderDays,
        joiningReminderDays: settings.joiningReminderDays,
        maxReminders: settings.maxReminders,
        autoConvertOnJoin: settings.autoConvertOnJoin,
        sources: settings.sources,
        interviewers: settings.interviewers,
        evaluationCriteria: settings.evaluationCriteria,
      },
    },
    "Could not save settings."
  );
}

export function saveDocumentType(doc) {
  return call(
    "admin_recruitment_document_type_save",
    {
      p_key: doc.key || null,
      p_label: doc.label,
      p_description: doc.description || null,
      p_required: doc.required !== false,
      p_active: doc.active !== false,
      p_sort_order: doc.sortOrder ?? null,
    },
    "Could not save the document type."
  );
}

export async function runRemindersNow() {
  const out = await api("/api/admin-recruitment/automation/run", {}, "Could not run reminders.");
  notify();
  return out;
}

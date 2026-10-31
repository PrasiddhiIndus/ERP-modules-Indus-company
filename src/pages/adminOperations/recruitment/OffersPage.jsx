import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileSignature, Send, Upload, UserRound, XCircle } from "lucide-react";
import { Drawer } from "../components/AdminUi";
import { toast } from "../../../lib/toast";
import { APPOINTMENT_STATUSES, OFFER_STATUSES, appointmentStatusMeta, offerStatusMeta } from "./recruitmentConfig";
import { cancelAppointment, listAppointments, listOffers, prepareAppointmentLetter, prepareOfferLetter, withdrawOffer } from "./recruitmentService";
import {
  AsyncBoundary,
  DataTable,
  DetailGrid,
  FileButton,
  ReasonModal,
  SearchBox,
  StatusPill,
  Tabs,
  btn,
  fmtDate,
  fmtMoney,
  runAction,
  runBusyAction,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import { AppointmentModal, OfferResponseModal, SendEmailModal, UploadModal } from "./RecruitmentForms";

async function loadLetters() {
  const [offers, appointments] = await Promise.all([listOffers(), listAppointments()]);
  return { offers, appointments };
}

/** Accepted offers that do not yet have a live appointment letter. */
function pendingAppointmentRows(offers = [], appointments = []) {
  const hasLiveAppt = new Set(
    appointments.filter((a) => a.status !== "cancelled").map((a) => a.candidateId)
  );
  return offers
    .filter((o) => o.status === "accepted" && o.candidateLive && !hasLiveAppt.has(o.candidateId))
    .map((o) => ({
      id: `ready:${o.id}`,
      readyOfferId: o.id,
      pendingAppointment: true,
      candidateId: o.candidateId,
      candidateName: o.candidateName,
      candidateEmail: o.candidateEmail,
      candidateLive: o.candidateLive,
      letterNo: "",
      status: "ready",
      position: o.position,
      department: o.department,
      location: o.location,
      monthlyGross: o.monthlyGross,
      joiningDate: o.joiningDate,
      reportingTo: "",
      terms: o.terms || "",
      generatedDoc: null,
      signedDoc: null,
      generatedOn: null,
      generatedBy: "",
      sentOn: null,
      sendCount: 0,
      viewedOn: null,
      signedOn: null,
      closedReason: "",
      createdOn: o.respondedAt || o.createdOn,
      version: o.version,
    }));
}

const KINDS = {
  offer: { statuses: OFFER_STATUSES, meta: offerStatusMeta, numberKey: "offerNo", numberLabel: "Offer no.", title: "Offer", category: "offer" },
  appointment: { statuses: APPOINTMENT_STATUSES, meta: appointmentStatusMeta, numberKey: "letterNo", numberLabel: "Letter no.", title: "Appointment letter", category: "appointment" },
};

export default function OffersPage() {
  const caps = useCapabilities();
  const { data, loading, error, reload } = useRecruitmentData(loadLetters);
  const [kindKey, setKindKey] = useState("offer");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [modal, setModal] = useState(null);

  const kind = KINDS[kindKey];
  const offers = data?.offers || [];
  const appointments = data?.appointments || [];
  const readyRows = useMemo(() => pendingAppointmentRows(offers, appointments), [offers, appointments]);
  const candidateHasAppointment = useMemo(() => {
    const set = new Set(appointments.filter((a) => a.status !== "cancelled").map((a) => a.candidateId));
    return (candidateId) => set.has(candidateId);
  }, [appointments]);

  const rows = useMemo(() => {
    if (kindKey === "offer") return offers;
    // Appointment letters tab: show ready-to-generate accepted offers + existing letters.
    return [...readyRows, ...appointments];
  }, [kindKey, offers, appointments, readyRows]);

  const counts = useMemo(() => rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (q && ![r.candidateName, r.position, r[kind.numberKey]].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, status, search, kind]);

  const open = rows.find((r) => r.id === openId) || null;
  const close = () => setModal(null);
  const canAct = caps.offers && open?.candidateLive;

  const appointmentCandidate =
    modal?.name === "appointment" && modal?.candidate
      ? modal.candidate
      : open
        ? {
            id: open.candidateId,
            name: open.candidateName,
            expectedJoining: open.joiningDate || "",
          }
        : null;

  const openAppointmentModal = (row) => {
    setModal({
      name: "appointment",
      candidate: {
        id: row.candidateId,
        name: row.candidateName,
        email: row.candidateEmail || "",
        expectedJoining: row.joiningDate || "",
      },
    });
  };

  const columns = [
    { key: "candidateName", label: "Candidate", render: (r) => <span className="font-medium">{r.candidateName}</span> },
    { key: "position", label: "Position" },
    { key: kind.numberKey, label: kind.numberLabel, render: (r) => <span className="font-mono text-[11px]">{r[kind.numberKey] || (r.pendingAppointment ? "—" : "Draft")}</span> },
    ...(kindKey === "offer" ? [{ key: "monthlyGross", label: "Salary / month", align: "right", render: (r) => (r.monthlyGross != null ? fmtMoney(r.monthlyGross) : "—") }] : []),
    { key: "joiningDate", label: "Joining", render: (r) => fmtDate(r.joiningDate) },
    ...(kindKey === "offer" ? [{ key: "validUntil", label: "Valid until", render: (r) => fmtDate(r.validUntil) }] : []),
    { key: "sentOn", label: "Sent", render: (r) => (r.pendingAppointment ? <span className="text-ink-muted">—</span> : fmtDate(r.sentOn)) },
    { key: "viewedOn", label: "Viewed", render: (r) => (r.pendingAppointment ? <span className="text-ink-muted">—</span> : r.viewedOn ? <span className="text-success">{fmtDate(r.viewedOn)}</span> : <span className="text-ink-muted">No</span>) },
    { key: "signedOn", label: "Signed", render: (r) => (r.pendingAppointment ? <span className="text-ink-muted">—</span> : r.signedDoc ? <span className="text-success">{fmtDate(r.signedOn)}</span> : <span className="text-ink-muted">—</span>) },
    { key: "status", label: "Status", render: (r) => <StatusPill meta={kind.meta(r.status)} /> },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="px-4 pt-1">
          <Tabs
            ariaLabel="Letter type"
            value={kindKey}
            onChange={(k) => {
              setKindKey(k);
              setStatus("");
            }}
            tabs={[
              { key: "offer", label: "Offers", count: offers.length },
              { key: "appointment", label: "Appointment letters", count: appointments.length + readyRows.length },
            ]}
          />
        </div>
        <div className="space-y-3 px-4 py-3">
          {kindKey === "appointment" && readyRows.length ? (
            <p className="rounded-md border border-success-border bg-success-soft px-3 py-2 text-[11px] text-success">
              {readyRows.length} accepted offer{readyRows.length === 1 ? "" : "s"} ready for an appointment letter. Open a row and choose Generate letter.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            <button type="button" onClick={() => setStatus("")} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${!status ? "border-accent bg-accent text-white" : "border-border text-ink-secondary hover:bg-surface-sunken"}`} aria-pressed={!status}>
              All · {rows.length}
            </button>
            {kind.statuses.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(s.key)}
                aria-pressed={status === s.key}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${status === s.key ? "border-accent bg-accent text-white" : "border-border text-ink-secondary hover:bg-surface-sunken"}`}
              >
                {s.label} · {counts[s.key] || 0}
              </button>
            ))}
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="Search candidate, position, number…" className="w-full sm:w-72" />
        </div>
        <div className="px-4 pb-4">
          <AsyncBoundary loading={loading} error={error} onRetry={reload}>
            <DataTable
              columns={columns}
              rows={filtered}
              onRowClick={(r) => setOpenId(r.id)}
              initialSort={{ key: "sentOn", dir: "desc" }}
              emptyTitle={kindKey === "offer" ? "No offers" : "No appointment letters"}
              emptyMessage={
                kindKey === "offer"
                  ? "Offers are prepared from the candidate's profile once they are Selected."
                  : "When a candidate accepts an offer, they appear here so you can generate the appointment letter."
              }
            />
          </AsyncBoundary>
        </div>
      </div>

      <Drawer open={Boolean(open)} title={open ? `${kind.title} · ${open.candidateName}` : ""} onClose={() => setOpenId(null)} widthClass="max-w-lg">
        {open ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill meta={kind.meta(open.status)} />
              <span className="font-mono text-[11px] text-ink-muted">{open[kind.numberKey] || (open.pendingAppointment ? "Not generated yet" : "Draft")}</span>
            </div>
            {open.closedReason || open.responseNote ? <p className="rounded-md bg-surface-sunken px-3 py-2 text-[11px] text-ink-secondary">{open.closedReason || open.responseNote}</p> : null}
            <DetailGrid
              items={[
                ["Position", open.position],
                ["Location", open.location],
                ...(kindKey === "offer" ? [["Salary / month", open.monthlyGross != null ? fmtMoney(open.monthlyGross) : ""], ["Valid until", fmtDate(open.validUntil)]] : [["Reporting to", open.reportingTo || (open.pendingAppointment ? "Set when generating" : "")]]),
                ["Joining date", fmtDate(open.joiningDate)],
                ["Generated", open.generatedOn ? `${fmtDate(open.generatedOn)}${open.generatedBy ? ` by ${open.generatedBy}` : ""}` : ""],
                ["Sent", open.sentOn ? `${fmtDate(open.sentOn)}${open.sendCount > 1 ? ` (${open.sendCount}×)` : ""}` : ""],
                ["Viewed", fmtDate(open.viewedOn)],
                ["Signed", open.signedDoc ? fmtDate(open.signedOn) : ""],
                ...(kindKey === "offer" && open.respondedAt ? [["Responded", `${fmtDate(open.respondedAt)} · ${open.responseChannel === "candidate_link" ? "via secure link" : `recorded by ${open.responseRecordedBy || "staff"}`}`]] : []),
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {!open.pendingAppointment ? (
                <FileButton candidateId={open.candidateId} category={kind.category} file={open.generatedDoc} label="Generated letter" className={btn.secondary} />
              ) : null}
              {open.signedDoc ? <FileButton candidateId={open.candidateId} category={kind.category} file={open.signedDoc} label="Signed copy" className={btn.secondary} /> : null}
              <Link to={`../candidates/${open.candidateId}`} className={btn.secondary}>
                <UserRound className="h-3.5 w-3.5" /> Candidate
              </Link>
            </div>

            {canAct ? (
              <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
                {kindKey === "offer" ? (
                  <>
                    {open.status !== "draft" && !open.generatedDoc && ["generated", "sent", "viewed", "accepted"].includes(open.status) ? (
                      <button
                        type="button"
                        className={btn.primary}
                        onClick={() => runBusyAction(() => prepareOfferLetter(open.id), "Offer letter ready", undefined, "Generating offer letter…")}
                      >
                        <FileSignature className="h-3.5 w-3.5" /> Prepare letter
                      </button>
                    ) : null}
                    {open.generatedDoc && ["generated", "sent", "viewed", "accepted"].includes(open.status) ? (
                      <button
                        type="button"
                        className={btn.secondary}
                        onClick={() =>
                          runBusyAction(() => prepareOfferLetter(open.id), "Offer letter regenerated", undefined, "Regenerating offer letter…")
                        }
                      >
                        <FileSignature className="h-3.5 w-3.5" /> Regenerate letter
                      </button>
                    ) : null}
                    {["generated", "sent", "viewed"].includes(open.status) && open.generatedDoc ? (
                      <button type="button" className={btn.primary} onClick={() => setModal({ name: "email", templateKey: "offer_letter" })}>
                        <Send className="h-3.5 w-3.5" /> {open.status === "generated" ? "Send offer" : "Resend offer"}
                      </button>
                    ) : null}
                    {["sent", "viewed"].includes(open.status) ? (
                      <button type="button" className={btn.secondary} onClick={() => setModal({ name: "response" })}>
                        Record response
                      </button>
                    ) : null}
                    {open.status === "accepted" && !candidateHasAppointment(open.candidateId) ? (
                      <button type="button" className={btn.primary} onClick={() => openAppointmentModal(open)}>
                        <FileSignature className="h-3.5 w-3.5" /> Generate appointment letter
                      </button>
                    ) : null}
                    {open.status === "accepted" && !open.signedDoc ? (
                      <button type="button" className={btn.secondary} onClick={() => setModal({ name: "upload", kind: "offer_signed" })}>
                        <Upload className="h-3.5 w-3.5" /> Upload signed copy
                      </button>
                    ) : null}
                    {["draft", "generated", "sent", "viewed"].includes(open.status) ? (
                      <button type="button" className={btn.ghost} onClick={() => setModal({ name: "withdraw" })}>
                        <XCircle className="h-3.5 w-3.5" /> {open.status === "draft" ? "Discard draft" : "Withdraw"}
                      </button>
                    ) : null}
                  </>
                ) : open.pendingAppointment ? (
                  <button type="button" className={btn.primary} onClick={() => openAppointmentModal(open)}>
                    <FileSignature className="h-3.5 w-3.5" /> Generate appointment letter
                  </button>
                ) : (
                  <>
                    {!open.generatedDoc && ["generated", "sent", "viewed", "signed"].includes(open.status) ? (
                      <button type="button" className={btn.primary} onClick={() => runAction(() => prepareAppointmentLetter(open.id), "Appointment letter ready")}>
                        <FileSignature className="h-3.5 w-3.5" /> Prepare letter
                      </button>
                    ) : null}
                    {open.generatedDoc && ["generated", "sent", "viewed", "signed"].includes(open.status) ? (
                      <button
                        type="button"
                        className={btn.secondary}
                        onClick={() => runAction(() => prepareAppointmentLetter(open.id), "Appointment letter regenerated")}
                      >
                        <FileSignature className="h-3.5 w-3.5" /> Regenerate letter
                      </button>
                    ) : null}
                    {["generated", "sent", "viewed"].includes(open.status) && open.generatedDoc ? (
                      <button
                        type="button"
                        className={btn.primary}
                        onClick={() => setModal({ name: "email", templateKey: "appointment_letter", relatedId: open.id })}
                      >
                        <Send className="h-3.5 w-3.5" /> {open.status === "generated" ? "Send appointment letter" : "Resend appointment letter"}
                      </button>
                    ) : null}
                    {["generated", "sent", "viewed"].includes(open.status) ? (
                      <button type="button" className={btn.secondary} onClick={() => setModal({ name: "upload", kind: "appointment_signed" })}>
                        <Upload className="h-3.5 w-3.5" /> Upload signed copy
                      </button>
                    ) : null}
                    {["generated", "sent", "viewed"].includes(open.status) ? (
                      <button type="button" className={btn.ghost} onClick={() => setModal({ name: "cancel" })}>
                        <XCircle className="h-3.5 w-3.5" /> Cancel letter
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <AppointmentModal
        open={modal?.name === "appointment"}
        candidate={appointmentCandidate}
        onClose={close}
        onGenerated={(appt) => {
          const id = appt?.id;
          const fromCandidate = appointmentCandidate;
          setKindKey("appointment");
          setStatus("");
          if (id) {
            setOpenId(id);
            setModal({
              name: "email",
              templateKey: "appointment_letter",
              relatedId: id,
              candidate: fromCandidate
                ? {
                    id: fromCandidate.id,
                    name: fromCandidate.name,
                    email: fromCandidate.email || "",
                  }
                : null,
            });
          }
        }}
      />

      <SendEmailModal
        open={modal?.name === "email"}
        candidate={
          modal?.candidate ||
          (open
            ? { id: open.candidateId, name: open.candidateName, email: open.candidateEmail }
            : null)
        }
        templateKey={modal?.templateKey}
        relatedId={modal?.relatedId || (open && !open.pendingAppointment ? open.id : null)}
        onClose={close}
      />

      {open ? (
        <>
          <OfferResponseModal
            open={modal?.name === "response"}
            offer={open}
            onClose={close}
            onRecorded={(response) => {
              if (response !== "accepted") return;
              setKindKey("appointment");
              setStatus("ready");
              setOpenId(`ready:${open.id}`);
              openAppointmentModal({
                candidateId: open.candidateId,
                candidateName: open.candidateName,
                candidateEmail: open.candidateEmail,
                joiningDate: open.joiningDate,
              });
            }}
          />
          <UploadModal
            open={modal?.name === "upload"}
            kind={modal?.kind}
            offer={kindKey === "offer" ? open : null}
            appointment={kindKey === "appointment" && !open.pendingAppointment ? open : null}
            candidateId={open.candidateId}
            onClose={close}
          />
          <ReasonModal
            open={modal?.name === "withdraw"}
            title={open.status === "draft" ? "Discard offer draft" : "Withdraw offer"}
            description="The candidate returns to Selected so a revised offer can be prepared."
            submitLabel={open.status === "draft" ? "Discard" : "Withdraw"}
            onClose={close}
            onSubmit={async (reason) => {
              await withdrawOffer(open.id, reason, open.version);
              toast.success(open.status === "draft" ? "Draft discarded" : "Offer withdrawn");
              close();
            }}
          />
          <ReasonModal
            open={modal?.name === "cancel"}
            title="Cancel appointment letter"
            submitLabel="Cancel letter"
            onClose={close}
            onSubmit={async (reason) => {
              await cancelAppointment(open.id, reason, open.version);
              toast.success("Appointment letter cancelled");
              close();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

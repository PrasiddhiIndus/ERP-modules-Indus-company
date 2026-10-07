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
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import { OfferResponseModal, SendEmailModal, UploadModal } from "./RecruitmentForms";

async function loadLetters() {
  const [offers, appointments] = await Promise.all([listOffers(), listAppointments()]);
  return { offers, appointments };
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
  const rows = (kindKey === "offer" ? data?.offers : data?.appointments) || [];
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

  const columns = [
    { key: "candidateName", label: "Candidate", render: (r) => <span className="font-medium">{r.candidateName}</span> },
    { key: "position", label: "Position" },
    { key: kind.numberKey, label: kind.numberLabel, render: (r) => <span className="font-mono text-[11px]">{r[kind.numberKey] || "Draft"}</span> },
    ...(kindKey === "offer" ? [{ key: "monthlyGross", label: "Salary / month", align: "right", render: (r) => (r.monthlyGross != null ? fmtMoney(r.monthlyGross) : "—") }] : []),
    { key: "joiningDate", label: "Joining", render: (r) => fmtDate(r.joiningDate) },
    ...(kindKey === "offer" ? [{ key: "validUntil", label: "Valid until", render: (r) => fmtDate(r.validUntil) }] : []),
    { key: "sentOn", label: "Sent", render: (r) => fmtDate(r.sentOn) },
    { key: "viewedOn", label: "Viewed", render: (r) => (r.viewedOn ? <span className="text-success">{fmtDate(r.viewedOn)}</span> : <span className="text-ink-muted">No</span>) },
    { key: "signedOn", label: "Signed", render: (r) => (r.signedDoc ? <span className="text-success">{fmtDate(r.signedOn)}</span> : <span className="text-ink-muted">—</span>) },
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
              { key: "offer", label: "Offers", count: data?.offers?.length },
              { key: "appointment", label: "Appointment letters", count: data?.appointments?.length },
            ]}
          />
        </div>
        <div className="space-y-3 px-4 py-3">
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
              emptyMessage="Offers are prepared from the candidate's profile once they are Selected."
            />
          </AsyncBoundary>
        </div>
      </div>

      <Drawer open={Boolean(open)} title={open ? `${kind.title} · ${open.candidateName}` : ""} onClose={() => setOpenId(null)} widthClass="max-w-lg">
        {open ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill meta={kind.meta(open.status)} />
              <span className="font-mono text-[11px] text-ink-muted">{open[kind.numberKey] || "Draft"}</span>
            </div>
            {open.closedReason || open.responseNote ? <p className="rounded-md bg-surface-sunken px-3 py-2 text-[11px] text-ink-secondary">{open.closedReason || open.responseNote}</p> : null}
            <DetailGrid
              items={[
                ["Position", open.position],
                ["Location", open.location],
                ...(kindKey === "offer" ? [["Salary / month", open.monthlyGross != null ? fmtMoney(open.monthlyGross) : ""], ["Valid until", fmtDate(open.validUntil)]] : [["Reporting to", open.reportingTo]]),
                ["Joining date", fmtDate(open.joiningDate)],
                ["Generated", open.generatedOn ? `${fmtDate(open.generatedOn)}${open.generatedBy ? ` by ${open.generatedBy}` : ""}` : ""],
                ["Sent", open.sentOn ? `${fmtDate(open.sentOn)}${open.sendCount > 1 ? ` (${open.sendCount}×)` : ""}` : ""],
                ["Viewed", fmtDate(open.viewedOn)],
                ["Signed", open.signedDoc ? fmtDate(open.signedOn) : ""],
                ...(kindKey === "offer" && open.respondedAt ? [["Responded", `${fmtDate(open.respondedAt)} · ${open.responseChannel === "candidate_link" ? "via secure link" : `recorded by ${open.responseRecordedBy || "staff"}`}`]] : []),
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <FileButton candidateId={open.candidateId} category={kind.category} file={open.generatedDoc} label="Generated letter" className={btn.secondary} />
              {open.signedDoc ? <FileButton candidateId={open.candidateId} category={kind.category} file={open.signedDoc} label="Signed copy" className={btn.secondary} /> : null}
              <Link to={`../candidates/${open.candidateId}`} className={btn.secondary}>
                <UserRound className="h-3.5 w-3.5" /> Candidate
              </Link>
            </div>

            {canAct ? (
              <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
                {kindKey === "offer" ? (
                  <>
                    {open.status !== "draft" && !open.generatedDoc && ["generated", "sent", "viewed"].includes(open.status) ? (
                      <button type="button" className={btn.primary} onClick={() => runAction(() => prepareOfferLetter(open.id), "Offer letter ready")}>
                        <FileSignature className="h-3.5 w-3.5" /> Prepare letter
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
                ) : (
                  <>
                    {!open.generatedDoc && ["generated", "sent", "viewed"].includes(open.status) ? (
                      <button type="button" className={btn.primary} onClick={() => runAction(() => prepareAppointmentLetter(open.id), "Appointment letter ready")}>
                        <FileSignature className="h-3.5 w-3.5" /> Prepare letter
                      </button>
                    ) : null}
                    {["generated", "sent", "viewed"].includes(open.status) && open.generatedDoc ? (
                      <button type="button" className={btn.primary} onClick={() => setModal({ name: "email", templateKey: "appointment_letter" })}>
                        <Send className="h-3.5 w-3.5" /> {open.status === "generated" ? "Send letter" : "Resend letter"}
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

      {open ? (
        <>
          <SendEmailModal
            open={modal?.name === "email"}
            candidate={{ id: open.candidateId, name: open.candidateName, email: open.candidateEmail }}
            templateKey={modal?.templateKey}
            relatedId={open.id}
            onClose={close}
          />
          <OfferResponseModal open={modal?.name === "response"} offer={open} onClose={close} />
          <UploadModal
            open={modal?.name === "upload"}
            kind={modal?.kind}
            offer={kindKey === "offer" ? open : null}
            appointment={kindKey === "appointment" ? open : null}
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

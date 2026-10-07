import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, FileText, Upload, XCircle } from "lucide-react";
import { apiUrl } from "../../../lib/apiBase";
import { appointmentStatusMeta, documentStatusMeta, offerStatusMeta } from "./recruitmentConfig";
import { Card, DetailGrid, StatusPill, btn, fmtDate, fmtMoney, textareaClass } from "./RecruitmentUi";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";

async function portalRequest(token, path = "", options = {}) {
  const res = await fetch(apiUrl(`/api/recruitment-portal/${encodeURIComponent(token)}${path}`), options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new Error(body?.message || "Something went wrong. Please try again.");
  return body;
}

export default function CandidatePortalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    portalRequest(token)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-surface-sunken px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {loading ? (
          <p className="text-center text-sm text-ink-muted">Loading…</p>
        ) : error ? (
          <Card title="Link unavailable">
            <p className="text-sm text-ink-secondary">{error}</p>
          </Card>
        ) : data ? (
          <PortalBody token={token} data={data} onChange={setData} />
        ) : null}
      </div>
    </div>
  );
}

function PortalBody({ token, data, onChange }) {
  const letterHref = apiUrl(`/api/recruitment-portal/${encodeURIComponent(token)}/letter`);
  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{data.companyName || "Recruitment"}</p>
        <h1 className="text-xl font-semibold text-ink">Hello {data.candidateName}</h1>
        {data.expiresAt ? <p className="text-xs text-ink-muted">This link is valid until {fmtDate(data.expiresAt)}.</p> : null}
      </header>

      {data.closed ? (
        <Card title="Application closed">
          <p className="text-sm text-ink-secondary">This application is no longer active. Please contact the recruitment team if you have any questions.</p>
        </Card>
      ) : null}

      {data.offer ? <OfferSection token={token} offer={data.offer} closed={data.closed} letterHref={letterHref} onChange={onChange} /> : null}
      {data.appointment ? <AppointmentSection token={token} appointment={data.appointment} closed={data.closed} letterHref={letterHref} onChange={onChange} /> : null}
      {Array.isArray(data.documents) ? <DocumentsSection token={token} documents={data.documents} open={data.documentsOpen} onChange={onChange} /> : null}
    </>
  );
}

function useUpload(token, onChange) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);
  const upload = useCallback(
    async (kind, file, documentKey) => {
      if (!file) return;
      setBusy(documentKey || kind);
      setMessage(null);
      try {
        const form = new FormData();
        form.append("kind", kind);
        if (documentKey) form.append("documentKey", documentKey);
        form.append("fileName", file.name);
        form.append("file", file);
        onChange(await portalRequest(token, "/upload", { method: "POST", body: form }));
        setMessage({ tone: "success", text: "Thank you — your file was uploaded." });
      } catch (e) {
        setMessage({ tone: "error", text: e.message });
      } finally {
        setBusy("");
      }
    },
    [token, onChange]
  );
  return { busy, message, upload };
}

function UploadButton({ label, busy, onFile }) {
  const ref = useRef(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          onFile(f);
        }}
      />
      <button type="button" className={btn.secondary} disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : label}
      </button>
    </>
  );
}

function Notice({ message }) {
  if (!message) return null;
  return <p className={`text-xs ${message.tone === "error" ? "text-critical" : "text-success"}`}>{message.text}</p>;
}

function OfferSection({ token, offer, closed, letterHref, onChange }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const { busy: uploading, message, upload } = useUpload(token, onChange);
  const canRespond = !closed && ["sent", "viewed"].includes(offer.status);

  const respond = async (response) => {
    if (response === "declined" && !window.confirm("Are you sure you want to decline this offer?")) return;
    setBusy(response);
    setError("");
    try {
      onChange(await portalRequest(token, "/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response, note }) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Card title={`Offer of employment · ${offer.ref}`} right={<StatusPill meta={offerStatusMeta(offer.status)} />}>
      <div className="space-y-4">
        <DetailGrid
          items={[
            ["Position", offer.designation],
            ["Department", offer.department],
            ["Location", offer.location],
            ["Monthly gross", offer.monthlyGross ? fmtMoney(offer.monthlyGross) : "—"],
            ["Annual CTC", offer.annualCtc ? fmtMoney(offer.annualCtc) : "—"],
            ["Joining date", fmtDate(offer.joiningDate)],
            ["Respond by", fmtDate(offer.validUntil)],
          ]}
        />
        {offer.hasLetter ? (
          <a className={btn.secondary} href={letterHref} target="_blank" rel="noopener noreferrer">
            <FileText className="h-3.5 w-3.5" /> View offer letter
          </a>
        ) : null}

        {canRespond ? (
          <div className="space-y-2 border-t border-divider pt-4">
            <label className="block text-xs font-medium text-ink-secondary" htmlFor="portal-note">
              Message to the recruitment team (optional)
            </label>
            <textarea id="portal-note" className={textareaClass} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            {error ? <p className="text-xs text-critical">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.primary} disabled={!!busy} onClick={() => respond("accepted")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {busy === "accepted" ? "Saving…" : "Accept offer"}
              </button>
              <button type="button" className={btn.danger} disabled={!!busy} onClick={() => respond("declined")}>
                <XCircle className="h-3.5 w-3.5" /> {busy === "declined" ? "Saving…" : "Decline"}
              </button>
            </div>
          </div>
        ) : null}

        {offer.status === "accepted" ? (
          <div className="space-y-2 border-t border-divider pt-4">
            <p className="text-sm text-ink-secondary">
              {offer.hasSignedCopy ? "We have received your signed offer letter. You can upload a newer copy if needed." : "Thank you for accepting. Please upload a signed copy of the offer letter."}
            </p>
            {!closed ? <UploadButton label="Upload signed offer" busy={!!uploading} onFile={(f) => upload("offer_signed", f)} /> : null}
            <Notice message={message} />
          </div>
        ) : null}

        {offer.status === "declined" ? <p className="text-sm text-ink-secondary">You have declined this offer. Thank you for letting us know.</p> : null}
        {["expired", "withdrawn"].includes(offer.status) ? <p className="text-sm text-ink-secondary">This offer is no longer open.</p> : null}
      </div>
    </Card>
  );
}

function AppointmentSection({ token, appointment, closed, letterHref, onChange }) {
  const { busy, message, upload } = useUpload(token, onChange);
  const canSign = !closed && ["generated", "sent", "viewed"].includes(appointment.status);
  return (
    <Card title={`Appointment letter · ${appointment.ref}`} right={<StatusPill meta={appointmentStatusMeta(appointment.status)} />}>
      <div className="space-y-4">
        <DetailGrid
          items={[
            ["Position", appointment.designation],
            ["Location", appointment.location],
            ["Joining date", fmtDate(appointment.joiningDate)],
            ["Signed on", appointment.signedAt ? fmtDate(appointment.signedAt) : "—"],
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {appointment.hasLetter ? (
            <a className={btn.secondary} href={letterHref} target="_blank" rel="noopener noreferrer">
              <FileText className="h-3.5 w-3.5" /> View appointment letter
            </a>
          ) : null}
          {canSign ? <UploadButton label="Upload signed letter" busy={!!busy} onFile={(f) => upload("appointment_signed", f)} /> : null}
        </div>
        {appointment.status === "cancelled" ? <p className="text-sm text-ink-secondary">This appointment letter has been withdrawn.</p> : null}
        <Notice message={message} />
      </div>
    </Card>
  );
}

function DocumentsSection({ token, documents, open, onChange }) {
  const { busy, message, upload } = useUpload(token, onChange);
  return (
    <Card title="Joining documents">
      <div className="space-y-3">
        {!open ? <p className="text-xs text-ink-muted">Document uploads will open once your appointment letter is signed.</p> : null}
        {documents.length ? (
          <ul className="divide-y divide-divider">
            {documents.map((d) => {
              const canUpload = open && ["pending", "submitted", "rejected"].includes(d.status);
              return (
                <li key={d.key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {d.label}
                      {d.required ? <span className="ml-1 text-critical">*</span> : null}
                    </p>
                    {d.description ? <p className="text-[11px] text-ink-muted">{d.description}</p> : null}
                    {d.status === "rejected" && d.rejectionReason ? <p className="text-[11px] text-critical">Please re-upload: {d.rejectionReason}</p> : null}
                  </div>
                  <StatusPill meta={documentStatusMeta(d.status)} size="xs" />
                  {canUpload ? <UploadButton label={d.status === "pending" ? "Upload" : "Replace"} busy={busy === d.key} onFile={(f) => upload("document", f, d.key)} /> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-secondary">No documents are required at this time.</p>
        )}
        <p className="text-[11px] text-ink-muted">Accepted formats: PDF, JPG, PNG, WEBP or Word (max 25 MB). Items marked * are mandatory.</p>
        <Notice message={message} />
      </div>
    </Card>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Send, Upload, X } from "lucide-react";
import { SectionCard, StatusChip } from "../../../components/erpUi";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import { toast } from "../../../lib/toast";
import {
  employeeDocumentStatusMeta,
  getEmployeeDocumentFileUrl,
  listEmployeeDocumentSenders,
  listEmployeeDocuments,
  reviewEmployeeDocument,
  seedEmployeeDocuments,
  sendEmployeeDocumentUploadLink,
  submitEmployeeDocument,
} from "../../../lib/adminEmployeeDocuments";
import EmployeeAssignedPoliciesPanel from "./EmployeeAssignedPoliciesPanel";

function statusSeverity(tone) {
  if (tone === "success") return "info";
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  return "neutral";
}

function Modal({ open, title, description, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-xl">
        <div className="border-b border-divider px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-0.5 text-[11px] text-ink-muted">{description}</p> : null}
        </div>
        <div className="space-y-3 px-4 py-3">{children}</div>
        <div className="flex justify-end gap-2 border-t border-divider px-4 py-3">{footer}</div>
        <button type="button" className="sr-only" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function SendUploadLinkModal({ open, employee, onClose, onSent }) {
  const [to, setTo] = useState("");
  const [senderMail, setSenderMail] = useState("");
  const [senders, setSenders] = useState([]);
  const [validDays, setValidDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTo(String(employee?.email_id || "").trim());
    setValidDays(14);
    setError("");
    setBusy(false);
    listEmployeeDocumentSenders()
      .then((rows) => {
        setSenders(rows);
        setSenderMail(rows[0]?.mail || "");
      })
      .catch((err) => {
        setSenders([]);
        setError(err.message);
      });
  }, [open, employee]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await sendEmployeeDocumentUploadLink({
        employeeMasterId: employee.id,
        to: to.trim(),
        senderMail,
        validDays,
      });
      toast.success("Document upload link sent.");
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.message || "Could not send the link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Send document upload link"
      description="Emails a secure link so the employee can upload required documents."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-row-hover"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-deep disabled:opacity-50"
            disabled={busy || !to.trim().includes("@")}
            onClick={submit}
          >
            <Send className="h-3.5 w-3.5" />
            {busy ? "Sending…" : "Send link"}
          </button>
        </>
      }
    >
      <label className="block text-xs font-medium text-ink-secondary">
        To *
        <input
          type="email"
          className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          autoFocus
        />
      </label>
      <label className="block text-xs font-medium text-ink-secondary">
        From
        <select
          className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm"
          value={senderMail}
          onChange={(e) => setSenderMail(e.target.value)}
        >
          {senders.length ? (
            senders.map((s) => (
              <option key={s.mail} value={s.mail}>
                {s.name ? `${s.name} <${s.mail}>` : s.mail}
              </option>
            ))
          ) : (
            <option value="">No mailbox available</option>
          )}
        </select>
      </label>
      <label className="block text-xs font-medium text-ink-secondary">
        Link valid for (days)
        <input
          type="number"
          min={1}
          max={60}
          className="mt-1 h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm"
          value={validDays}
          onChange={(e) => setValidDays(Number(e.target.value) || 14)}
        />
      </label>
      {error ? <p className="text-xs text-critical">{error}</p> : null}
    </Modal>
  );
}

function UploadModal({ open, employeeId, document, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  if (!open || !document) return null;
  return (
    <Modal
      open={open}
      title={`${document.status === "pending" ? "Upload" : "Replace"} · ${document.docLabel}`}
      description="PDF, JPG, PNG, WEBP or Word (max 25 MB)."
      onClose={onClose}
      footer={
        <button
          type="button"
          className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-row-hover"
          onClick={onClose}
          disabled={busy}
        >
          Close
        </button>
      }
    >
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            await submitEmployeeDocument(employeeId, document.docKey, file);
            toast.success(`${document.docLabel} uploaded`);
            onDone?.();
            onClose();
          } catch (err) {
            toast.error(err.message || "Upload failed.");
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy ? <p className="text-xs text-ink-muted">Uploading…</p> : null}
    </Modal>
  );
}

function DocumentChecklist({ employeeId, documents, onChanged }) {
  const [upload, setUpload] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [openingId, setOpeningId] = useState("");

  const review = async (doc, action, why) => {
    try {
      await reviewEmployeeDocument(doc.id, action, why, doc.version);
      toast.success(action === "verify" ? `${doc.docLabel} verified` : action === "reject" ? `${doc.docLabel} rejected` : "Review started");
      onChanged?.();
      return true;
    } catch (err) {
      toast.error(err.message || "Could not update document");
      return false;
    }
  };

  const openFile = async (doc) => {
    if (!doc?.file?.objectKey) {
      toast.warning("No file is attached yet.");
      return;
    }
    setOpeningId(doc.id);
    try {
      const url = await getEmployeeDocumentFileUrl(employeeId, doc.file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err.message || "Could not open the file.");
    } finally {
      setOpeningId("");
    }
  };

  return (
    <>
      <ul className="divide-y divide-divider rounded-lg border border-border">
        {documents.map((d) => {
          const meta = employeeDocumentStatusMeta(d.status);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-ink">
                  {d.docLabel} {d.required ? null : <span className="text-[10px] text-ink-muted">(optional)</span>}
                </span>
                <span className="block text-[11px] text-ink-muted">
                  {d.submittedOn
                    ? `Submitted ${formatDateDdMmYyyy(d.submittedOn)}${d.submittedVia === "employee_link" ? " by employee" : ""}`
                    : "Not uploaded"}
                  {d.reviewedBy ? ` · reviewed by ${d.reviewedBy}` : ""}
                </span>
                {d.status === "rejected" && d.remarks ? <span className="block text-[11px] text-critical">{d.remarks}</span> : null}
              </span>
              <StatusChip label={meta.label} severity={statusSeverity(meta.tone)} />
              <button
                type="button"
                className="h-7 rounded-lg border border-border px-2.5 text-[11px] font-medium hover:bg-row-hover disabled:opacity-50"
                disabled={!d.file || openingId === d.id}
                onClick={() => openFile(d)}
              >
                {openingId === d.id ? "Opening…" : "View"}
              </button>
              <span className="flex flex-wrap gap-1">
                {["pending", "rejected", "submitted", "under_review", "verified"].includes(d.status) ? (
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-medium hover:bg-row-hover"
                    onClick={() => setUpload(d)}
                    title={
                      d.status === "verified"
                        ? "Replace verified file (employee upload link cannot change it)"
                        : undefined
                    }
                  >
                    <Upload className="h-3.5 w-3.5" /> {d.status === "pending" ? "Upload" : "Replace"}
                  </button>
                ) : null}
                {d.status === "submitted" ? (
                  <button
                    type="button"
                    className="h-7 rounded-lg border border-border px-2.5 text-[11px] font-medium hover:bg-row-hover"
                    onClick={() => review(d, "start_review")}
                  >
                    Start review
                  </button>
                ) : null}
                {["submitted", "under_review"].includes(d.status) ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-medium hover:bg-row-hover"
                      onClick={() => review(d, "verify")}
                    >
                      <Check className="h-3.5 w-3.5" /> Verify
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-medium hover:bg-row-hover"
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
            </li>
          );
        })}
      </ul>

      <UploadModal open={Boolean(upload)} employeeId={employeeId} document={upload} onClose={() => setUpload(null)} onDone={onChanged} />

      <Modal
        open={Boolean(rejecting)}
        title={`Reject ${rejecting?.docLabel || "document"}`}
        description="The employee is asked to resubmit with this reason."
        onClose={() => setRejecting(null)}
        footer={
          <>
            <button
              type="button"
              className="h-8 rounded-lg border border-border px-3 text-xs font-medium hover:bg-row-hover"
              onClick={() => setRejecting(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-8 rounded-lg bg-critical px-3 text-xs font-medium text-white disabled:opacity-50"
              disabled={!reason.trim()}
              onClick={async () => {
                const ok = await review(rejecting, "reject", reason.trim());
                if (ok) setRejecting(null);
              }}
            >
              Reject
            </button>
          </>
        }
      >
        <label className="block text-xs font-medium text-ink-secondary">
          Reason *
          <textarea
            className="mt-1 min-h-[80px] w-full rounded-lg border border-border px-2.5 py-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </label>
      </Modal>
    </>
  );
}

export default function EmployeeMasterDocumentsPanel({ employee }) {
  const employeeId = employee?.id;
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) {
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setDocs(await listEmployeeDocuments(employeeId));
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not load documents.");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const required = docs.filter((d) => d.required);
    return {
      verified: required.filter((d) => d.status === "verified").length,
      total: required.length,
      review: docs.filter((d) => ["submitted", "under_review"].includes(d.status)).length,
      pending: docs.filter((d) => d.status === "pending").length,
    };
  }, [docs]);

  const startCollection = async () => {
    setSeeding(true);
    try {
      await seedEmployeeDocuments(employeeId);
      toast.success("Document checklist ready.");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not start document collection.");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Joining / KYC documents"
        right={
          <div className="flex flex-wrap items-center gap-2">
            {!docs.length ? (
              <button
                type="button"
                className="h-7 rounded-lg border border-border px-2.5 text-[11px] font-medium hover:bg-row-hover disabled:opacity-50"
                disabled={seeding || !employeeId}
                onClick={startCollection}
              >
                {seeding ? "Starting…" : "Start checklist"}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-white hover:bg-accent-deep disabled:opacity-50"
              disabled={!employeeId}
              onClick={() => setSendOpen(true)}
            >
              <Send className="h-3.5 w-3.5" /> Send upload link
            </button>
          </div>
        }
      >
        {error ? (
          <p className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm text-ink-secondary">Loading documents…</p>
        ) : !docs.length ? (
          <p className="text-sm text-ink-secondary">
            No document checklist yet. Start the checklist or send an upload link to create the required document list for this employee.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-ink-muted">
              {summary.verified} of {summary.total} required documents verified
              {summary.review ? ` · ${summary.review} need review` : ""}
              {summary.pending ? ` · ${summary.pending} awaiting upload` : ""}
            </p>
            <DocumentChecklist employeeId={employeeId} documents={docs} onChanged={load} />
          </div>
        )}
      </SectionCard>

      <EmployeeAssignedPoliciesPanel employeeId={employeeId} />

      <SendUploadLinkModal open={sendOpen} employee={employee} onClose={() => setSendOpen(false)} onSent={load} />
    </div>
  );
}

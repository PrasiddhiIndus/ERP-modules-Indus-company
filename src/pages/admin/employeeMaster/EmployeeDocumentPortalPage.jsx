import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Upload } from "lucide-react";
import { apiUrl, humanizeApiErrorMessage } from "../../../lib/apiBase";
import { employeeDocumentStatusMeta } from "../../../lib/adminEmployeeDocuments";
import { StatusChip } from "../../../components/erpUi";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";

function preferApexPortalHost() {
  if (typeof window === "undefined") return false;
  const { hostname, pathname, search, hash } = window.location;
  if (hostname.toLowerCase() !== "www.indus-erp.in") return false;
  window.location.replace(`https://indus-erp.in${pathname}${search}${hash}`);
  return true;
}

async function portalRequest(token, path = "", options = {}) {
  let res;
  try {
    res = await fetch(apiUrl(`/api/employee-document-portal/${encodeURIComponent(token)}${path}`), options);
  } catch (err) {
    throw new Error(humanizeApiErrorMessage(err, "Could not reach the server. Check your connection and try again."));
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("This file is too large for the server. Please upload a smaller file (under 25 MB).");
    }
    throw new Error(
      humanizeApiErrorMessage(body?.message || body?.error, "Something went wrong. Please try again.")
    );
  }
  return body;
}

function statusSeverity(tone) {
  if (tone === "success") return "info";
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  return "neutral";
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
      <button
        type="button"
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium hover:bg-row-hover disabled:opacity-50"
        onClick={() => ref.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" /> {busy ? "Uploading…" : label}
      </button>
    </>
  );
}

/** Public employee document upload UI (also used from /r/:token when recruitment token is not found). */
export function EmployeeDocumentPortalView({ token, initialData = null }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialData);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (preferApexPortalHost()) return undefined;
    if (initialData) {
      setData(initialData);
      setLoading(false);
      setError("");
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    portalRequest(token)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(humanizeApiErrorMessage(e, "Something went wrong. Please try again.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, initialData]);

  const upload = useCallback(
    async (file, documentKey) => {
      if (!file || !documentKey) return;
      setBusy(documentKey);
      setMessage(null);
      try {
        const form = new FormData();
        form.append("documentKey", documentKey);
        form.append("fileName", file.name);
        form.append("file", file);
        setData(await portalRequest(token, "/upload", { method: "POST", body: form }));
        setMessage({ tone: "success", text: "Thank you — your file was uploaded." });
      } catch (e) {
        setMessage({ tone: "error", text: e.message });
      } finally {
        setBusy("");
      }
    },
    [token]
  );

  return (
    <div className="min-h-screen bg-surface-sunken px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        {loading ? (
          <p className="text-center text-sm text-ink-muted">Loading…</p>
        ) : error ? (
          <div className="rounded-card border border-border bg-surface p-4 shadow-card">
            <h1 className="text-sm font-semibold text-ink">Link unavailable</h1>
            <p className="mt-1 text-sm text-ink-secondary">{error}</p>
          </div>
        ) : data ? (
          <>
            <header className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{data.companyName || "HR"}</p>
              <h1 className="text-xl font-semibold text-ink">Hello {data.employeeName}</h1>
              {data.employeeCode ? <p className="text-xs text-ink-muted">Employee code {data.employeeCode}</p> : null}
              {data.expiresAt ? (
                <p className="text-xs text-ink-muted">This link is valid until {formatDateDdMmYyyy(data.expiresAt)}.</p>
              ) : null}
            </header>

            <div className="rounded-card border border-border bg-surface p-4 shadow-card">
              <h2 className="text-sm font-semibold text-ink">Required documents</h2>
              <div className="mt-3 space-y-3">
                {Array.isArray(data.documents) && data.documents.length ? (
                  <ul className="divide-y divide-divider">
                    {data.documents.map((d) => {
                      const meta = employeeDocumentStatusMeta(d.status);
                      // Verified docs are locked on the link — only HR can replace in Employee Master.
                      const canUpload =
                        data.documentsOpen &&
                        d.status !== "verified" &&
                        ["pending", "submitted", "rejected"].includes(d.status);
                      return (
                        <li key={d.key} className="flex flex-wrap items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">
                              {d.label}
                              {d.required ? <span className="ml-1 text-critical">*</span> : null}
                            </p>
                            {d.description ? <p className="text-[11px] text-ink-muted">{d.description}</p> : null}
                            {d.status === "rejected" && d.rejectionReason ? (
                              <p className="text-[11px] text-critical">Please re-upload: {d.rejectionReason}</p>
                            ) : null}
                            {d.status === "verified" ? (
                              <p className="text-[11px] text-ink-muted">Verified — contact HR if this file needs to be replaced.</p>
                            ) : null}
                          </div>
                          <StatusChip label={meta.label} severity={statusSeverity(meta.tone)} />
                          {canUpload ? (
                            <UploadButton
                              label={d.status === "pending" ? "Upload" : "Replace"}
                              busy={busy === d.key}
                              onFile={(f) => upload(f, d.key)}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-secondary">No documents are required at this time.</p>
                )}
                <p className="text-[11px] text-ink-muted">
                  Accepted formats: PDF, JPG, PNG, WEBP or Word (max 25 MB). Items marked * are mandatory.
                </p>
                {message ? (
                  <p className={`text-xs ${message.tone === "error" ? "text-critical" : "text-success"}`}>{message.text}</p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function EmployeeDocumentPortalPage() {
  const { token } = useParams();
  return <EmployeeDocumentPortalView token={token} />;
}

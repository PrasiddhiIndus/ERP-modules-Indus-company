import React, { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { FileDown, Loader2, Mail, X } from "lucide-react";

/**
 * Projects PO At Glance: on-screen preview of the exported Word document (same file as Export Word),
 * including every completed signature with its signing date and time.
 * @param {{ open: boolean, onClose: () => void, buildBlob: () => Promise<Blob>, fileName: string, title?: string, notice?: { ok: boolean, text: string } | null }} props
 */
export default function PjDocumentPreviewModal({ open, onClose, buildBlob, fileName, title = "Signed PO preview", notice = null }) {
  const hostRef = useRef(null);
  const [blob, setBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    setBlob(null);
    (async () => {
      try {
        const [b, { renderAsync }] = await Promise.all([buildBlob(), import("docx-preview")]);
        if (!alive) return;
        setBlob(b);
        if (hostRef.current) {
          hostRef.current.innerHTML = "";
          await renderAsync(b, hostRef.current, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true });
        }
      } catch (e) {
        console.error("[PO At Glance] document preview", e);
        if (alive) setError("Could not build the document preview. You can still use Export Word.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the dialog opens
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!blob}
              onClick={() => blob && saveAs(blob, fileName)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" /> Download Word
            </button>
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {notice && (
          <p className={`flex items-center gap-1.5 border-b px-4 py-2 text-xs ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
            <Mail className="h-3.5 w-3.5 shrink-0" /> {notice.text}
          </p>
        )}
        <div className="min-h-[16rem] flex-1 overflow-auto bg-slate-100 p-3">
          {loading && (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing the document…
            </p>
          )}
          {error && <p className="py-16 text-center text-sm text-amber-800">{error}</p>}
          <div ref={hostRef} className={loading || error ? "hidden" : ""} />
        </div>
      </div>
    </div>
  );
}

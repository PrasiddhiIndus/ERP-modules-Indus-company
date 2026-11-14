/**
 * "My signature" upload / replace / remove — ported from Indus One
 * `components/SignatureSection.tsx` (same Edge Functions, same layout and copy).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, Replace, Trash2, Upload } from "lucide-react";
import { toast } from "../../../lib/toast";
import {
  assertSignatureFileSafe,
  deleteMySignature,
  fetchMySignatureMeta,
  fetchMySignaturePreviewUrl,
  revokeSignaturePreview,
  SIGNATURE_ACCEPT,
  uploadMySignature,
} from "./probationSignatureApi";
import { t } from "./probationStrings";
import { confirmDialog } from "../../../lib/dialog";

export default function SignatureSection({ enabled }) {
  const inputRef = useRef(null);
  const pendingObjectUrlRef = useRef(null);
  const [meta, setMeta] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const clearPending = useCallback(() => {
    if (pendingObjectUrlRef.current) {
      URL.revokeObjectURL(pendingObjectUrlRef.current);
      pendingObjectUrlRef.current = null;
    }
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setAuthorized(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setMeta(null);
      setPreviewUrl(null);
      clearPending();
      return;
    }
    setLoading(true);
    try {
      const nextMeta = await fetchMySignatureMeta();
      setMeta(nextMeta);
      if (nextMeta.has_signature) {
        setPreviewUrl(await fetchMySignaturePreviewUrl());
      } else {
        revokeSignaturePreview();
        setPreviewUrl(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"));
      setMeta({ has_signature: false });
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  }, [clearPending, enabled]);

  useEffect(() => {
    void load();
    return () => {
      revokeSignaturePreview();
      if (pendingObjectUrlRef.current) {
        URL.revokeObjectURL(pendingObjectUrlRef.current);
        pendingObjectUrlRef.current = null;
      }
    };
  }, [load]);

  const onPickFile = async (file) => {
    if (!file || busy) return;
    try {
      await assertSignatureFileSafe(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (pendingObjectUrlRef.current) URL.revokeObjectURL(pendingObjectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    pendingObjectUrlRef.current = objectUrl;
    setPendingFile(file);
    setPendingPreviewUrl(objectUrl);
    setAuthorized(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onSave = async () => {
    if (!pendingFile || busy || !authorized) return;
    setBusy(true);
    try {
      const next = await uploadMySignature(pendingFile);
      clearPending();
      setMeta(next);
      setPreviewUrl(await fetchMySignaturePreviewUrl());
      toast.success(t("signature.updated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (busy || !meta?.has_signature || pendingFile) return;
    if (!(await confirmDialog({ title: "Remove signature", message: t("signature.removeConfirm"), confirmLabel: "Remove", tone: "danger" }))) return;
    setBusy(true);
    try {
      await deleteMySignature();
      setMeta({ has_signature: false });
      setPreviewUrl(null);
      toast.success(t("signature.removed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const updatedLabel =
    meta?.updated_at &&
    !pendingFile &&
    t("signature.updatedAt", {
      time: new Date(meta.updated_at).toLocaleString("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });

  const displayUrl = pendingPreviewUrl || previewUrl;
  const isPending = Boolean(pendingFile && pendingPreviewUrl);

  return (
    <section className="rounded-[14px] border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50">
          <PenLine className="h-5 w-5 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">{t("signature.title")}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{t("signature.hint")}</p>

          <div className="mt-4 overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50">
            {loading ? (
              <div className="flex h-36 items-center justify-center text-sm text-slate-500">
                {t("signature.loading")}
              </div>
            ) : displayUrl ? (
              <div className="flex h-36 flex-col items-center justify-center gap-1 bg-[repeating-conic-gradient(#f8fafc_0%_25%,#e2e8f0_0%_50%)] bg-[length:16px_16px] p-3">
                {isPending ? (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {t("signature.uploadPreviewLabel")}
                  </p>
                ) : null}
                <img
                  src={displayUrl}
                  alt={isPending ? t("signature.uploadPreviewAlt") : t("signature.previewAlt")}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-36 flex-col items-center justify-center gap-1 px-4 text-center">
                <Upload className="h-5 w-5 text-slate-400" aria-hidden />
                <p className="text-sm font-medium text-slate-700">{t("signature.emptyTitle")}</p>
                <p className="text-xs text-slate-500">{t("signature.emptyHint")}</p>
              </div>
            )}
          </div>

          {isPending && pendingFile ? (
            <p className="mt-2 truncate text-xs text-slate-500" title={pendingFile.name}>
              {t("signature.selectedFile", {
                name: pendingFile.name,
                size: `${(pendingFile.size / 1024).toFixed(1)} KB`,
              })}
            </p>
          ) : null}

          {updatedLabel ? <p className="mt-2 text-xs text-slate-500">{updatedLabel}</p> : null}

          <input
            ref={inputRef}
            type="file"
            accept={SIGNATURE_ACCEPT}
            className="hidden"
            disabled={!enabled || busy}
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />

          {isPending ? (
            <div className="mt-3 space-y-3">
              <label className="flex items-start gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
                  checked={authorized}
                  disabled={busy}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />
                <span>{t("signature.authorizeLabel")}</span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!enabled || busy || !authorized}
                  onClick={() => void onSave()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {busy ? t("signature.uploading") : t("signature.save")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={clearPending}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {t("signature.cancel")}
                </button>
                <button
                  type="button"
                  disabled={!enabled || busy}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Replace className="h-3.5 w-3.5" />
                  {t("signature.chooseDifferent")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!enabled || busy}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent-primary)]/40 bg-white px-3.5 py-2 text-sm font-semibold text-[var(--accent-primary)] shadow-sm hover:bg-[var(--accent-primary-wash)] disabled:opacity-60"
              >
                {meta?.has_signature ? (
                  <>
                    <Replace className="h-3.5 w-3.5" />
                    {t("signature.replace")}
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    {t("signature.upload")}
                  </>
                )}
              </button>
              {meta?.has_signature ? (
                <button
                  type="button"
                  disabled={!enabled || busy}
                  onClick={() => void onRemove()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("signature.remove")}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

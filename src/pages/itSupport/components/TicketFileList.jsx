import React, { useEffect, useState } from "react";
import { Download, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { Modal } from "../../../components/erpUi";

function formatBytes(size) {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(fileOrRow) {
  const type = String(fileOrRow?.type || fileOrRow?.content_type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const name = String(fileOrRow?.name || fileOrRow?.file_name || "").toLowerCase();
  return /\.(jpe?g|png|webp|gif)$/i.test(name);
}

function FileIcon({ image = false }) {
  const Icon = image ? ImageIcon : FileText;
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-sunken text-ink-secondary">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function PendingImageThumb({ file, onOpen }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return undefined;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!url) return <FileIcon image />;
  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded-md border border-border bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onClick={() => onOpen?.(url)}
      title="View image"
    >
      <img src={url} alt="" className="h-24 w-full object-contain" />
    </button>
  );
}

function UploadedImageThumb({ attachment, resolveUrl, onOpen }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl("");
    (async () => {
      if (!resolveUrl) return;
      try {
        const next = await resolveUrl(attachment);
        if (!cancelled && next) setUrl(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment, resolveUrl]);

  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded-md border border-border bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      title={attachment.file_name || "Open image"}
      onClick={() => {
        if (url) onOpen?.(url);
        else onOpen?.(null, attachment);
      }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={attachment.file_name || "Attachment"}
          className="h-24 w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-24 w-full items-center justify-center text-ink-muted">
          <ImageIcon className="h-6 w-6" />
        </span>
      )}
    </button>
  );
}

/**
 * Pending local File objects (Raise Ticket) or uploaded attachment rows (ticket detail).
 */
export default function TicketFileList({
  mode = "pending",
  files = [],
  attachments = [],
  onRemovePending,
  onRemoveUploaded,
  onOpenUploaded,
  resolveAttachmentUrl,
  disabled = false,
}) {
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const openUploaded = async (a, preferredUrl) => {
    if (preferredUrl) {
      if (isImageFile(a)) setLightboxSrc(preferredUrl);
      else window.open(preferredUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (onOpenUploaded) {
      await onOpenUploaded(a, {
        openImage: (url) => setLightboxSrc(url),
      });
      return;
    }
  };

  const lightbox = (
    <Modal
      open={Boolean(lightboxSrc)}
      title="Image"
      onClose={() => setLightboxSrc(null)}
      widthClass="max-w-5xl"
    >
      {lightboxSrc ? (
        <div className="flex min-h-0 items-center justify-center bg-surface-sunken/40 p-1 sm:p-2">
          <img
            src={lightboxSrc}
            alt="Full size"
            className="max-h-[min(80vh,720px)] w-auto max-w-full object-contain rounded-md"
          />
        </div>
      ) : null}
    </Modal>
  );

  if (mode === "pending") {
    if (!files.length) {
      return (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Paperclip className="h-3 w-3 shrink-0" />
          No files selected
        </p>
      );
    }
    const imageFiles = files.map((f, index) => ({ f, index })).filter(({ f }) => isImageFile(f));
    const otherFiles = files.map((f, index) => ({ f, index })).filter(({ f }) => !isImageFile(f));

    return (
      <>
        {imageFiles.length ? (
          <ul className="mb-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {imageFiles.map(({ f, index }) => (
              <li key={`${f.name}-${f.size}-${f.lastModified}-${index}`} className="relative min-w-0">
                <PendingImageThumb file={f} onOpen={setLightboxSrc} />
                <p className="mt-1 truncate text-[10px] text-ink-muted" title={f.name}>
                  {f.name}
                </p>
                <button
                  type="button"
                  disabled={disabled}
                  className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-ink-muted shadow-sm hover:bg-critical-soft hover:text-critical disabled:opacity-50"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onRemovePending?.(index)}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {otherFiles.length ? (
          <ul className="space-y-1.5">
            {otherFiles.map(({ f, index }) => (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}-${index}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
              >
                <FileIcon />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-strong" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-[10px] text-ink-muted">{formatBytes(f.size)}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-ink-muted hover:bg-critical-soft hover:text-critical disabled:opacity-50"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onRemovePending?.(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {lightbox}
      </>
    );
  }

  if (!attachments.length) {
    return <p className="text-xs text-ink-muted">No attachments yet.</p>;
  }

  const imageAtts = attachments.filter(isImageFile);
  const otherAtts = attachments.filter((a) => !isImageFile(a));

  return (
    <>
      {imageAtts.length ? (
        <ul className="mb-2 grid grid-cols-2 gap-2">
          {imageAtts.map((a) => (
            <li key={a.id} className="min-w-0 rounded-md border border-border bg-surface p-1.5">
              <UploadedImageThumb
                attachment={a}
                resolveUrl={resolveAttachmentUrl}
                onOpen={(url) => {
                  if (url) setLightboxSrc(url);
                  else openUploaded(a);
                }}
              />
              <div className="mt-1 flex items-start gap-1">
                <p className="min-w-0 flex-1 truncate text-[10px] font-medium text-ink-strong" title={a.file_name}>
                  {a.file_name || "Image"}
                </p>
                {onRemoveUploaded ? (
                  <button
                    type="button"
                    disabled={disabled}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-ink-muted hover:bg-critical-soft hover:text-critical disabled:opacity-50"
                    aria-label={`Remove ${a.file_name || "file"}`}
                    onClick={() => onRemoveUploaded?.(a)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {otherAtts.length ? (
        <ul className="space-y-1.5">
          {otherAtts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
            >
              <FileIcon />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-xs font-medium text-accent hover:underline"
                  title={a.file_name || "File"}
                  onClick={() => openUploaded(a)}
                >
                  {a.file_name || "File"}
                </button>
                <p className="text-[10px] text-ink-muted">
                  {formatBytes(a.size_bytes)}
                  {a.storage ? ` · ${String(a.storage).toUpperCase()}` : ""}
                  {a.comment_id ? " · on comment" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-medium text-ink-secondary hover:bg-surface-sunken disabled:opacity-50"
                onClick={() => openUploaded(a)}
              >
                <Download className="h-3 w-3" />
                Open
              </button>
              {onRemoveUploaded ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-ink-muted hover:bg-critical-soft hover:text-critical disabled:opacity-50"
                  aria-label={`Remove ${a.file_name || "file"}`}
                  onClick={() => onRemoveUploaded?.(a)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {lightbox}
    </>
  );
}

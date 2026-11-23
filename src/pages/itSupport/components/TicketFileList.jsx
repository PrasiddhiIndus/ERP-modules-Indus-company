import React, { useEffect, useState } from "react";
import { Download, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";

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

function PendingImageThumb({ file }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return undefined;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!url) return <FileIcon image />;
  return (
    <img
      src={url}
      alt=""
      className="h-9 w-9 shrink-0 rounded-md border border-border object-cover bg-surface-sunken"
    />
  );
}

/**
 * Pending local File objects (Raise Ticket) or uploaded attachment rows (ticket detail).
 * @param {{
 *   mode?: 'pending' | 'uploaded',
 *   files?: File[],
 *   attachments?: Array<{id:string,file_name?:string,size_bytes?:number,storage?:string}>,
 *   onRemovePending?: (index:number) => void,
 *   onRemoveUploaded?: (row:object) => void,
 *   onOpenUploaded?: (row:object) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function TicketFileList({
  mode = "pending",
  files = [],
  attachments = [],
  onRemovePending,
  onRemoveUploaded,
  onOpenUploaded,
  disabled = false,
}) {
  if (mode === "pending") {
    if (!files.length) {
      return (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Paperclip className="h-3 w-3 shrink-0" />
          No files selected
        </p>
      );
    }
    return (
      <ul className="space-y-1.5">
        {files.map((f, index) => (
          <li
            key={`${f.name}-${f.size}-${f.lastModified}-${index}`}
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
          >
            {isImageFile(f) ? <PendingImageThumb file={f} /> : <FileIcon />}
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
    );
  }

  if (!attachments.length) {
    return <p className="text-xs text-ink-muted">No attachments yet.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {attachments.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
        >
          <FileIcon image={isImageFile(a)} />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="block max-w-full truncate text-left text-xs font-medium text-accent hover:underline"
              title={a.file_name || "File"}
              onClick={() => onOpenUploaded?.(a)}
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
            onClick={() => onOpenUploaded?.(a)}
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
  );
}

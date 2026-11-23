import React from "react";
import {
  History,
  ImagePlus,
  Lock,
  MessageSquare,
  Paperclip,
  UserRound,
} from "lucide-react";

function formatActivityTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

/**
 * Presentation-only activity feed for a ticket.
 * Does not change event data — only layout / hierarchy / type cues.
 */
export default function TicketActivityTimeline({ items = [], onOpenAttachment }) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-sunken/40 px-4 py-8 text-center">
        <History className="mx-auto mb-2 h-5 w-5 text-ink-muted" />
        <p className="text-xs font-medium text-ink-secondary">No activity yet</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          Comments and status updates will appear here.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative m-0 list-none space-y-0 p-0">
      <span
        className="pointer-events-none absolute bottom-2 left-[15px] top-2 w-px bg-border"
        aria-hidden
      />
      {items.map((it, i) => {
        const isComment = Boolean(it.kind === "comment" || it.commentId);
        const isInternal = Boolean(it.isInternal);
        const files = it.attachments || [];
        const Icon = isInternal ? Lock : isComment ? MessageSquare : History;
        const railTone = isInternal
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : isComment
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : "border-border bg-surface-sunken text-ink-secondary";
        const cardTone = isInternal
          ? "border-amber-100/80 bg-amber-50/40"
          : isComment
            ? "border-border bg-surface"
            : "border-border/80 bg-surface-sunken/30";

        return (
          <li key={`${it.at || "x"}-${it.commentId || i}`} className="relative flex gap-3 pb-4 last:pb-0">
            <span
              className={`relative z-[1] mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${railTone}`}
              aria-hidden
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 ${cardTone}`}>
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isInternal
                      ? "bg-amber-100 text-amber-900"
                      : isComment
                        ? "bg-sky-100 text-sky-900"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {isInternal ? "Internal note" : isComment ? "Comment" : "Update"}
                </span>
                {it.at ? (
                  <time
                    dateTime={it.at}
                    className="text-[11px] tabular-nums text-ink-muted"
                  >
                    {formatActivityTime(it.at)}
                  </time>
                ) : null}
              </div>

              {it.actorLabel ? (
                <p className="mb-1 flex items-center gap-1 text-[11px] text-ink-secondary">
                  <UserRound className="h-3 w-3 shrink-0 text-ink-muted" />
                  <span className="truncate font-medium text-ink">{it.actorLabel}</span>
                </p>
              ) : null}

              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-strong">
                {it.title || "—"}
              </p>

              {files.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                  {files.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium text-accent shadow-sm hover:bg-surface-sunken"
                      title={a.file_name || "Open attachment"}
                      onClick={() => onOpenAttachment?.(a)}
                    >
                      {String(a.content_type || "").startsWith("image/") ||
                      /\.(jpe?g|png|webp|gif)$/i.test(a.file_name || "") ? (
                        <ImagePlus className="h-3 w-3 shrink-0" />
                      ) : (
                        <Paperclip className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{a.file_name || "Attachment"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

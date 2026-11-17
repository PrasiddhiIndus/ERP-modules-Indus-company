import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, Info, X } from "lucide-react";
import { settleDialog, subscribeDialogs } from "../lib/dialog";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function defaultTitle(kind, tone) {
  if (kind === "prompt") return "Enter a value";
  if (kind === "alert") return "Notice";
  return tone === "danger" ? "Are you sure?" : "Please confirm";
}

function ToneIcon({ kind, tone }) {
  if (tone === "danger") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-critical-soft text-critical">
        <AlertTriangle className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  const Icon = kind === "confirm" ? HelpCircle : Info;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

/**
 * Global confirm / prompt / alert dialog — mount once at app root.
 * Driven by confirmDialog / promptDialog / alertDialog in src/lib/dialog.js.
 * Esc cancels, Enter confirms, Tab is trapped inside the dialog.
 */
export default function AppDialogHost() {
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState("");
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => subscribeDialogs(setDialog), []);

  const kind = dialog?.kind;
  const tone = dialog?.tone === "danger" ? "danger" : "primary";

  // Reset input + move focus whenever a new dialog becomes active.
  useEffect(() => {
    if (!dialog) return undefined;
    if (!restoreFocusRef.current && typeof document !== "undefined") {
      restoreFocusRef.current = document.activeElement;
    }
    setValue(dialog.defaultValue == null ? "" : String(dialog.defaultValue));
    const t = window.setTimeout(() => {
      if (dialog.kind === "prompt" && inputRef.current) {
        inputRef.current.focus();
        if (dialog.selectOnOpen !== false) inputRef.current.select?.();
      } else {
        confirmRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [dialog]);

  // Lock page scroll while open; restore focus when the queue empties.
  useEffect(() => {
    if (!dialog) {
      const el = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (el && typeof el.focus === "function" && document.contains(el)) {
        try {
          el.focus();
        } catch {
          // ignore
        }
      }
      return undefined;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [dialog]);

  const cancel = useCallback(() => {
    if (!dialog) return;
    const result = dialog.kind === "confirm" ? false : dialog.kind === "prompt" ? null : undefined;
    settleDialog(dialog.id, result);
  }, [dialog]);

  const accept = useCallback(() => {
    if (!dialog) return;
    const result = dialog.kind === "confirm" ? true : dialog.kind === "prompt" ? value : undefined;
    settleDialog(dialog.id, result);
  }, [dialog, value]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      const tag = e.target?.tagName;
      // Buttons handle Enter themselves (so Enter on "Cancel" cancels); multiline prompts keep newlines.
      if (tag === "BUTTON" || (tag === "TEXTAREA" && dialog?.multiline)) return;
      e.preventDefault();
      e.stopPropagation();
      accept();
      return;
    }
    if (e.key === "Tab" && panelRef.current) {
      const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!dialog) return null;

  const title = dialog.title || defaultTitle(kind, tone);
  const confirmLabel =
    dialog.confirmLabel || (kind === "alert" ? "OK" : kind === "prompt" ? "OK" : tone === "danger" ? "Delete" : "Confirm");
  const cancelLabel = dialog.cancelLabel || "Cancel";
  const confirmClass =
    tone === "danger"
      ? "erp-btn-destructive font-semibold hover:brightness-95"
      : "erp-btn-primary";
  const InputTag = dialog.multiline ? "textarea" : "input";

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center p-3 sm:items-center sm:p-4 erp-overlay-enter"
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-0 bg-scrim" aria-hidden onMouseDown={cancel} />
      <div
        ref={panelRef}
        role={kind === "alert" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={dialog.message ? messageId : undefined}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-card border border-border bg-surface shadow-modal erp-modal-enter"
      >
        <div className="erp-card-header flex items-start gap-3 border-b border-border bg-surface">
          <ToneIcon kind={kind} tone={tone} />
          <h2 id={titleId} className="type-card-title min-w-0 flex-1 self-center text-ink-strong break-words">
            {title}
          </h2>
          <button
            type="button"
            onClick={cancel}
            className="shrink-0 rounded-control p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
            aria-label="Close dialog"
            tabIndex={-1}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="erp-card-body min-h-0 flex-1 space-y-3 overflow-y-auto text-sm [overflow:auto!important]">
          {dialog.message ? (
            <p id={messageId} className="whitespace-pre-line break-words text-ink-secondary">
              {dialog.message}
            </p>
          ) : null}
          {kind === "prompt" ? (
            <label className="block">
              {dialog.label ? (
                <span className="mb-1 block text-xs font-medium text-ink-secondary">{dialog.label}</span>
              ) : null}
              <InputTag
                ref={inputRef}
                type={dialog.multiline ? undefined : "text"}
                rows={dialog.multiline ? 3 : undefined}
                value={value}
                readOnly={Boolean(dialog.readOnly)}
                placeholder={dialog.placeholder || ""}
                onChange={(e) => setValue(e.target.value)}
                aria-label={dialog.label || title}
                className="w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </label>
          ) : null}
        </div>
        <div className="erp-card-header flex flex-col-reverse gap-2 border-t border-border bg-surface-sunken sm:flex-row sm:justify-end">
          {kind !== "alert" ? (
            <button type="button" onClick={cancel} className="erp-btn-secondary h-9 px-4 w-full sm:w-auto">
              {cancelLabel}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            onClick={accept}
            className={`${confirmClass} h-9 px-4 w-full sm:w-auto`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
